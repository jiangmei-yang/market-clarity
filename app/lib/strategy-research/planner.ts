import { baseDsl, traditionalBenchmarks, universePreset } from "./catalog";
import { confirmationHash, validateStrategyDSL } from "./strategy-dsl";
import type { CandidateBudget, FactorId, ResearchGoal, ResearchRounds, StrategyDSL, StrategyPlan, TargetCandidates } from "./types";

function inferGoal(text:string,explicit?:ResearchGoal):ResearchGoal{
  if(explicit)return explicit;
  if(/回撤|少亏|风险|drawdown|lose less|loss|risk/i.test(text))return "lower_drawdown";
  if(/稳定|年份|阶段|stable|stability|consistent|across periods/i.test(text))return "higher_stability";
  if(/换手|频繁|交易成本|少调|turnover|trade less|fewer trades|cost/i.test(text))return "lower_turnover";
  if(/收益|成本后|return|after costs|net performance/i.test(text))return "higher_net_return";
  return "balanced";
}

function inferFactors(text:string,goal:ResearchGoal):Array<{id:FactorId;weight:number;direction:"higher"|"lower"}>{
  const ids:FactorId[]=[];
  if(/强|动量|上涨|走势|strong|strength|momentum|uptrend/i.test(text))ids.push("momentum_60");
  if(/波动|回撤|稳|volatility|drawdown|stable|stability/i.test(text))ids.push("low_volatility_20");
  if(/跌|反弹|反转|超跌|rebound|reversal|fell|decline|oversold/i.test(text))ids.push("reversal_5");
  if(/趋势|均线|trend|moving average/i.test(text))ids.push("trend_ma20_60");
  if(!ids.length){if(goal==="lower_drawdown")ids.push("low_volatility_20");else if(goal==="lower_turnover")ids.push("trend_ma20_60");else ids.push("momentum_60","low_volatility_20");}
  const unique=[...new Set(ids)].slice(0,3);return unique.map(id=>({id,weight:1/unique.length,direction:id==="low_volatility_20"?"lower":"higher"}));
}

const STARTING_POINTS:StrategyPlan["starting_points"]=[
  {id:"low_volatility",name:"低波动策略",summary:"优先选择近期波动较小的一组股票。",why:"最直接对应“回撤不要太大”，规则最少，也最容易解释。"},
  {id:"trend_low_volatility",name:"趋势加低波动",summary:"先要求中期趋势为正，再比较近期波动。",why:"尝试减少逆势阶段，同时保留低波动约束。"},
  {id:"momentum_risk_filter",name:"动量加风险过滤",summary:"比较 60 日走势强度，并排除波动最高的一部分。",why:"在追求相对强势时，限制最极端的历史波动。"},
];

function factorsForStartingPoint(id:string|undefined, fallback:StrategyDSL["factors"]):StrategyDSL["factors"]{
  if(id==="low_volatility")return [{id:"low_volatility_20",weight:1,direction:"lower"}];
  if(id==="trend_low_volatility")return [{id:"trend_ma20_60",weight:.5,direction:"higher"},{id:"low_volatility_20",weight:.5,direction:"lower"}];
  if(id==="momentum_risk_filter")return [{id:"momentum_60",weight:.6,direction:"higher"},{id:"low_volatility_20",weight:.4,direction:"lower"}];
  return fallback;
}

