import { readUserSnapshot, writeUserSnapshot, type UserSnapshot } from "../user-snapshot";
import { callAIProviderWithFallback, readProviderState } from "../ai-provider-catalog";
import { planStrategy as planLocally } from "./planner";
import { runResearch } from "./research-harness";
import { loadCustomResearchHistory, loadFixedResearchSnapshot, researchDataFingerprint } from "./data-provider";
import { traditionalBenchmarks } from "./catalog";
import { confirmationHash, symbolsFor, validateStrategyDSL } from "./strategy-dsl";
import type { FactorId, ResearchGoal, ResearchRun, SavedResearchStrategy, StrategyDSL, StrategyPlan, StrategyResearchEvidence } from "./types";

type SearchLedger={context_key:string;candidate_fingerprints:string[];tested_count:number;exhausted?:boolean;updated_at:string;sealed?:boolean;sealed_run_id?:string|null};
type LockedReveal={scope_key:string;confirmation_hash:string;run_id:string;data_cutoff:string;revealed_at:string};
type LabSnapshot=UserSnapshot&{strategyResearchRuns?:ResearchRun[];savedResearchStrategies?:SavedResearchStrategy[];strategyResearchAudit?:Array<Record<string,unknown>>;strategyResearchEvidence?:StrategyResearchEvidence[];strategyResearchSearchLedger?:SearchLedger[];strategyResearchLockedReveals?:LockedReveal[]};
async function state():Promise<LabSnapshot>{const saved=await readUserSnapshot();if(saved.status==="unauthorized")throw new Error("请先登录");const snapshot=(saved.status==="ready"?saved.snapshot:{}) as LabSnapshot;return {...snapshot,strategyResearchRuns:Array.isArray(snapshot.strategyResearchRuns)?snapshot.strategyResearchRuns:[],savedResearchStrategies:Array.isArray(snapshot.savedResearchStrategies)?snapshot.savedResearchStrategies:[],strategyResearchAudit:Array.isArray(snapshot.strategyResearchAudit)?snapshot.strategyResearchAudit:[],strategyResearchSearchLedger:Array.isArray(snapshot.strategyResearchSearchLedger)?snapshot.strategyResearchSearchLedger:[],strategyResearchLockedReveals:Array.isArray(snapshot.strategyResearchLockedReveals)?snapshot.strategyResearchLockedReveals:[]};}
const MAX_STORED_RUNS=3;
function sampleAcross<T>(items:T[],limit:number){
  if(items.length<=limit)return items;
  const indices=new Set<number>([0,items.length-1]);
  for(let index=1;index<limit-1;index++)indices.add(Math.round(index*(items.length-1)/(limit-1)));
  return [...indices].sort((a,b)=>a-b).map(index=>items[index]);
}
function compactEquityCurve(points:ResearchRun["evaluations"][number]["equity_curve"]){
  const segments=(['research','validation','locked_test'] as const).flatMap(segment=>sampleAcross(points.filter(point=>point.segment===segment),12));
  return segments.sort((a,b)=>a.date.localeCompare(b.date));
}
export function compactResearchRun(run:ResearchRun):ResearchRun{
  const essential=run.evaluations.filter(item=>item.strategy.source!=="constrained_ai"||item.locked_test!==null);
  return {...run,candidate_fingerprints:[],evaluations:essential.map(item=>({...item,all_periods:[],equity_curve:compactEquityCurve(item.equity_curve),drawdown_curve:sampleAcross(item.drawdown_curve,36)}))};
}
async function writeLabSnapshot(snapshot:LabSnapshot){
  snapshot.strategyResearchRuns=(snapshot.strategyResearchRuns??[]).map(compactResearchRun).slice(0,MAX_STORED_RUNS);
  snapshot.strategyResearchSearchLedger=(snapshot.strategyResearchSearchLedger??[]).map(item=>({...item,candidate_fingerprints:[],tested_count:Math.max(Number(item.tested_count)||0,Array.isArray(item.candidate_fingerprints)?item.candidate_fingerprints.length:0)})).slice(0,6);
  snapshot.strategyResearchLockedReveals=(snapshot.strategyResearchLockedReveals??[]).slice(0,100);
  snapshot.strategyResearchAudit=(snapshot.strategyResearchAudit??[]).slice(0,120);
  snapshot.savedResearchStrategies=(snapshot.savedResearchStrategies??[]).slice(0,60);
  snapshot.strategyResearchEvidence=(snapshot.strategyResearchEvidence??[]).slice(0,30);
  return writeUserSnapshot(snapshot);
}
async function sha256(value:string){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return [...new Uint8Array(digest)].map(item=>item.toString(16).padStart(2,"0")).join("");}
function canonicalResearchContext(plan:StrategyPlan,dataFingerprint:string){const universe={...plan.dsl.universe,symbols:plan.dsl.universe.symbols?[...new Set(plan.dsl.universe.symbols)].sort():undefined};return {universe,data_fingerprint:dataFingerprint,factors:plan.dsl.factors,filters:plan.dsl.filters,portfolio:plan.dsl.portfolio,rebalance:plan.dsl.rebalance,costs:plan.dsl.costs,goal:plan.dsl.research_goal,comparison_gate:plan.research_settings.comparison_gate,engine:"strategy-research-engine-v1",method:"three-stage-harness-v6"};}
export async function searchContextKey(plan:StrategyPlan,dataFingerprint:string){return sha256(JSON.stringify(canonicalResearchContext(plan,dataFingerprint)));}
export async function runContextKey(plan:StrategyPlan,dataFingerprint:string){const searchPolicy={candidate_budget:plan.research_settings.candidate_budget,max_rounds:plan.research_settings.max_rounds,target_candidates:plan.research_settings.target_candidates,search_mode:plan.research_settings.search_mode,locked_slots:plan.research_settings.locked_slots};return sha256(JSON.stringify({...canonicalResearchContext(plan,dataFingerprint),search_policy:searchPolicy}));}
export async function lockedRevealScopeKey(plan:StrategyPlan,dataFingerprint:string){
  return sha256(JSON.stringify({...canonicalResearchContext(plan,dataFingerprint),locked_slots:plan.research_settings.locked_slots}));
}
function strategyHeadline(evaluation:ResearchRun["evaluations"][number]){const role=evaluation.strategy.source==="traditional"?"传统对照":evaluation.strategy.source==="user"||evaluation.strategy.source==="template"?"原始研究对象":null;const status=role??{precheck_rejected:"规则预检未通过",research_rejected:"研究区样本不足",validation_rejected:"验证区未通过",locked_failed:"锁定测试未延续",limited_candidate:"通过本次历史筛选"}[evaluation.status];return `${evaluation.strategy.name}：${status}。${evaluation.reason}`;}