export async function planStrategy(input:{text:string;mode?:"idea"|"goal";goal?:ResearchGoal;aiAvailable?:boolean;startingPointId?:string;universeId?:string;customSymbols?:string[];candidateBudget?:number;maxRounds?:number;targetCandidates?:number;searchMode?:"exhaust_budget"|"stop_on_validation_target";maxPositions?:number;fixedFactors?:StrategyDSL["factors"];fixedFrequency?:"biweekly"|"monthly";fixedDsl?:StrategyDSL}):Promise<StrategyPlan>{
  const text=input.text.trim().slice(0,1000);if(!text)throw new Error("请先描述一个想法或研究目标");
  const preserved=input.fixedDsl?structuredClone(input.fixedDsl):null;if(preserved){const valid=validateStrategyDSL(preserved);if(!valid.valid)throw new Error(`要保留的原规则无效：${valid.errors.join("；")}`);if(preserved.source==="traditional")throw new Error("传统对照不能作为用户原始规则继续编辑");}
  const fixedFactors=preserved?.factors??(input.fixedFactors?.length&&input.fixedFactors.length<=3&&input.fixedFactors.every(item=>["momentum_60","low_volatility_20","reversal_5","trend_ma20_60"].includes(item.id)&&["higher","lower"].includes(item.direction)&&Number.isFinite(item.weight)&&item.weight>0&&item.weight<=1)&&Math.abs(input.fixedFactors.reduce((sum,item)=>sum+item.weight,0)-1)<.001?structuredClone(input.fixedFactors):null);
  const mode=input.mode??"idea";const goal=preserved?.research_goal??inferGoal(text,input.goal);const selectedStart=mode==="goal"?(input.startingPointId??"low_volatility"):undefined;const factors=fixedFactors??factorsForStartingPoint(selectedStart,inferFactors(text,goal));
  const monthly=preserved?preserved.rebalance.frequency==="monthly":input.fixedFrequency?input.fixedFrequency==="monthly":!/两周|双周|半月|two weeks|biweekly|fortnight/i.test(text);const name=preserved?.name??(mode==="goal"?(STARTING_POINTS.find(item=>item.id===selectedStart)?.name??"研究起点"):"你确认的策略");
  const factorText=factors.map(item=>item.id==="momentum_60"?"过去约两个月走势":item.id==="low_volatility_20"?"近期波动":item.id==="reversal_5"?"短期跌幅":"中期趋势").join("和");
  const preset=universePreset(input.universeId);const customRequested=input.customSymbols!==undefined;const requestedSymbols=(input.customSymbols??[]).map(symbol=>symbol.trim());if(customRequested&&requestedSymbols.some(symbol=>!/^\d{6}$/.test(symbol)))throw new Error("自选样本含无效股票代码；请使用搜索结果中的 6 位 A 股代码");const customSymbols=[...new Set(requestedSymbols)];if(customRequested&&customSymbols.length<10)throw new Error(`自选样本只有 ${customSymbols.length} 只；至少选择 10 只后才能进行横截面比较`);if(customRequested&&customSymbols.length>30)throw new Error("自选样本最多 30 只；请先移除部分股票");const custom=customRequested;const universeName=custom?`自选 A 股样本 ${customSymbols.length} 只`:preset.name;const thesis=`${monthly?"每个月":"每两周"}检查一次${universeName}，综合比较${factorText}，等权观察排名靠前的一组股票随后一个持有期的历史表现。`;
  const maxPositions=[4,6,8,12].includes(Number(input.maxPositions))?Number(input.maxPositions):(preserved?.portfolio.max_positions??8);const requestedBudget=Number(input.candidateBudget);const candidateBudget=(Number.isFinite(requestedBudget)?Math.min(2000,Math.max(50,Math.round(requestedBudget/50)*50)):500) as CandidateBudget;const maxRounds=1 as ResearchRounds;const requestedTarget=Number(input.targetCandidates);const targetCandidates=(Number.isFinite(requestedTarget)?Math.min(6,Math.max(1,Math.round(requestedTarget))):2) as TargetCandidates;const searchMode=input.searchMode==="exhaust_budget"?"exhaust_budget" as const:"stop_on_validation_target" as const;
  const defaultCap=Math.min(33,Math.max(10,Math.round(100/maxPositions)));const portfolio=preserved?{...preserved.portfolio,max_positions:maxPositions,max_single_weight_pct:Math.min(33,Math.max(preserved.portfolio.max_single_weight_pct,Math.ceil(100/maxPositions)))}:{selection:"top_quantile" as const,quantile:.25 as const,weighting:"equal" as const,max_positions:maxPositions,max_single_weight_pct:defaultCap};
  const dsl=baseDsl({id:`user-${crypto.randomUUID()}`,name,thesis_plain:thesis,source:preserved?"user":mode==="goal"?"template":"user",factors,research_goal:goal,universe:custom?{mode:"custom",symbols:customSymbols}:{mode:"preset",id:preset.id},portfolio,rebalance:preserved?structuredClone(preserved.rebalance):{frequency:monthly?"monthly":"biweekly",holding_days:monthly?20:10},...(preserved?{filters:structuredClone(preserved.filters),costs:structuredClone(preserved.costs)}:{})} as Partial<StrategyDSL> & Pick<StrategyDSL,"id"|"name"|"thesis_plain"|"source"|"factors"|"research_goal">);
  if(!preserved&&(goal==="lower_drawdown"||selectedStart==="momentum_risk_filter")&&!dsl.filters.some(item=>item.id==="exclude_high_volatility"))dsl.filters.push({id:"exclude_high_volatility",enabled:true});
  if(!preserved&&selectedStart==="trend_low_volatility"&&!dsl.filters.some(item=>item.id==="trend_positive"))dsl.filters.push({id:"trend_positive",enabled:true});
  const dslValidation=validateStrategyDSL(dsl);if(!dslValidation.valid)throw new Error(`调整后的规则无效：${dslValidation.errors.join("；")}`);
  const benchmarks=traditionalBenchmarks(goal,{universe:dsl.universe,portfolio:dsl.portfolio,rebalance:dsl.rebalance,costs:dsl.costs});
  const goalLabel=goal==="lower_drawdown"?"更低最大回撤":goal==="higher_stability"?"跨阶段更稳定":goal==="lower_turnover"?"更低换手":goal==="higher_net_return"?"更高成本后表现":"收益和风险平衡";
  const comparisonGate=/简单持有|等权持有|同股票(?:池|样本)?.{0,6}(?:持有|等权)|simple hold|buy[ -]?and[ -]?hold|equal[ -]?weight/i.test(text)?"goal_relative_equal_weight" as const:"goal_relative_best_traditional" as const;
  const research_settings={candidate_budget:candidateBudget,max_rounds:maxRounds,target_candidates:targetCandidates,search_mode:searchMode,comparison_gate:comparisonGate,locked_slots:6 as const};
  return {plan_id:`plan-${crypto.randomUUID()}`,mode,original_input:text,clarification:text.length<6?"你更在意回撤、稳定性，还是减少频繁调整？":null,dsl,plain_rules:[`股票范围：${universeName}，${custom?"运行时提取公开历史数据":"使用固定合成演示数据"}`,`历史特征：${factorText}`,`选择方式：每期最多等权观察 ${dsl.portfolio.max_positions} 只`,`调整节奏：${monthly?"每月":"每两周"}一次`,`自动方式：一次批量扫描 ${candidateBudget} 组受控参数，再统一做最后检查`,`成本：计入佣金、印花税和滑点`,`主要目标：${goalLabel}`,`固定参照：${comparisonGate==="goal_relative_equal_weight"?"同股票样本等权持有":"按目标表现最好的传统方法"}`],benchmarks,confirmation_hash:await confirmationHash(dsl,goal,research_settings),planner:input.aiAvailable===false?"rule_fallback":"constrained_ai",planning_trace:{template_version:"strategy-planner-v1",mode:input.aiAvailable===false?"rule_fallback":"constrained_ai",provider:null,model:null,attempted_providers:[],latency_ms:0,fallback_reason:input.aiAvailable===false?"not_requested":null,schema_valid:true,usage_status:input.aiAvailable===false?"not_applicable":"not_reported"},warnings:[input.aiAvailable===false?"AI 暂不可用，已使用同一白名单目录的规则模式整理。":"语言模型只负责从白名单中整理规则，不计算或修改回测数字。","修改问题、目标、范围或参数后，本次确认和旧结果立即失效。"],starting_points:mode==="goal"?STARTING_POINTS:[],selected_starting_point_id:selectedStart??null,research_settings};
}

export function shortFingerprint(value:string){
  const fnv=(seed:number)=>{let hash=seed>>>0;for(let index=0;index<value.length;index++){hash^=value.charCodeAt(index);hash=Math.imul(hash,16777619)>>>0;}return hash.toString(16).padStart(8,"0");};
  return `${fnv(2166136261)}${fnv(3339675911)}`;
}
export function candidateFingerprint(strategy:StrategyDSL){return shortFingerprint(JSON.stringify({f:strategy.factors,x:strategy.filters.filter(item=>item.enabled).map(item=>item.id).sort(),q:strategy.portfolio.quantile,m:strategy.portfolio.max_positions,r:strategy.rebalance.frequency,c:strategy.costs}));}

export function generateCandidates(plan:StrategyPlan,limit=plan.research_settings.candidate_budget*plan.research_settings.max_rounds):StrategyDSL[]{
  const base=plan.dsl;const definitions:Array<{name:string;thesis:string;factors:StrategyDSL["factors"];filter?:StrategyDSL["filters"][number];frequency?:"biweekly"|"monthly"}>=[
    {name:"你的策略 + 趋势检查",thesis:"保留你确认的逻辑，但只在中期趋势为正时观察，用来检查逆势阶段是否拖累结果。",factors:base.factors,filter:{id:"trend_positive",enabled:true}},
    {name:"你的策略 + 波动上限",thesis:"保留你确认的排序，同时排除近期波动最高的一部分，用来检查回撤是否更可控。",factors:base.factors,filter:{id:"exclude_high_volatility",enabled:true}},
    {name:"动量与低波动平衡",thesis:"同时观察 60 日走势强度和 20 日波动，尝试在相对强势与风险之间取平衡。",factors:[{id:"momentum_60",weight:.5,direction:"higher"},{id:"low_volatility_20",weight:.5,direction:"lower"}]},
    {name:"趋势与低波动",thesis:"先观察中期趋势，再偏向近期波动较小的股票，用来检查跨阶段稳定性。",factors:[{id:"trend_ma20_60",weight:.5,direction:"higher"},{id:"low_volatility_20",weight:.5,direction:"lower"}]},
    {name:"反转与波动约束",thesis:"观察短期跌幅，同时排除最高波动组，用来检查反转是否并非只来自极端风险。",factors:[{id:"reversal_5",weight:.5,direction:"higher"},{id:"low_volatility_20",weight:.5,direction:"lower"}],filter:{id:"exclude_high_volatility",enabled:true}},
    {name:"你的策略 + 较低频调整",thesis:"保留你确认的逻辑但改为月度调整，用来检查更低换手后成本是否更可控。",factors:base.factors,frequency:"monthly"},
    {name:"动量为主、低波动辅助",thesis:"以 60 日走势为主，并给低波动较小权重，检查收益目标是否仍受风险约束。",factors:[{id:"momentum_60",weight:.7,direction:"higher"},{id:"low_volatility_20",weight:.3,direction:"lower"}]},
    {name:"低波动为主、动量辅助",thesis:"以近期低波动为主，少量参考 60 日走势，检查回撤目标是否牺牲过多历史表现。",factors:[{id:"momentum_60",weight:.3,direction:"higher"},{id:"low_volatility_20",weight:.7,direction:"lower"}]},
    {name:"趋势为主、低波动辅助",thesis:"以中期趋势为主，并加入低波动约束，检查趋势与风险之间的取舍。",factors:[{id:"trend_ma20_60",weight:.7,direction:"higher"},{id:"low_volatility_20",weight:.3,direction:"lower"}]},
    {name:"低波动为主、趋势辅助",thesis:"以低波动为主，辅以中期趋势，检查稳定性是否跨阶段延续。",factors:[{id:"trend_ma20_60",weight:.3,direction:"higher"},{id:"low_volatility_20",weight:.7,direction:"lower"}]},
    {name:"短期反转与趋势检查",thesis:"观察短期反转，但只保留中期趋势为正的样本，避免把持续走弱误当作反转。",factors:[{id:"reversal_5",weight:1,direction:"higher"}],filter:{id:"trend_positive",enabled:true}},
    {name:"纯低波动月度",thesis:"只比较近期波动并按月调整，用最简单规则检查回撤目标。",factors:[{id:"low_volatility_20",weight:1,direction:"lower"}],frequency:"monthly"},
    {name:"纯趋势月度",thesis:"只比较中期趋势并按月调整，用来检查复杂组合是否真的必要。",factors:[{id:"trend_ma20_60",weight:1,direction:"higher"}],frequency:"monthly"},
    {name:"动量与趋势一致",thesis:"同时比较 60 日走势与中期趋势，检查两种强势定义一致时的历史表现。",factors:[{id:"momentum_60",weight:.5,direction:"higher"},{id:"trend_ma20_60",weight:.5,direction:"higher"}]},
    {name:"动量反转平衡",thesis:"平衡中期动量与短期反转，检查不同时间尺度是否互相抵消。",factors:[{id:"momentum_60",weight:.5,direction:"higher"},{id:"reversal_5",weight:.5,direction:"higher"}]},
    {name:"反转为主、低波动辅助",thesis:"以短期反转为主，辅以低波动，检查反转结果是否依赖极端风险。",factors:[{id:"reversal_5",weight:.7,direction:"higher"},{id:"low_volatility_20",weight:.3,direction:"lower"}]},
    {name:"低波动为主、反转辅助",thesis:"以低波动为主，少量参考短期反转，检查更保守的历史组合。",factors:[{id:"reversal_5",weight:.3,direction:"higher"},{id:"low_volatility_20",weight:.7,direction:"lower"}]},
    {name:"三项均衡检查",thesis:"等比例观察动量、趋势和低波动，只用于检查多项简单规则是否更稳定。",factors:[{id:"momentum_60",weight:1/3,direction:"higher"},{id:"trend_ma20_60",weight:1/3,direction:"higher"},{id:"low_volatility_20",weight:1/3,direction:"lower"}]},
  ];
  const factorIds:FactorId[]=["momentum_60","low_volatility_20","reversal_5","trend_ma20_60"];
  const direction=(id:FactorId):"higher"|"lower"=>id==="low_volatility_20"?"lower":"higher";
  const factorSets:StrategyDSL["factors"][]=[];
  for(const id of factorIds)factorSets.push([{id,weight:1,direction:direction(id)}]);
  for(let a=0;a<factorIds.length;a++)for(let b=a+1;b<factorIds.length;b++)for(let weight=1;weight<=9;weight++)factorSets.push([{id:factorIds[a],weight:weight/10,direction:direction(factorIds[a])},{id:factorIds[b],weight:(10-weight)/10,direction:direction(factorIds[b])}]);
  for(let a=0;a<factorIds.length;a++)for(let b=a+1;b<factorIds.length;b++)for(let c=b+1;c<factorIds.length;c++)for(let wa=1;wa<=8;wa++)for(let wb=1;wb<=9-wa;wb++){const wc=10-wa-wb;if(wc>0)factorSets.push([{id:factorIds[a],weight:wa/10,direction:direction(factorIds[a])},{id:factorIds[b],weight:wb/10,direction:direction(factorIds[b])},{id:factorIds[c],weight:wc/10,direction:direction(factorIds[c])}]);}
  const filterModes=[{trend:false,volatility:false},{trend:true,volatility:false},{trend:false,volatility:true},{trend:true,volatility:true}];
  const generated=definitions.concat(factorSets.flatMap((factors,factorIndex)=>filterModes.flatMap(filterMode=>(["monthly","biweekly"] as const).flatMap(frequency=>([.2,.25,.33] as const).map(quantile=>({
    name:`参数组合 ${factorIndex+1} · ${frequency==="monthly"?"月度":"双周"}`,
    thesis:`用预先限定的因子权重、${frequency==="monthly"?"月度":"双周"}调整和${filterMode.trend||filterMode.volatility?"风险过滤":"基础过滤"}进行批量历史筛选。`,
    factors,frequency,quantile,filterMode,
  }))))));
  const baseKey=JSON.stringify({f:base.factors,x:base.filters,r:base.rebalance,p:base.portfolio.quantile});const seen=new Set<string>([baseKey]);return generated.flatMap((row,index)=>{
    const grid=row as typeof row&{quantile?:.2|.25|.33;filterMode?:{trend:boolean;volatility:boolean}};
    const filters=grid.filterMode?[...base.filters.filter(item=>item.id!=="trend_positive"&&item.id!=="exclude_high_volatility"),...(grid.filterMode.trend?[{id:"trend_positive" as const,enabled:true}]:[]),...(grid.filterMode.volatility?[{id:"exclude_high_volatility" as const,enabled:true}]:[])]:row.filter?[...base.filters.filter(item=>item.id!==row.filter!.id),row.filter]:base.filters;
    const next:StrategyDSL={...structuredClone(base),id:`ai-grid-${index+1}-${plan.plan_id}`,name:row.name,thesis_plain:row.thesis,source:"constrained_ai",factors:row.factors,filters,portfolio:{...base.portfolio,quantile:grid.quantile??base.portfolio.quantile},rebalance:{frequency:row.frequency??base.rebalance.frequency,holding_days:(row.frequency??base.rebalance.frequency)==="monthly"?20:10}};
    const key=JSON.stringify({f:next.factors,x:next.filters,r:next.rebalance,p:next.portfolio.quantile});if(seen.has(key))return [];seen.add(key);return [next];
  }).slice(0,limit);
}