const REVISION_FACTORS:Array<{id:FactorId;pattern:RegExp}>=[
  {id:"momentum_60",pattern:/动量|60\s*日(?:强度|走势)|momentum|60-day strength/i},
  {id:"low_volatility_20",pattern:/低波动|20\s*日(?:低波动|波动)|low volatility/i},
  {id:"reversal_5",pattern:/反转|5\s*日反转|reversal/i},
  {id:"trend_ma20_60",pattern:/中期趋势|趋势均线|medium-term trend|moving average/i},
];
function normalizedFactors(ids:FactorId[]):StrategyDSL["factors"]{const unique=[...new Set(ids)].slice(0,3);return unique.map(id=>({id,weight:1/unique.length,direction:id==="low_volatility_20"?"lower":"higher"}));}
export function mergeStrategyRevision(base:StrategyDSL,text:string):StrategyDSL{
  const next=structuredClone(base);const request=text.trim();const current=next.factors.map(item=>item.id);const mentioned=REVISION_FACTORS.filter(item=>item.pattern.test(request)).map(item=>item.id);
  const remove=(id:FactorId)=>{const label=REVISION_FACTORS.find(item=>item.id===id)?.pattern.source??"";return new RegExp(`(?:不要|去掉|删除|移除|remove|drop)[^，。;]{0,10}(?:${label})|(?:${label})[^，。;]{0,8}(?:不要|去掉|删除|移除|remove|drop)`,"i").test(request);};
  const ids=/只保留|只用|only\s+(?:keep|use)/i.test(request)&&mentioned.length?mentioned.filter(id=>!remove(id)):current.filter(id=>!remove(id));
  for(const id of mentioned)if(!remove(id)&&!ids.includes(id))ids.push(id);
  if(ids.length)next.factors=normalizedFactors(ids);
  if(/每两周|双周|半月|biweekly|every two weeks|fortnight/i.test(request))next.rebalance={frequency:"biweekly",holding_days:10};
  else if(/每月|月度|monthly/i.test(request))next.rebalance={frequency:"monthly",holding_days:20};
  const setFilter=(id:"trend_positive"|"exclude_high_volatility",enabled:boolean)=>{next.filters=next.filters.filter(item=>item.id!==id);if(enabled)next.filters.push({id,enabled:true});};
  if(/(?:不要|去掉|删除|移除|remove|drop)[^，。;]{0,12}(?:趋势过滤|趋势为正|trend filter)/i.test(request))setFilter("trend_positive",false);
  else if(/(?:加入|增加|添加|启用|保留|add|include|enable)[^，。;]{0,12}(?:趋势过滤|趋势为正|trend filter)|(?:趋势过滤|趋势为正|trend filter)/i.test(request))setFilter("trend_positive",true);
  if(/(?:不要|去掉|删除|移除|remove|drop)[^，。;]{0,12}(?:波动过滤|排除最高波动|volatility filter)/i.test(request))setFilter("exclude_high_volatility",false);
  else if(/(?:加入|增加|添加|启用|保留|add|include|enable)[^，。;]{0,12}(?:波动过滤|排除最高波动|volatility filter)|(?:排除最高波动|volatility filter)/i.test(request))setFilter("exclude_high_volatility",true);
  next.id=`user-${crypto.randomUUID()}`;next.source="user";next.thesis_plain=request||base.thesis_plain;
  const valid=validateStrategyDSL(next);if(!valid.valid)throw new Error(`修改后的规则无效：${valid.errors.join("；")}`);return next;
}
export async function planStrategy(input:{text:string;mode?:"idea"|"goal";goal?:ResearchGoal;aiAvailable?:boolean;startingPointId?:string;universeId?:string;customSymbols?:string[];candidateBudget?:number;maxRounds?:number;targetCandidates?:number;searchMode?:"exhaust_budget"|"stop_on_validation_target";maxPositions?:number;baseDsl?:StrategyDSL;fixedFactors?:StrategyPlan["dsl"]["factors"];fixedFrequency?:"biweekly"|"monthly";fixedDsl?:StrategyPlan["dsl"]}){
  const started=Date.now();const revisionDsl=input.baseDsl?mergeStrategyRevision(input.baseDsl,input.text):undefined;const fallback=await planLocally({...input,fixedDsl:revisionDsl??input.fixedDsl,aiAvailable:false});if(input.aiAvailable===false)return fallback;
  try{
    const providerState=await readProviderState();const primary=providerState.providers.find(item=>item.isDefault&&item.enabled&&item.connectionStatus==="available"&&item.providerId!=="mock"&&item.capabilities.quantRule);if(!primary){fallback.planning_trace={...fallback.planning_trace!,latency_ms:Date.now()-started,fallback_reason:"provider_unavailable"};return fallback;}
    const providers=[primary,...providerState.providers.filter(item=>item.providerId!==primary.providerId&&item.providerId!=="mock"&&item.enabled&&item.connectionStatus==="available"&&item.capabilities.quantRule)];
    const response=await callAIProviderWithFallback(providers,[{role:"system",content:"你是受控策略研究规划器，只返回 JSON。允许字段：factor_ids（仅 momentum_60、low_volatility_20、reversal_5、trend_ma20_60，最多3个；如为修改请求，必须返回修改后的完整因子集合）、research_goal（仅 balanced、lower_drawdown、higher_stability、lower_turnover、higher_net_return）、frequency（仅 biweekly、monthly）。不得返回代码、公式、股票名单、买卖信号、收益或目标价。"},{role:"user",content:JSON.stringify(input.baseDsl?{mode:input.mode??"idea",requested_change:input.text.slice(0,1000),current_rule:{factor_ids:input.baseDsl.factors.map(item=>item.id),filters:input.baseDsl.filters.filter(item=>item.enabled).map(item=>item.id),frequency:input.baseDsl.rebalance.frequency,research_goal:input.baseDsl.research_goal}}:{mode:input.mode??"idea",text:input.text.slice(0,1000),preselected_goal:input.goal??null})}],300);
    const parsed=JSON.parse(response.content.match(/\{[\s\S]*\}/)?.[0]??"{}") as {factor_ids?:unknown;research_goal?:unknown;frequency?:unknown};const allowedFactors=new Set<FactorId>(["momentum_60","low_volatility_20","reversal_5","trend_ma20_60"]);const factorIds=Array.isArray(parsed.factor_ids)?[...new Set(parsed.factor_ids.filter((item):item is FactorId=>typeof item==="string"&&allowedFactors.has(item as FactorId)))].slice(0,3):[];if(!factorIds.length){fallback.planning_trace={...fallback.planning_trace!,attempted_providers:response.attempted,latency_ms:Date.now()-started,fallback_reason:"invalid_output",schema_valid:false};return fallback;}
    const goals=new Set<ResearchGoal>(["balanced","lower_drawdown","higher_stability","lower_turnover","higher_net_return"]);const researchGoal=typeof parsed.research_goal==="string"&&goals.has(parsed.research_goal as ResearchGoal)?parsed.research_goal as ResearchGoal:(revisionDsl?.research_goal??input.goal);const factorWords:Record<FactorId,string>={momentum_60:"动量走势",low_volatility_20:"低波动",reversal_5:"短期反转",trend_ma20_60:"趋势均线"};const augmented=`${input.text} ${factorIds.map(id=>factorWords[id]).join(" ")} ${parsed.frequency==="biweekly"?"每两周":parsed.frequency==="monthly"?"每月":""}`;
    const aiDsl=revisionDsl?structuredClone(revisionDsl):undefined;if(aiDsl){aiDsl.factors=normalizedFactors(factorIds);if(parsed.frequency==="biweekly"||parsed.frequency==="monthly")aiDsl.rebalance={frequency:parsed.frequency,holding_days:parsed.frequency==="monthly"?20:10};aiDsl.research_goal=researchGoal??aiDsl.research_goal;}
    const plan=await planLocally({...input,text:augmented,goal:researchGoal,aiAvailable:true,fixedDsl:aiDsl??input.fixedDsl});plan.original_input=input.text;plan.planning_trace={template_version:"strategy-planner-v1",mode:"constrained_ai",provider:response.provider,model:response.model,attempted_providers:response.attempted,latency_ms:Date.now()-started,fallback_reason:null,schema_valid:true,usage_status:"not_reported"};plan.warnings=[`已由 ${response.provider} 的受控语言规划生成白名单候选；模型没有接触价格或锁定测试结果。`,...plan.warnings];return plan;
  }catch{fallback.planning_trace={...fallback.planning_trace!,latency_ms:Date.now()-started,fallback_reason:"provider_error"};return fallback;}
}
export async function executeResearch(input:Parameters<typeof runResearch>[0]){
  const snapshot=await state();
  const symbols=[...symbolsFor(input.plan.dsl)];
  const loadedData=input.data_mode==="live"&&input.plan.dsl.universe.mode==="custom"?await loadCustomResearchHistory(symbols):loadFixedResearchSnapshot({partialSymbols:input.partialSymbols,stale:input.stale,symbols,universeId:input.plan.dsl.universe.id});
  const dataFingerprint=await researchDataFingerprint(loadedData);const contextKey=await searchContextKey(input.plan,dataFingerprint);const exactRunKey=await runContextKey(input.plan,dataFingerprint);const revealScope=await lockedRevealScopeKey(input.plan,dataFingerprint);
  const matchingAudit=(snapshot.strategyResearchAudit??[]).find(item=>item.run_context_key===exactRunKey&&item.search_sealed===true);
  const matchingRunId=typeof matchingAudit?.run_id==="string"?matchingAudit.run_id:null;
  let previous=(snapshot.strategyResearchRuns??[]).find(item=>
    Boolean(item.locked_at)
    && item.data_fingerprint===dataFingerprint
    && (item.confirmation_hash===input.confirmation_hash||item.id===matchingRunId)
  );
  if(!previous){
    for(const item of snapshot.strategyResearchRuns??[]){
      if(!item.locked_at||item.data_fingerprint!==dataFingerprint)continue;
      const original=item.evaluations.find(evaluation=>evaluation.strategy.source==="user"||evaluation.strategy.source==="template");
      if(!original)continue;
      const storedContextKey=await runContextKey({dsl:original.strategy,research_settings:item.research_settings} as StrategyPlan,dataFingerprint);
      if(storedContextKey===exactRunKey){previous=item;break;}
    }
  }
  if(previous)return {...compactResearchRun(previous),reused_previous_run:true,classroom_replay:input.data_mode==="demo"};
  const revealed=(snapshot.strategyResearchLockedReveals??[]).find(item=>item.scope_key===revealScope);
  const ledger=(snapshot.strategyResearchSearchLedger??[]).find(item=>item.context_key===contextKey);
  const classroomReplay=input.data_mode==="demo"&&Boolean(revealed||ledger?.exhausted);
  if(revealed&&!classroomReplay)throw new Error("这段锁定历史已经打开过，不能再用于修改后策略的验收。请等待新的数据截止日，或把本次结果仅作为已揭示历史复盘。");
  if(ledger?.exhausted&&!classroomReplay)throw new Error("允许的候选组合已经全部检查完。请修改股票样本、策略规则或参数范围后再研究，不会重复空跑。");
  const run=await runResearch({...input,loaded_data:loadedData,candidate_offset:classroomReplay?0:ledger?.tested_count??0});run.data_fingerprint=dataFingerprint;run.classroom_replay=classroomReplay;
  const now=new Date().toISOString();
  const testedCount=(ledger?.tested_count??0)+run.candidates_generated;
  const nextLedger:SearchLedger={context_key:contextKey,candidate_fingerprints:[],tested_count:testedCount,exhausted:Boolean(run.candidate_space_exhausted),updated_at:now};
  snapshot.strategyResearchSearchLedger=[nextLedger,...(snapshot.strategyResearchSearchLedger??[]).filter(item=>item.context_key!==contextKey)].slice(0,8);
  snapshot.strategyResearchRuns=[compactResearchRun(run),...(snapshot.strategyResearchRuns??[])].slice(0,MAX_STORED_RUNS);
  if(run.locked_at){const reveal:LockedReveal={scope_key:revealScope,confirmation_hash:run.confirmation_hash,run_id:run.id,data_cutoff:loadedData.audit.data_cutoff,revealed_at:run.locked_at};snapshot.strategyResearchLockedReveals=[reveal,...(snapshot.strategyResearchLockedReveals??[]).filter(item=>item.scope_key!==revealScope)].slice(0,100);}
  snapshot.strategyResearchAudit=[{action:"research_run",run_id:run.id,confirmation_hash:run.confirmation_hash,locked_at:run.locked_at,candidates_tested:run.candidates_generated,candidates_skipped:run.candidates_skipped,search_context_key:contextKey,run_context_key:exactRunKey,search_sealed:Boolean(run.locked_at),candidate_space_exhausted:Boolean(run.candidate_space_exhausted),data_version:loadedData.audit.universe_version,data_cutoff:loadedData.audit.data_cutoff,created_at:run.created_at,planning_trace:run.planning_trace,allow_live_order:false},...(snapshot.strategyResearchAudit??[])].slice(0,200);
  await writeLabSnapshot(snapshot);
  return {...compactResearchRun(run),reused_previous_run:false,classroom_replay:classroomReplay};
}
export async function listResearchState(){const snapshot=await state();return {runs:snapshot.strategyResearchRuns,strategies:snapshot.savedResearchStrategies,audit:snapshot.strategyResearchAudit,evidence:snapshot.strategyResearchEvidence??[]};}
export async function saveResearchStrategy(input:{run_id:string;strategy_id:string;confirmed:boolean;parent_strategy_id?:string|null}){if(!input.confirmed)throw new Error("保存研究策略前必须明确确认");const snapshot=await state();const run=snapshot.strategyResearchRuns?.find(item=>item.id===input.run_id);if(!run)throw new Error("未找到研究记录");const evaluation=run.evaluations.find(item=>item.strategy.id===input.strategy_id);if(!evaluation)throw new Error("未找到本次研究中的策略");const valid=validateStrategyDSL(evaluation.strategy);if(!valid.valid)throw new Error(valid.errors.join("；"));const now=new Date().toISOString();const parent=input.parent_strategy_id?(snapshot.savedResearchStrategies??[]).find(item=>item.id===input.parent_strategy_id):null;if(input.parent_strategy_id&&!parent)throw new Error("父版本不存在或已被删除，请重新从方法库发起复制修改");const source=evaluation.strategy.source==="traditional"?"template":evaluation.strategy.source as SavedResearchStrategy["source"];const metricSegment=evaluation.locked_test??evaluation.validation;const saved:SavedResearchStrategy={id:`saved-${crypto.randomUUID()}`,version:parent?parent.version+1:1,parent_strategy_id:parent?.id??null,name:evaluation.strategy.source==="traditional"?`${evaluation.strategy.name} 研究副本`:evaluation.strategy.name,thesis_plain:evaluation.strategy.thesis_plain,dsl:{...evaluation.strategy,source},source,research_goal:evaluation.strategy.research_goal,comparison_gate:run.research_settings.comparison_gate,universe_snapshot:{universe_name:run.data_audit.universe_name,universe_version:run.data_audit.universe_version,data_cutoff:run.data_audit.data_cutoff,status:run.data_audit.status},cost_assumptions:evaluation.strategy.costs,latest_run_id:run.id,latest_result_summary:{status:run.interpretation.status,headline:strategyHeadline(evaluation),limitation:run.interpretation.limitation},latest_metrics:{segment:evaluation.locked_test?"locked_test":"validation",net_return_pct:metricSegment.net_return_pct,max_drawdown_pct:metricSegment.max_drawdown_pct,turnover_pct:metricSegment.turnover_pct,stability_pct:metricSegment.stability_pct,cost_impact_pct:metricSegment.cost_impact_pct},data_cutoff:run.data_audit.data_cutoff,data_version:run.data_audit.universe_version,data_fingerprint:run.data_fingerprint,engine_version:run.engine_version,method_version:run.method_version,limitations:run.data_audit.limitations,confirmed_at:run.confirmed_at,created_at:now,updated_at:now,research_only:true,allow_live_order:false,locked_test_passed:evaluation.status==="limited_candidate",planning_trace:run.planning_trace};snapshot.savedResearchStrategies=[saved,...(snapshot.savedResearchStrategies??[])].slice(0,60);snapshot.strategyResearchAudit=[{action:"save_strategy",strategy_id:saved.id,version:saved.version,created_at:now},...(snapshot.strategyResearchAudit??[])];await writeLabSnapshot(snapshot);return saved;}
export async function planSavedResearchStrategy(saved:SavedResearchStrategy){const settings={candidate_budget:500 as const,max_rounds:1 as const,target_candidates:2 as const,search_mode:"stop_on_validation_target" as const,comparison_gate:saved.comparison_gate??"goal_relative_best_traditional",locked_slots:6 as const};const dsl=structuredClone(saved.dsl);dsl.source="user";const factorNames:Record<FactorId,string>={momentum_60:"过去约两个月走势",low_volatility_20:"近期波动",reversal_5:"短期跌幅",trend_ma20_60:"中期趋势"};const benchmarks=traditionalBenchmarks(saved.research_goal,{universe:dsl.universe,portfolio:dsl.portfolio,rebalance:dsl.rebalance,costs:dsl.costs});const plan:StrategyPlan={plan_id:`copy-plan-${crypto.randomUUID()}`,mode:"idea",original_input:saved.thesis_plain,clarification:null,dsl,plain_rules:[`股票范围：${saved.universe_snapshot.universe_name}`,`历史特征：${dsl.factors.map(item=>factorNames[item.id]).join(" + ")}`,`选择方式：每期最多等权观察 ${dsl.portfolio.max_positions} 只`,`调整节奏：${dsl.rebalance.frequency==="monthly"?"每月":"每两周"}一次`,`固定参照：${settings.comparison_gate==="goal_relative_equal_weight"?"同股票样本等权持有":"按目标表现最好的传统方法"}`,`成本：佣金 ${dsl.costs.commission_bps}、印花税 ${dsl.costs.stamp_tax_bps}、滑点 ${dsl.costs.slippage_bps} bps`],benchmarks,confirmation_hash:await confirmationHash(dsl,saved.research_goal,settings),planner:"rule_fallback",warnings:["已完整恢复父版本规则；本次把它视为用户复制的研究对象，原始 AI 来源仍由父版本链保留。","修改后必须重新确认，只有最终保存才会写入新版本。"],starting_points:[],selected_starting_point_id:null,research_settings:settings};return plan;}
export async function deleteResearchStrategy(id:string,confirmed:boolean){if(!confirmed)throw new Error("删除策略前必须明确确认");const snapshot=await state();const before=snapshot.savedResearchStrategies?.length??0;snapshot.savedResearchStrategies=(snapshot.savedResearchStrategies??[]).filter(item=>item.id!==id);if(snapshot.savedResearchStrategies.length===before)throw new Error("未找到策略");await writeLabSnapshot(snapshot);return {status:"deleted",id};}

async function runFixedSavedPlan(plan:StrategyPlan,saved:SavedResearchStrategy){const symbols=[...symbolsFor(plan.dsl)];const loadedData=saved.dsl.universe.mode==="custom"?await loadCustomResearchHistory(symbols):loadFixedResearchSnapshot({symbols,universeId:saved.dsl.universe.id});const run=await runResearch({plan,confirmation_hash:plan.confirmation_hash,confirmed:true,data_mode:saved.dsl.universe.mode==="custom"?"live":"demo",loaded_data:loadedData,fixed_only:true});run.data_fingerprint=await researchDataFingerprint(loadedData);return run;}

export async function rerunResearchStrategy(id:string,confirmed:boolean){
  if(!confirmed)throw new Error("重新检验前必须明确确认");const snapshot=await state();const saved=snapshot.savedResearchStrategies?.find(item=>item.id===id);if(!saved)throw new Error("未找到策略");
  const settings={candidate_budget:100 as const,max_rounds:1 as const,target_candidates:1 as const,search_mode:"exhaust_budget" as const,comparison_gate:saved.comparison_gate??"goal_relative_best_traditional",locked_slots:6 as const};const benchmarks=traditionalBenchmarks(saved.research_goal,{universe:saved.dsl.universe,portfolio:saved.dsl.portfolio,rebalance:saved.dsl.rebalance,costs:saved.dsl.costs});const plan:StrategyPlan={plan_id:`rerun-${crypto.randomUUID()}`,mode:"idea",original_input:saved.thesis_plain,clarification:null,dsl:saved.dsl,plain_rules:[],benchmarks,confirmation_hash:await confirmationHash(saved.dsl,saved.research_goal,settings),planner:"rule_fallback",warnings:["按已保存规则及相同股票池、组合、调仓和成本条件重新检验；不会自动修改策略。"],starting_points:[],selected_starting_point_id:null,research_settings:settings};
  const run=await runFixedSavedPlan(plan,saved);const now=new Date().toISOString();const evaluation=run.evaluations.find(item=>item.strategy.id===saved.dsl.id);if(!evaluation)throw new Error("重新检验结果缺少已保存策略");const metricSegment=evaluation.locked_test??evaluation.validation;saved.latest_run_id=run.id;saved.latest_result_summary={status:run.interpretation.status,headline:run.interpretation.headline,limitation:run.interpretation.limitation};saved.latest_metrics={segment:evaluation.locked_test?"locked_test":"validation",net_return_pct:metricSegment.net_return_pct,max_drawdown_pct:metricSegment.max_drawdown_pct,turnover_pct:metricSegment.turnover_pct,stability_pct:metricSegment.stability_pct,cost_impact_pct:metricSegment.cost_impact_pct};saved.data_cutoff=run.data_audit.data_cutoff;saved.data_version=run.data_audit.universe_version;saved.data_fingerprint=run.data_fingerprint;saved.universe_snapshot={universe_name:run.data_audit.universe_name,universe_version:run.data_audit.universe_version,data_cutoff:run.data_audit.data_cutoff,status:run.data_audit.status};saved.updated_at=now;saved.locked_test_passed=evaluation.status==="limited_candidate";snapshot.strategyResearchRuns=[compactResearchRun(run),...(snapshot.strategyResearchRuns??[])].slice(0,MAX_STORED_RUNS);snapshot.strategyResearchAudit=[{action:"rerun_strategy",strategy_id:id,run_id:run.id,created_at:now},...(snapshot.strategyResearchAudit??[])].slice(0,120);await writeLabSnapshot(snapshot);return {strategy:saved,run};
}

export async function attachStrategyResearchEvidence(id:string,confirmed:boolean){
  if(!confirmed)throw new Error("带入决策验证前必须明确确认");const snapshot=await state();const saved=snapshot.savedResearchStrategies?.find(item=>item.id===id);if(!saved)throw new Error("未找到策略");const evidence:StrategyResearchEvidence={id:`evidence-${crypto.randomUUID()}`,strategy_id:saved.id,strategy_version:saved.version,latest_run_id:saved.latest_run_id,strategy_name:saved.name,headline:saved.latest_result_summary.headline,data_cutoff:saved.data_cutoff,attached_at:new Date().toISOString(),limitations:saved.limitations,research_only:true,allow_live_order:false};snapshot.strategyResearchEvidence=[evidence,...(snapshot.strategyResearchEvidence??[]).filter(item=>item.strategy_id!==id)].slice(0,30);snapshot.strategyResearchAudit=[{action:"attach_decision_evidence",strategy_id:id,evidence_id:evidence.id,created_at:evidence.attached_at},...(snapshot.strategyResearchAudit??[])];await writeLabSnapshot(snapshot);return evidence;
}
