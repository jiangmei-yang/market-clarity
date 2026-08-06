"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  Activity, ArrowLeft, ArrowRight, BarChart3, CalendarRange, Check, ChevronDown, Copy,
  Database, History, RotateCcw,
  Filter, Layers3, Lightbulb, LockKeyhole, RotateCw, Play, Plus, Save, Search, ShieldCheck, SlidersHorizontal,
  Sparkles, Target, Trash2, WalletCards, X,
} from "lucide-react";
import { friendlyStrategyName, GOALS, STOCK_SAMPLE, UNIVERSE_PRESETS, universePreset } from "@/app/lib/strategy-research/catalog";
import { createLatestRequestGate } from "@/app/lib/strategy-research/latest-request-gate";
import { presentResearchOutcome } from "@/app/lib/strategy-research/result-presentation";
import type { CandidateBudget, FactorId, ResearchGoal, ResearchRounds, ResearchRun, SavedResearchStrategy, SearchMode, StrategyDSL, StrategyPlan, TargetCandidates } from "@/app/lib/strategy-research/types";
import { confirmationHash, type StrategyGraph, dslToGraph, graphToDsl, normalizeGraph, stableGraphHash, validateStrategyDSL, validateStrategyGraph } from "@/app/lib/strategy-research/strategy-dsl";
import { pick, useI18n } from "@/app/i18n";
import { BacktestPlayback, ComparisonDashboard, CostAndStability, HarnessFlow, ResearchFunnelSummary } from "./research-visuals";

// Migration test anchors: 比较了 {run.candidates_generated} 种改进 · 模拟费用影响 · 固定演示样本 · <ResearchFunnelSummary run={run}/> <BacktestPlayback run={run} compact/>
// Renamed result component anchors: function RetainedCandidates · 每个都单独显示，不是平均结果 · 下面会把 ${kept} 个保留候选全部列出 · 同股票 · 同时间 · 同成本

const ideaExamples=["强势，但别太颠簸","短期跌得多，会不会反弹","每月看一次，少调整"];
const ideaValues=["我觉得最近比较强、但波动不要太大的股票，后面可能更稳。","我想看看短期跌得比较多的股票，之后是不是更容易反弹。","我不想频繁调整，希望一个月看一次。"];
const ideaExamplesEn=["Strong, but less volatile","Could recent losers rebound?","Review monthly, trade less"];
const ideaValuesEn=["I think stocks that have been relatively strong but not too volatile may be more stable afterward.","I want to check whether stocks that recently fell a lot tended to rebound afterward.","I do not want frequent changes. I would rather review the method once a month."];
const goalDefaultEn="I do not have a method yet. I only want the historical results to be more stable.";
const goalLabels:Record<ResearchGoal,string>={balanced:"收益与回撤平衡",lower_drawdown:"最大回撤更小",higher_stability:"不同阶段更稳定",lower_turnover:"换手更少",higher_net_return:"成本后收益更高"};
const goalLabelsEn:Record<ResearchGoal,string>={balanced:"Balance return and risk",lower_drawdown:"Smaller historical drawdowns",higher_stability:"More consistent across periods",lower_turnover:"Fewer portfolio changes",higher_net_return:"Stronger results after costs"};
const startingPointEn={low_volatility:["Low-volatility method","Prefer stocks with lower recent volatility."],trend_low_volatility:["Trend plus low volatility","Require a positive medium-term trend, then compare volatility."],momentum_risk_filter:["Momentum with a risk filter","Compare 60-day strength while excluding the most volatile group."]} as const;
const composerEntryModes=[
  {id:"find", label:"Find my first strategy", zh:"先找第一个方法", description:"Start from a goal and get three research starting points.", zhDescription:"从目标开始，系统给出三个研究起点。"},
  {id:"choose", label:"Help me choose", zh:"先帮我择优", description:"Compare drawdown, stability, and turnover before you choose.", zhDescription:"先比较回撤、稳定性和换手，再决定方向。"},
  {id:"build", label:"Make my own strategy", zh:"我来定制方法", description:"Turn one sentence into editable visual rules.", zhDescription:"用一句话生成可编辑的可视规则。"},
] as const;
const composerEntryPrompts = {
  find: {
    zh: [
      ["先平衡收益与回撤", "balanced", "我更关注收益和回撤平衡。"],
      ["先降低回撤优先", "lower_drawdown", "我先做更稳定、回撤更小的尝试。"],
      ["先提高稳定性", "higher_stability", "我先看跨阶段更一致的结果。"],
    ],
    en: [
      ["Prioritize balanced return and risk", "balanced", "Prioritize a balance between return and drawdown for now."],
      ["Lower drawdown first", "lower_drawdown", "I want a lower drawdown emphasis first."],
      ["Prioritize stability", "higher_stability", "I want more stable outcomes across periods first."],
    ],
  },
  choose: {
    zh: [
      ["先对比回撤与成本", "lower_drawdown", "我先看谁的回撤更小并更节省成本。"],
      ["先看稳定性", "higher_stability", "我先看各阶段更一致的结果。"],
      ["先看换手更少", "lower_turnover", "我先看交易更少的策略。"],
    ],
    en: [
      ["Prioritize drawdown and costs", "lower_drawdown", "I want smaller drawdown and lower implied trading friction first."],
      ["Prioritize stability", "higher_stability", "I want period-by-period consistency first."],
      ["Prioritize lower turnover", "lower_turnover", "I want less frequent rebalancing first."],
    ],
  },
  build: {
    zh: [],
    en: [],
  },
} as const satisfies Record<ComposerEntryMode,{zh:[string,string,string][],en:[string,string,string][]}>;
const composerBuildTypeOptions = {
  momentum: {
    zh: "偏中期动量",
    en: "Mid-term momentum bias",
    prompt: {
      zh: "我想要一个关注 30 日强度并更看重趋势的策略。",
      en: "I want a strategy focused on 30-day strength and stronger trend persistence.",
    },
  },
  risk: {
    zh: "偏低波动",
    en: "Low-volatility preference",
    prompt: {
      zh: "请做一个以低波动为核心的筛选规则。",
      en: "Please build a rule-first strategy centered on low volatility.",
    },
  },
  reversal: {
    zh: "偏反弹修复",
    en: "Rebound recovery",
    prompt: {
      zh: "我想要关注近期下跌后出现修复的股票。",
      en: "I want to focus on stocks showing rebound after recent weakness.",
    },
  },
} as const;
const composerBuildFollowUp = {
  momentum: {
    zh:["你想优先用多久动量？","我先默认用 60 日强度再加上趋势判断。","中期趋势"],
    en:["How long should the momentum window be?","I will keep 60-day strength and add trend confirmation by default.","60-day strength"],
  },
  risk: {
    zh:["更看重低波动还是反弹修复？","我先默认低波动优先。","低波动优先"],
    en:["Prefer low-volatility or rebound correction first?","I will prioritize low volatility first.","Low-volatility priority"],
  },
  reversal: {
    zh:["你更关注短线修复还是趋势确认？","我先默认低波动后再看是否反弹。","短线修复"],
    en:["Do you prefer short-term rebound or trend confirmation?","I will prioritize short-term reversal before trend confirmation.","Short-term rebound"],
  },
};
const composerBuildFollowUpOptions = [
  { id: "volatility", zh: "波动处理优先", en: "Volatility handling", prompt: { zh: "先看波动再决定选股方式。", en: "Prioritize volatility handling before other filters." } },
  { id: "bond", zh: "加入债券对冲", en: "Add bond overlay", prompt: { zh: "优先考虑债券或低相关资产做对冲。", en: "Prioritize hedging with bonds or low-correlation assets first." } },
  { id: "volatilitySort", zh: "波动排序", en: "Sort by volatility", prompt: { zh: "先按波动排序，再挑选风险更低的标的。", en: "Sort by volatility first, then pick lower-risk names." } },
  { id: "riskParity", zh: "风险平价", en: "Risk parity", prompt: { zh: "优先按风险平价约束权重。", en: "Prioritize risk-parity style weighting constraints." } },
];
const composerBlockActions = [
  {id:"asset", zh:"资产池", en:"Asset", prompt:{zh:"我先优化资产池的定义。", en:"I want to revise the stock universe first."}},
  {id:"group", zh:"分组", en:"Group", prompt:{zh:"我先定义分组/行业偏好。", en:"Set or refine grouping preferences first."}},
  {id:"weight", zh:"权重", en:"Weight", prompt:{zh:"我先调整持仓权重与最大持仓。", en:"Update holdings and portfolio weighting first."}},
  {id:"ifelse", zh:"IF/ELSE", en:"IF / ELSE", prompt:{zh:"我加一个条件分支（通过/不通过）。", en:"Add an IF/ELSE branch for pass/fail filtering."}},
  {id:"filter", zh:"过滤", en:"Filter", prompt:{zh:"我增加更多过滤条件。", en:"Add another filtering condition."}},
  {id:"paste", zh:"粘贴规则", en:"Paste", prompt:{zh:"我直接粘贴一段规则语句。", en:"Paste a custom rule statement."}},
] as const;
const composerBlockActionIds = new Set(composerBlockActions.map(item => item.id));
type ComposerBlockActionId = (typeof composerBlockActions)[number]["id"];
type ComposerEntryMode=(typeof composerEntryModes)[number]["id"];
const ASSET_PREVIEW_LIMIT = 3;
const stockNamesEn:Record<string,string>={
  "600000":"SPD Bank","600009":"Shanghai International Airport","600028":"Sinopec","600030":"CITIC Securities","600036":"China Merchants Bank","600050":"China Unicom",
  "600104":"SAIC Motor","600276":"Hengrui Pharmaceuticals","600309":"Wanhua Chemical","600406":"NARI Technology","600519":"Kweichow Moutai","600585":"Anhui Conch Cement",
  "600690":"Haier Smart Home","600745":"Wingtech Technology","600809":"Shanxi Fen Wine","600887":"Yili Group","601012":"LONGi Green Energy","601088":"China Shenhua",
  "601166":"Industrial Bank","601318":"Ping An Insurance","601398":"ICBC","601601":"CPIC","601668":"China State Construction","601857":"PetroChina",
};
const industryNamesEn:Record<string,string>={金融:"Financials",交通:"Transportation",能源:"Energy",通信:"Telecom",汽车:"Automotive",医疗:"Healthcare",材料:"Materials",工业科技:"Industrial technology",消费:"Consumer",科技:"Technology",新能源:"Clean energy",工业:"Industrials"};
function localizedStock(stock:StockChoice,isEnglish:boolean){return isEnglish?{...stock,name:stockNamesEn[stock.code]??stock.name,industry:industryNamesEn[stock.industry]??stock.industry}:stock}
const sourceLabels:Record<string,string>={user:"你的原方法",template:"你选的起点",constrained_ai:"系统的小改进",traditional:"固定参照"};
const statusLabels:Record<string,string>={precheck_rejected:"规则未通过",research_rejected:"第一轮未通过",validation_rejected:"第二轮未通过",locked_failed:"最后检查未延续",limited_candidate:"保留"};
function roleAwareStatus(item:ResearchRun["evaluations"][number]){return item.strategy.source==="traditional"?"固定参照":item.strategy.source==="user"||item.strategy.source==="template"?"你的原方法":statusLabels[item.status]}
type ResearchOptions={configurationMode:"auto"|"manual";universeMode:"preset"|"custom";universeId:string;customSymbols:string[];candidateBudget:CandidateBudget;maxRounds:ResearchRounds;targetCandidates:TargetCandidates;searchMode:SearchMode;maxPositions:number};
const DEFAULT_RESEARCH_OPTIONS:ResearchOptions={configurationMode:"auto",universeMode:"preset",universeId:"cn-a-cross-industry-v1",customSymbols:[...STOCK_SAMPLE.map(item=>item[0])],candidateBudget:500,maxRounds:1,targetCandidates:2,searchMode:"stop_on_validation_target",maxPositions:8};
function displayInput(text:string,isEnglish:boolean){if(!isEnglish)return text;const index=ideaValues.indexOf(text);if(index>=0)return ideaValuesEn[index];if(text==="我还没有具体方法，只想让历史结果更稳健。")return goalDefaultEn;return text}
function englishStrategyName(strategy:ResearchRun["evaluations"][number]["strategy"]|StrategyPlan["dsl"]){if(strategy.source==="user")return "Your method";if(strategy.source==="template"){if(strategy.factors.length===1&&strategy.factors[0].id==="low_volatility_20")return "Low-volatility method";return "Your chosen starting point"}if(strategy.source==="traditional"){if(strategy.factors.length===0)return "Equal-weight reference";const id=strategy.factors[0]?.id;return id==="momentum_60"?"Traditional 60-day momentum":id==="low_volatility_20"?"Traditional 20-day low volatility":id==="reversal_5"?"Traditional 5-day reversal":"Traditional reference"}const factors=strategy.factors.map(item=>item.id==="momentum_60"?"momentum":item.id==="low_volatility_20"?"low volatility":item.id==="reversal_5"?"short-term reversal":"trend");return `Candidate: ${factors.join(" + ")}`}
function englishRoleStatus(item:ResearchRun["evaluations"][number]){if(item.strategy.source==="traditional")return "Fixed reference";if(item.strategy.source==="user"||item.strategy.source==="template")return "Your original method";return {precheck_rejected:"Rule check failed",research_rejected:"Stopped in research",validation_rejected:"Did not pass comparison",locked_failed:"Did not continue in final check",limited_candidate:"Retained"}[item.status]}
function englishThesis(strategy:StrategyPlan["dsl"]){const factors=strategy.factors.map(item=>item.id==="momentum_60"?"60-day strength":item.id==="low_volatility_20"?"recent volatility":item.id==="reversal_5"?"recent declines":"the medium-term trend").join(" and ");return `${strategy.rebalance.frequency==="monthly"?"Each month":"Every two weeks"}, compare ${factors} within the same stock sample, then observe the next holding period using equal weights.`}
function englishEssentials(plan:StrategyPlan){const strategy=plan.dsl;return [["Stock sample",strategy.universe.mode==="custom"?`${strategy.universe.symbols?.length??0} selected A-shares`:"24-stock cross-industry demo sample"],["Historical traits",strategy.factors.map(item=>item.id==="momentum_60"?"60-day strength":item.id==="low_volatility_20"?"recent volatility":item.id==="reversal_5"?"recent declines":"medium-term trend").join(" + ")],["Selection",`Up to ${strategy.portfolio.max_positions} stocks, equal weighted`],["Review pace",strategy.rebalance.frequency==="monthly"?"Once a month":"Every two weeks"],["Passing goal",goalLabelsEn[strategy.research_goal]]]}
function containsHan(text:string){return /[\u3400-\u9fff]/u.test(text)}
function localizedStrategyName(strategy:StrategyDSL,name:string,isEnglish:boolean){return isEnglish&&containsHan(name)?englishStrategyName(strategy):name}
function localizedStrategyThesis(strategy:StrategyDSL,thesis:string,isEnglish:boolean){return isEnglish&&containsHan(thesis)?englishThesis(strategy):thesis}
function localizedUniverseName(snapshot:SavedResearchStrategy["universe_snapshot"],isEnglish:boolean){
  if(!isEnglish)return snapshot.universe_name;
  if(snapshot.universe_version.startsWith("custom-"))return snapshot.universe_name.match(/\d+/)?.[0]?`${snapshot.universe_name.match(/\d+/)?.[0]} selected A-shares`:"Selected A-share sample";
  const preset=UNIVERSE_PRESETS.find(item=>snapshot.universe_version.startsWith(item.id));
  return preset?`${preset.symbols.length}-stock cross-industry demo sample`:"Saved stock sample";
}
function localizedDataStatus(status:SavedResearchStrategy["universe_snapshot"]["status"],isEnglish:boolean){
  if(!isEnglish)return status;
  return {demo:"Demo data",live:"Live public data",cached:"Cached data",stale:"Stale data",partial:"Partial data"}[status]??status;
}
function localizedUiMessage(message:string,isEnglish:boolean){
  if(!isEnglish||!message||!containsHan(message))return message;
  if(message.startsWith("已保存"))return "Saved as a reusable research method. It will not run or trade automatically.";
  if(message.startsWith("已建立未保存"))return "A new unsaved version is ready with the parent sample, rules, schedule, and costs restored. Nothing is added to the library until you run, confirm, and save it.";
  if(message.startsWith("已按原规则"))return "Rechecked with the original rules and the same locked conditions. No rule was rewritten.";
  if(message.startsWith("已停止等待"))return "Stopped waiting. The rules and stock sample were not changed; a completed server result can be reused under the same conditions.";
  if(message.includes("锁定历史已经打开"))return "This final historical period has already been opened. Live-data research must wait for a new data cutoff; the preset classroom sample can be replayed.";
  if(message.includes("候选组合已经全部检查"))return "Every allowed candidate has already been checked. Change the stock sample or strategy rules before starting a new live-data study.";
  if(message.includes("请先登录"))return "Please sign in before running this historical study.";
  if(message.includes("确认"))return "Please review and confirm the current rules before running again.";
  if(message.includes("股票")||message.includes("样本"))return "The stock sample could not be used. Review the sample settings and try again.";
  if(message.includes("规则图")||message.includes("DSL")||message.includes("因子")||message.includes("过滤"))return "The visual rules are not valid yet. Review the highlighted rule settings and try again.";
  if(message.includes("回测")||message.includes("研究运行"))return "The historical test could not run. Please try again.";
  if(message.includes("保存"))return "The research method could not be saved. Please try again.";
  if(message.includes("读取")||message.includes("未找到"))return "The requested research record could not be loaded.";
  return "The action could not be completed. Review the current settings and try again.";
}

export type StrategyLabStudyEvent = "plan_created"|"plan_revised"|"run_started"|"run_completed"|"run_failed"|"result_viewed"|"save_started"|"save_completed"|"comprehension_submitted"|"decision_handoff";
export type StrategyLabStudyDetails = {durationMs?:number;mode?:"idea"|"goal";dataMode?:"demo"|"live"|"cached"|"stale"|"partial";errorCategory?:"validation"|"model"|"data"|"timeout"|"cancelled"|"storage"|"unknown";understandingScore?:number;attemptIndex?:number};

export function StrategyResearchFlow({onStudyEvent}:{onStudyEvent?:(event:StrategyLabStudyEvent,details?:StrategyLabStudyDetails)=>void}={}){
  const {isEnglish}=useI18n();
  const [mode,setMode]=useState<"idea"|"goal">("goal");
  const [text,setText]=useState("");
  const [goal,setGoal]=useState<ResearchGoal>("balanced");
  const [plan,setPlan]=useState<StrategyPlan|null>(null);
  const [confirmed,setConfirmed]=useState(false);
  const [run,setRun]=useState<ResearchRun|null>(null);
  const [selectedStrategyId,setSelectedStrategyId]=useState("");
  const [saved,setSaved]=useState<SavedResearchStrategy[]>([]);
  const [busy,setBusy]=useState<"plan"|"run"|"save"|"library"|null>(null);
  const [message,setMessage]=useState("");
  const [attempts,setAttempts]=useState(0);
  const [editParentId,setEditParentId]=useState<string|null>(null);
  const [composerEntry,setComposerEntry]=useState<(typeof composerEntryModes)[number]["id"]>("find");
  const [researchOptions,setResearchOptions]=useState<ResearchOptions>(DEFAULT_RESEARCH_OPTIONS);
  const [savedLibraryRuns,setSavedLibraryRuns]=useState<Record<string,ResearchRun>>({});
  const [openedStrategyId,setOpenedStrategyId]=useState<string|null>(null);
  const [openingStrategyRun,setOpeningStrategyRun]=useState<string|null>(null);
  const [draftName,setDraftName]=useState("");
  const [draftDescription,setDraftDescription]=useState("");
  const [initialCapital,setInitialCapital]=useState(1000000);
  const [dslHistory,setDslHistory]=useState<StrategyDSL[]>([]);
  const [dslRedoStack,setDslRedoStack]=useState<StrategyDSL[]>([]);
  const [strategyGraph,setStrategyGraph]=useState<StrategyGraph>({version:"strategy-graph-v1",root:"",nodes:[],edges:[]});
  const [graphHash,setGraphHash]=useState("");
  const planController=useRef<AbortController|null>(null);
  const planRequestGate=useRef(createLatestRequestGate());
  const runController=useRef<AbortController|null>(null);

  useEffect(()=>{let active=true;void fetch("/quant/strategy-lab/strategies").then(async response=>{if(response.ok&&active)setSaved((await response.json()).strategies??[])}).catch(()=>undefined);return()=>{active=false}},[]);
  useEffect(()=>{if(plan){const nextGraph=dslToGraph(plan.dsl);setDraftName(plan.dsl.name);setDraftDescription(plan.dsl.thesis_plain);setStrategyGraph(nextGraph);stableGraphHash(nextGraph).then(hash=>setGraphHash(hash));setDslHistory([]);setDslRedoStack([]);}},[plan?.confirmation_hash, plan?.dsl?.id]);
  function invalidate(next?:string){planController.current?.abort();planRequestGate.current.invalidate();if(next!==undefined)setText(next);setPlan(null);setConfirmed(false);setRun(null);setSelectedStrategyId("");setEditParentId(null);setMessage("");setDslHistory([]);setDslRedoStack([]);}
  async function applyDraftUpdate(nextDsl:StrategyDSL){
    if(!plan) return;
    const draftValidation=validateStrategyDSL(nextDsl);
    if(!draftValidation.valid){setMessage(draftValidation.errors.join("；"));return;}
    try{
      const candidateGraph=normalizeGraph(dslToGraph(nextDsl));
      const backToDsl=graphToDsl(candidateGraph);
      const backValidation=validateStrategyDSL(backToDsl);
      if(!backValidation.valid){setMessage(`DSL 回写失败：${backValidation.errors.join("；")}`);return;}
      const backGraph=normalizeGraph(dslToGraph(backToDsl));
      const draftHash=await stableGraphHash(candidateGraph);
      const backHash=await stableGraphHash(backGraph);
      if(draftHash!==backHash) {setMessage("规则图与 DSL 存在漂移，已阻止更新。请先重生成草案后再编辑。");return;}
      setDslHistory(previous=>[...previous.slice(-18),plan.dsl]);
      setDslRedoStack([]);
      setPlan({...plan,dsl:backToDsl});
      setStrategyGraph(backGraph);
      setGraphHash(draftHash);
      setRun(null);setConfirmed(false);setMessage("");
    }catch(error){
      setMessage(error instanceof Error ? error.message : "草案更新失败");
    }
  }
  async function applyGraphUpdate(nextGraph:StrategyGraph){
    if(!plan) return;
    const normalized=normalizeGraph(nextGraph);
    const validation=validateStrategyGraph(normalized);
    if(!validation.valid){setMessage(validation.errors.join("；"));return;}
    try{
      const nextDsl=graphToDsl(normalized);
      const dslValidation=validateStrategyDSL(nextDsl);
      if(!dslValidation.valid){setMessage(`规则图生成 DSL 失败：${dslValidation.errors.join("；")}`);return;}
      const syncedGraph=normalizeGraph(dslToGraph(nextDsl));
      const roundTripValidation=validateStrategyGraph(syncedGraph);
      if(!roundTripValidation.valid){setMessage(`规则图一致性失败：${roundTripValidation.errors.join("；")}`);return;}
      const candidateHash=await stableGraphHash(normalized);
      const roundTripHash=await stableGraphHash(syncedGraph);
      if(candidateHash!==roundTripHash){setMessage("图与 DSL 闭环不一致，已阻止保存。");return;}
      setMessage("");
      setDslHistory(previous=>[...previous.slice(-18),plan.dsl]);setDslRedoStack([]);
      setPlan({...plan,dsl:nextDsl});
      setStrategyGraph(syncedGraph);
      setGraphHash(candidateHash);
      setRun(null);setConfirmed(false);
    }catch(error){setMessage(error instanceof Error?error.message:"规则图转 DSL 失败");}
  }
  function undoPlan(){if(!plan||dslHistory.length===0)return;const previous=dslHistory[dslHistory.length-1];setDslHistory(previousStack=>previousStack.slice(0,-1));setDslRedoStack(previousStack=>[...previousStack.slice(-18),plan.dsl]);setPlan({...plan,dsl:previous});setRun(null);setConfirmed(false);}
  function redoPlan(){if(!plan||dslRedoStack.length===0)return;const next=dslRedoStack[dslRedoStack.length-1];setDslRedoStack(previous=>previous.slice(0,-1));setDslHistory(previous=>[...previous.slice(-18),plan.dsl]);setPlan({...plan,dsl:next});setRun(null);setConfirmed(false);}
  function applyDraftMeta(next:Partial<Pick<StrategyDSL,"name"|"thesis_plain"|"costs"|"rebalance">>){if(!plan)return;const nextDsl={...plan.dsl,name:next.name??plan.dsl.name,thesis_plain:next.thesis_plain ?? plan.dsl.thesis_plain,costs:next.costs ?? plan.dsl.costs,rebalance:next.rebalance ?? plan.dsl.rebalance};const nextGraph=dslToGraph(nextDsl);setPlan({...plan,dsl:nextDsl});setStrategyGraph(nextGraph);stableGraphHash(nextGraph).then(hash=>setGraphHash(hash));setRun(null);setConfirmed(false);}
  async function createPlan(startingPointId?:string,options:ResearchOptions=researchOptions,fixedPlan?:StrategyPlan,overrideText?:string,preserveExisting=true){const preserve=preserveExisting?(fixedPlan??(arguments.length>=2?plan??undefined:undefined)):undefined;const requestText=overrideText??text;const revising=Boolean(plan);const revisionBase=!preserve&&overrideText!==undefined?plan?.dsl:undefined;planController.current?.abort();const controller=new AbortController();const requestId=planRequestGate.current.begin();planController.current=controller;if(overrideText!==undefined){setText(requestText);setRun(null);setConfirmed(false);setSelectedStrategyId("")}setBusy("plan");setMessage("");try{const response=await fetch("/quant/strategy-lab/plan",{method:"POST",headers:{"content-type":"application/json"},signal:controller.signal,body:JSON.stringify({text:requestText,mode,goal:mode==="goal"?goal:undefined,ai_available:preserve?false:undefined,starting_point_id:startingPointId,universe_id:options.universeId,custom_symbols:options.configurationMode==="manual"&&options.universeMode==="custom"?options.customSymbols:undefined,candidate_budget:options.candidateBudget,max_rounds:options.maxRounds,target_candidates:options.targetCandidates??2,search_mode:options.searchMode??"exhaust_budget",max_positions:options.maxPositions,base_dsl:revisionBase,fixed_factors:preserve?.dsl.factors,fixed_frequency:preserve?.dsl.rebalance.frequency,fixed_dsl:preserve?.dsl})});const body=await response.json();if(!planRequestGate.current.isCurrent(requestId))return;if(!response.ok)throw new Error(body.message);const nextPlan=body.plan as StrategyPlan;setPlan(nextPlan);setDraftName(nextPlan.dsl.name);setDraftDescription(nextPlan.dsl.thesis_plain);setDslHistory([]);setDslRedoStack([]);setConfirmed(false);setRun(null);onStudyEvent?.(revising?"plan_revised":"plan_created",{mode})}catch(error){if(planRequestGate.current.isCurrent(requestId)&&!(error instanceof Error&&error.name==="AbortError"))setMessage(error instanceof Error?error.message:"暂时无法整理策略。")}finally{if(planRequestGate.current.isCurrent(requestId)){planController.current=null;setBusy(null)}}}
  async function startResearch(confirmNow=false){if(!plan||(!confirmed&&!confirmNow))return;const controller=new AbortController();runController.current=controller;setConfirmed(true);onStudyEvent?.("run_started",{mode});setBusy("run");setMessage("");try{const currentConfirmationHash=await confirmationHash(plan.dsl,plan.dsl.research_goal,plan.research_settings);const confirmedPlan={...plan,confirmation_hash:currentConfirmationHash};setPlan(confirmedPlan);const response=await fetch("/quant/strategy-lab/runs",{method:"POST",headers:{"content-type":"application/json"},signal:controller.signal,body:JSON.stringify({plan:confirmedPlan,confirmation_hash:currentConfirmationHash,confirmed:true,attempts_total:attempts+1})});const body=await response.json();if(!response.ok)throw new Error(body.message);setRun(body.run);setAttempts(value=>value+1);const preferred=body.run.evaluations.find((item:ResearchRun["evaluations"][number])=>item.strategy.source==="constrained_ai"&&item.status==="limited_candidate")??body.run.evaluations.find((item:ResearchRun["evaluations"][number])=>item.strategy.id===plan.dsl.id);setSelectedStrategyId(preferred?.strategy.id??"");onStudyEvent?.("run_completed",{mode,dataMode:body.run.data_audit.status});onStudyEvent?.("result_viewed",{mode,dataMode:body.run.data_audit.status})}catch(error){onStudyEvent?.("run_failed",{mode,errorCategory:error instanceof Error&&error.name==="AbortError"?"cancelled":"unknown"});if(error instanceof Error&&error.name==="AbortError")setMessage("已停止等待；规则和样本没有被修改。服务器若已完成计算，相同条件下以后会直接复用结果。");else setMessage(error instanceof Error?error.message:"研究运行失败，请重试。")}finally{if(runController.current===controller)runController.current=null;setBusy(null)}}
  function cancelResearch(){runController.current?.abort()}
  async function saveStrategy(){if(!run||!selectedStrategyId)return;onStudyEvent?.("save_started",{mode});setBusy("save");setMessage("");try{const response=await fetch("/quant/strategy-lab/strategies",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({run_id:run.id,strategy_id:selectedStrategyId,parent_strategy_id:editParentId,confirmed:true})});const body=await response.json();if(!response.ok)throw new Error(body.message);setSaved(items=>[body.strategy,...items]);setEditParentId(null);setMessage("已保存为研究方法，不会自动运行或交易。");onStudyEvent?.("save_completed",{mode})}catch(error){setMessage(error instanceof Error?error.message:"保存失败，请稍后重试。")}finally{setBusy(null)}}
  async function libraryAction(id:string,action:"clone"|"delete"|"rerun"|"evidence"){if(action==="delete"&&!window.confirm("确认删除这条研究记录？"))return;setBusy("library");setMessage("");try{const url=action==="rerun"?`/quant/strategy-lab/strategies/${id}/rerun`:action==="evidence"?`/quant/strategy-lab/strategies/${id}/decision-evidence`:`/quant/strategy-lab/strategies/${id}`;const response=await fetch(url,{method:action==="delete"?"DELETE":"POST",headers:{"content-type":"application/json"},body:JSON.stringify(action==="clone"?{action,confirmed:true}:{confirmed:true})});const body=await response.json();if(!response.ok)throw new Error(body.message);if(action==="delete")setSaved(items=>items.filter(item=>item.id!==id));else if(action==="clone"){setMode("idea");setGoal(body.strategy.research_goal);setText(body.strategy.thesis_plain);setEditParentId(body.strategy.id);setResearchOptions({configurationMode:"manual",universeMode:body.plan.dsl.universe.mode,universeId:body.plan.dsl.universe.id??DEFAULT_RESEARCH_OPTIONS.universeId,customSymbols:body.plan.dsl.universe.symbols??DEFAULT_RESEARCH_OPTIONS.customSymbols,candidateBudget:body.plan.research_settings.candidate_budget,maxRounds:1,targetCandidates:body.plan.research_settings.target_candidates,searchMode:body.plan.research_settings.search_mode,maxPositions:body.plan.dsl.portfolio.max_positions});setPlan(body.plan);setRun(null);setSelectedStrategyId("");setMessage("已建立未保存的新版本草稿，并完整恢复父版本的股票样本、规则、调仓和成本；只有运行并确认保存后才会写入版本库。")}else if(action==="rerun"){setSaved(items=>items.map(item=>item.id===id?body.strategy:item));setMessage("已按原规则和完整统一条件重检，规则没有被改写。")}else {onStudyEvent?.("decision_handoff",{mode});window.location.assign(body.next??"/opportunity")}}catch(error){setMessage(error instanceof Error?error.message:"操作失败")}finally{setBusy(null)}}
  function prepareRetest(){setRun(null);setConfirmed(false);setSelectedStrategyId("");setMessage("");}
  const openedStrategy=saved.find(item=>item.id===openedStrategyId) ?? null;
  const openedStrategyRun=openedStrategy?.latest_run_id?savedLibraryRuns[openedStrategy.latest_run_id] ?? null:null;
  useEffect(()=>{if(openedStrategyId&&!saved.some(item=>item.id===openedStrategyId))setOpenedStrategyId(null);},[saved,openedStrategyId]);
  async function openSavedStrategy(strategy: SavedResearchStrategy) {
    setOpenedStrategyId(strategy.id);
    setMessage("");
    if (strategy.latest_run_id && savedLibraryRuns[strategy.latest_run_id]) return;
    if (!strategy.latest_run_id) {
      setMessage("该研究尚未形成可复用回测历史。");
      return;
    }
    setOpeningStrategyRun(strategy.id);
    try {
      const response = await fetch("/quant/strategy-lab/runs");
      if (!response.ok) throw new Error("读取保存策略回测失败");
      const body = await response.json();
      const history = body.runs?.find((item: ResearchRun) => item.id === strategy.latest_run_id);
      if (!history) throw new Error("未找到对应回测历史。");
      setSavedLibraryRuns(current => ({ ...current, [strategy.latest_run_id]: history }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "读取历史回测失败");
    } finally {
      setOpeningStrategyRun(null);
    }
  }
  function closeSavedStrategy(){setOpenedStrategyId(null);}

  const displayMessage=localizedUiMessage(message,isEnglish);
  const displayDraftName=plan?localizedStrategyName(plan.dsl,draftName,isEnglish):draftName;
  const displayDraftDescription=plan?localizedStrategyThesis(plan.dsl,draftDescription,isEnglish):draftDescription;
  return <div className="strategy-research-flow sr-workbench-root">
    <ComposerResearchWorkbench
      key={run?.id??plan?.confirmation_hash??"new"}
      isEnglish={isEnglish}
      composerEntry={composerEntry}
      mode={mode}
      text={displayInput(text,isEnglish)}
      goal={goal}
      plan={plan}
      run={run}
      options={researchOptions}
      busy={busy}
      message={displayMessage}
      selectedStrategyId={selectedStrategyId}
      onMode={next=>{setMode(next);const defaultGoalText=isEnglish?goalDefaultEn:"我还没有具体方法，只想让历史结果更稳健。";invalidate(next==="goal"?(text.trim()?text:defaultGoalText):(text===defaultGoalText?"":text))}}
      onComposerEntry={setComposerEntry}
      onText={invalidate}
      onGoal={(next,description)=>{setGoal(next);invalidate(description)}}
      onExample={index=>invalidate(isEnglish?ideaValuesEn[index]:ideaValues[index])}
      onCreate={()=>createPlan()}
      onRevise={next=>void createPlan(undefined,researchOptions,undefined,next,false)}
      onDslChange={applyDraftUpdate}
      onGraphChange={applyGraphUpdate}
      graph={strategyGraph}
      onBack={()=>invalidate()}
      onNameChange={nextName=>{setDraftName(nextName);applyDraftMeta({name:nextName})}}
      onDescriptionChange={nextDescription=>{setDraftDescription(nextDescription);applyDraftMeta({thesis_plain:nextDescription})}}
      onUndo={undoPlan}
      onRedo={redoPlan}
      canUndo={dslHistory.length>0}
      canRedo={dslRedoStack.length>0}
      draftName={displayDraftName}
      draftDescription={displayDraftDescription}
      initialCapital={initialCapital}
      onInitialCapitalChange={value=>setInitialCapital(value)}
      onCostChange={costs=>applyDraftMeta({costs})}
      onStartingPoint={id=>createPlan(id)}
      onOptions={next=>{setResearchOptions(next);void createPlan(plan?.selected_starting_point_id??undefined,next,plan??undefined)}}
      onRun={()=>startResearch(true)}
      onCancel={cancelResearch}
      onSelect={setSelectedStrategyId}
      onSave={saveStrategy}
      onRestart={prepareRetest}
    />
    <SavedLibrary isEnglish={isEnglish} items={saved} busy={busy==="library"||Boolean(openingStrategyRun)} onAction={libraryAction} onOpenDetail={openSavedStrategy}/>
    <SavedStrategyDetailDrawer
      isEnglish={isEnglish}
      strategy={openedStrategy}
      run={openedStrategyRun}
      loading={openingStrategyRun===openedStrategyId}
      onClose={closeSavedStrategy}
    />
  </div>;
}

function ComposerResearchWorkbench({
  isEnglish=false,composerEntry,mode,text,goal,plan,run,graph,options,busy,message,selectedStrategyId,onGraphChange,
  onMode,onComposerEntry,onText,onGoal,onExample,onCreate,onRevise,onDslChange,onBack,onStartingPoint,onOptions,onRun,onCancel,onSelect,onSave,onRestart,
  onNameChange,onDescriptionChange,onUndo,onRedo,canUndo,canRedo,draftName,draftDescription,onInitialCapitalChange,onCostChange,initialCapital,
}:{
  isEnglish?:boolean;composerEntry:ComposerEntryMode;mode:"idea"|"goal";text:string;goal:ResearchGoal;plan:StrategyPlan|null;run:ResearchRun|null;graph:StrategyGraph;
  options:ResearchOptions;busy:"plan"|"run"|"save"|"library"|null;message:string;selectedStrategyId:string;
  onGraphChange:(graph:StrategyGraph)=>void;onMode:(mode:"idea"|"goal")=>void;onComposerEntry:(path:string)=>void;onText:(value:string)=>void;onGoal:(goal:ResearchGoal,description:string)=>void;
  onExample:(index:number)=>void;onCreate:()=>void;onRevise:(value:string)=>void;onDslChange:(dsl:StrategyDSL)=>void;onBack:()=>void;onStartingPoint:(id:string)=>void;
  onOptions:(options:ResearchOptions)=>void;onRun:()=>void;onCancel:()=>void;onSelect:(id:string)=>void;
  onSave:()=>void;onRestart:()=>void;onNameChange:(value:string)=>void;onDescriptionChange:(value:string)=>void;
  onUndo:()=>void;onRedo:()=>void;canUndo:boolean;canRedo:boolean;draftName:string;draftDescription:string;initialCapital:number;onInitialCapitalChange:(value:number)=>void;onCostChange:(costs:StrategyDSL["costs"])=>void;
}){
  const [revisionText,setRevisionText]=useState("");
  const [composeMode,setComposeMode]=useState<"idle"|"entry-question"|"build-type"|"follow-up">("entry-question");
  const [buildPick,setBuildPick]=useState<keyof typeof composerBuildTypeOptions|"">("");
  const defaultColumnWidths:[number,number,number]=[26,36,38];
  const [columnWidths,setColumnWidths]=useState<[number,number,number]>(defaultColumnWidths);
  const resizeState=useRef<{divider:0|1;startX:number;start:[number,number,number];width:number}|null>(null);
  const stage=run?3:plan?2:1;
  const preset=universePreset(options.universeId);
  const sampleName=options.universeMode==="custom"
    ?pick(isEnglish,`自选 ${options.customSymbols.length} 只`,`${options.customSymbols.length} selected`)
    :pick(isEnglish,preset.name,`${preset.symbols.length}-stock sample`);
  const essentials=plan?(isEnglish?englishEssentials(plan):[...plan.plain_rules.slice(0,4).map(rule=>{const [name,...rest]=rule.split("：");return [name,rest.join("：")]}),["判断目标",goalLabels[plan.dsl.research_goal]]]):[];
  useEffect(()=>{
    if(plan){
      setComposeMode("idle");
      setBuildPick("");
    }else if(!plan && composerEntry==="build"){
      setComposeMode(buildPick? "follow-up":"build-type");
    }else{
      setComposeMode("entry-question");
      setBuildPick("");
    }
  },[plan?.confirmation_hash,composerEntry,buildPick]);
  const followUpText=isEnglish?composerBuildFollowUp[buildPick||"momentum"].en[0]:composerBuildFollowUp[buildPick||"momentum"].zh[0];
  const followUpHint=isEnglish?composerBuildFollowUp[buildPick||"momentum"].en[1]:composerBuildFollowUp[buildPick||"momentum"].zh[1];
  const followUpDefaultAnswer=isEnglish?composerBuildFollowUp[buildPick||"momentum"].en[2]:composerBuildFollowUp[buildPick||"momentum"].zh[2];
  function resizeColumns(divider:0|1,delta:number,start=columnWidths){
    const next:[number,number,number]=[...start];
    const leftMinimum=divider===0?18:24;
    const rightMinimum=divider===0?24:26;
    const pairTotal=start[divider]+start[divider+1];
    const nextLeft=Math.min(pairTotal-rightMinimum,Math.max(leftMinimum,start[divider]+delta));
    next[divider]=nextLeft;
    next[divider+1]=pairTotal-nextLeft;
    setColumnWidths(next);
  }
  function beginResize(divider:0|1,event:ReactPointerEvent<HTMLDivElement>){
    const width=event.currentTarget.parentElement?.getBoundingClientRect().width??0;
    if(!width)return;
    resizeState.current={divider,startX:event.clientX,start:[...columnWidths],width};
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function continueResize(event:ReactPointerEvent<HTMLDivElement>){
    const state=resizeState.current;if(!state)return;
    resizeColumns(state.divider,(event.clientX-state.startX)/state.width*100,state.start);
  }
  function finishResize(event:ReactPointerEvent<HTMLDivElement>){
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    resizeState.current=null;
  }
  function resizeWithKeyboard(divider:0|1,event:ReactKeyboardEvent<HTMLDivElement>){
    if(event.key!=="ArrowLeft"&&event.key!=="ArrowRight"&&event.key!=="Home")return;
    event.preventDefault();
    if(event.key==="Home"){setColumnWidths(defaultColumnWidths);return}
    resizeColumns(divider,event.key==="ArrowRight"?2:-2);
  }
  return <section id="tool-main" className="sr-composer-workbench" aria-label={pick(isEnglish,"策略研究工作台","Strategy research workspace")}>
    <header className="sr-workbench-toolbar">
      <div><span className="sr-workbench-mark"><BarChart3/></span><span><strong>{pick(isEnglish,"新研究","New research")}</strong><small>{plan?pick(isEnglish,"规则草案 · 尚未保存","Rule draft · not saved"):pick(isEnglish,"从一句话开始","Start with one sentence")}</small></span></div>
      <StageBar stage={stage} isEnglish={isEnglish}/>
      <div className="sr-layout-tools"><button type="button" onClick={()=>setColumnWidths(defaultColumnWidths)}><RotateCcw/>{pick(isEnglish,"恢复默认布局","Reset layout")}</button><span className="sr-safety-chip"><ShieldCheck/>{pick(isEnglish,"仅历史研究","Research only")}</span></div>
    </header>
    <div className="sr-workbench-grid" style={{gridTemplateColumns:`minmax(0,${columnWidths[0]}fr) 8px minmax(0,${columnWidths[1]}fr) 8px minmax(0,${columnWidths[2]}fr)`}}>
      <aside className="sr-assistant-rail" aria-label={pick(isEnglish,"AI 策略助手","AI strategy assistant")}>
        <header><Sparkles/><span><strong>{pick(isEnglish,"AI 策略助手","AI strategy assistant")}</strong><small>{pick(isEnglish,"受控模式 · 不接触回测结果","Controlled mode · no result access")}</small></span></header>
        {!plan?<>
          <div className="sr-entry-switch sr-entry-switch-primary" role="group" aria-label={pick(isEnglish,"选择开始方式","Choose how to start")}>
            <button type="button" aria-pressed={composerEntry==="build"} onClick={()=>{onComposerEntry("build");onMode("idea");setComposeMode("build-type")}}><Lightbulb/><span><strong>{pick(isEnglish,"我有一个想法","I have an idea")}</strong><small>{pick(isEnglish,"把一句模糊想法变成可编辑规则","Turn a rough idea into editable rules")}</small></span></button>
            <button type="button" aria-pressed={composerEntry!=="build"} onClick={()=>{onComposerEntry("find");onMode("goal");setComposeMode("entry-question")}}><Target/><span><strong>{pick(isEnglish,"我有一个目标","I have a goal")}</strong><small>{pick(isEnglish,"从回撤、稳定性或换手目标开始","Start from drawdown, stability, or turnover")}</small></span></button>
          </div>
          {composeMode==="entry-question" && composerEntry !== "build" && (
            <div className="sr-goal-pills compact" role="group" aria-label={pick(isEnglish,"快速追问","Quick follow-up")}>
              {(isEnglish?composerEntryPrompts[composerEntry].en:composerEntryPrompts[composerEntry].zh).map(([label,goalKey,suggestion]) => (
                <button key={label} type="button" onClick={() => { onText(suggestion); onGoal(goalKey as ResearchGoal, isEnglish?goalLabelsEn[goalKey as ResearchGoal]:goalLabels[goalKey as ResearchGoal]); setComposeMode("idle"); }}>
                  {label}
                </button>
              ))}
            </div>
          )}
          {composeMode==="build-type"&&<div className="sr-goal-pills compact" role="group" aria-label={pick(isEnglish,"选择策略类型","Choose strategy type")}>{Object.entries(composerBuildTypeOptions).map(([key,value])=><button key={key} type="button" onClick={()=>{const prompt=value.prompt[isEnglish?"en":"zh"];onText(prompt);setBuildPick(key as keyof typeof composerBuildTypeOptions);onComposerEntry("build");setComposeMode("follow-up");}}>{pick(isEnglish,value.zh,value.en)}</button>)}</div>}
          {composeMode==="follow-up"&&<div className="sr-goal-pills compact" role="group" aria-label={pick(isEnglish,"关键追问","Follow-up")}>
            <button type="button" onClick={()=>onText(followUpText)}>{followUpText}</button>
            <button type="button" onClick={()=>onText(followUpDefaultAnswer)}>{followUpDefaultAnswer}</button>
            <small>{followUpHint}</small>
          </div>}
          {composeMode==="idle"&&mode==="goal"&&composerEntry!=="build"&&<div className="sr-goal-pills compact" role="group" aria-label={pick(isEnglish,"研究目标","Research goals")}>{GOALS.map(item=><button key={item.id} aria-pressed={goal===item.id} onClick={()=>onGoal(item.id,isEnglish?goalLabelsEn[item.id]:item.description)}>{isEnglish?goalLabelsEn[item.id]:item.label}</button>)}</div>}
          <label className="sr-workbench-prompt">
            <span>{composerEntry==="build"?pick(isEnglish,"写下你的想法","Describe your idea"):pick(isEnglish,"补充你的目标（可选）","Add detail to your goal (optional)")}</span>
            <div className="sr-workbench-search-row">
              <Search/>
              <input value={text} maxLength={1000} placeholder={composerEntry==="build"?pick(isEnglish,"例如：强势，但不要太颠簸","Example: strong, but less volatile"):pick(isEnglish,"例如：先减少最大回撤","Example: reduce maximum drawdown first")} onChange={event=>onText(event.target.value)} />
            </div>
            <button className="sr-primary" disabled={busy==="plan"||!text.trim()} onClick={onCreate}>{busy==="plan"?pick(isEnglish,"正在整理…","Creating…"):pick(isEnglish,"生成画布","Generate visual canvas")}<ArrowRight/></button>
          </label>
          {composerEntry==="build"&&<div className="sr-prompt-examples">{(isEnglish?ideaValuesEn:ideaValues).map((item,index)=><button key={item} type="button" onClick={()=>onExample(index)}>{item}</button>)}
            <button type="button" onClick={()=>onText("")}>{pick(isEnglish,"清空","Clear")}</button>
          </div>}
          <p className="sr-rail-hint"><ShieldCheck/>{pick(isEnglish,"先预览，再运行。不会荐股或下单。","Preview first. No stock picks or orders.")}</p>
        </>:<>
          <article className="sr-chat-bubble assistant sr-strategy-summary"><small><Sparkles/>{pick(isEnglish,"助手整理出的策略","Strategy prepared by the assistant")}</small><strong>{isEnglish?englishStrategyName(plan.dsl):plan.dsl.name}</strong><p>{isEnglish?englishThesis(plan.dsl):plan.dsl.thesis_plain}</p></article>
          <article className="sr-chat-bubble user sr-user-context"><small>{pick(isEnglish,"你的原始想法","Your original idea")}</small><p>{displayInput(plan.original_input,isEnglish)}</p></article>
          <section className="sr-ai-followup" aria-label={pick(isEnglish,"继续修改策略","Continue editing the strategy")}>
            <div className="sr-ai-question"><Sparkles/><span><small>{run?pick(isEnglish,"回测完成，还可以继续改","Backtest complete; you can keep editing"):pick(isEnglish,"只问一个关键问题","One key question")}</small><strong>{run?pick(isEnglish,"想保留哪部分，再改哪里？","What should stay, and what should change?"):plan.dsl.research_goal==="lower_drawdown"?pick(isEnglish,"你更想先控制回撤，还是也减少调整次数？","Prioritize drawdown, or also reduce changes?"):plan.dsl.research_goal==="lower_turnover"?pick(isEnglish,"你希望每月检查，还是每两周检查？","Review monthly or every two weeks?"):pick(isEnglish,"要先增强稳定性，还是减少频繁调整？","Prioritize stability or fewer changes?")}</strong></span></div>
            <div className="sr-ai-quick-replies">
              {[[pick(isEnglish,"回撤优先","Prioritize drawdown"),pick(isEnglish,"优先让最大回撤更小","prioritize smaller maximum drawdown")],[pick(isEnglish,"每月调整","Review monthly"),pick(isEnglish,"每月调整一次","review once a month")],[pick(isEnglish,"加入趋势","Add trend"),pick(isEnglish,"加入中期趋势过滤","add a medium-term trend filter")],[pick(isEnglish,"减少换手","Reduce turnover"),pick(isEnglish,"减少频繁调整和换手","reduce frequent changes and turnover")]].map(([label,instruction])=><button key={label} type="button" disabled={busy==="plan"} onClick={()=>onRevise(isEnglish?`${plan.original_input}; ${instruction}`:`${plan.original_input}，${instruction}`)}>{label}</button>)}
            </div>
            <label><span>{pick(isEnglish,"继续告诉 AI 怎么改","Tell AI what to change")}</span><textarea value={revisionText} disabled={busy==="plan"} onChange={event=>setRevisionText(event.target.value)} placeholder={pick(isEnglish,"例如：保留低波动，改成每月调整","Example: keep low volatility and review monthly")}/></label>
            <button type="button" className="sr-secondary sr-ai-revise" disabled={busy==="plan"||!revisionText.trim()} onClick={()=>{onRevise(revisionText.trim());setRevisionText("")}}>{busy==="plan"?<><Activity className="sr-spin"/>{pick(isEnglish,"正在修改画布…","Updating canvas…")}</>:<><Sparkles/>{pick(isEnglish,"让 AI 修改画布","Ask AI to update canvas")}</>}</button>
            <p><ShieldCheck/>{pick(isEnglish,"AI 只改允许的规则；收益、回撤和成本仍由确定性引擎计算。","AI only edits allowed rules; returns, drawdowns and costs stay deterministic.")}</p>
          </section>
          <details className="sr-method-settings">
            <summary><span><SlidersHorizontal/>{pick(isEnglish,"方法名称与回测设置","Method name and backtest settings")}</span><ChevronDown/></summary>
            <article className="sr-workbench-controls">
              <label><span>{pick(isEnglish,"方法名称","Method name")}</span><input value={draftName} onChange={event=>onNameChange(event.target.value)} placeholder={pick(isEnglish,"给策略起个名字","Name this method")}/></label>
              <label><span>{pick(isEnglish,"方法描述","Method description")}</span><textarea value={draftDescription} onChange={event=>onDescriptionChange(event.target.value)} placeholder={pick(isEnglish,"一句话说明这个方法解决什么","One-line description")}/></label>
              <div className="sr-workbench-ops">
                <button type="button" disabled={!canUndo} onClick={onUndo}><RotateCcw/>{pick(isEnglish,"撤销","Undo")}</button>
                <button type="button" disabled={!canRedo} onClick={onRedo}><RotateCw/>{pick(isEnglish,"重做","Redo")}</button>
              </div>
              <label><span>{pick(isEnglish,"初始资金","Initial capital")}</span><input type="number" min={10000} step={10000} value={initialCapital} onChange={event=>onInitialCapitalChange(Number(event.target.value)||0)} /></label>
              <label><span>{pick(isEnglish,"每期调仓","Rebalance")}</span><div className="sr-mini-switch"><button type="button" aria-pressed={plan.dsl.rebalance.frequency==="monthly"} onClick={()=>onDslChange({...plan.dsl,rebalance:{...plan.dsl.rebalance,frequency:"monthly",holding_days:20}})}>{pick(isEnglish,"每月","Monthly")}</button><button type="button" aria-pressed={plan.dsl.rebalance.frequency==="biweekly"} onClick={()=>onDslChange({...plan.dsl,rebalance:{...plan.dsl.rebalance,frequency:"biweekly",holding_days:10}})}>{pick(isEnglish,"每两周","Biweekly")}</button></div></label>
              <label><span>{pick(isEnglish,"费用（bps）","Costs (bps)")}</span><input type="number" min={0} step={0.1} value={plan.dsl.costs.commission_bps} onChange={event=>onCostChange({...plan.dsl.costs,commission_bps:Number(event.target.value)})} /><input type="number" min={0} step={0.1} value={plan.dsl.costs.stamp_tax_bps} onChange={event=>onCostChange({...plan.dsl.costs,stamp_tax_bps:Number(event.target.value)})} /><input type="number" min={0} step={0.1} value={plan.dsl.costs.slippage_bps} onChange={event=>onCostChange({...plan.dsl.costs,slippage_bps:Number(event.target.value)})}/></label>
            </article>
          </details>
          {plan.starting_points.length>0&&<div className="sr-start-choice compact"><span>{pick(isEnglish,"切换起点","Switch starting point")}</span><div>{plan.starting_points.map(item=><button key={item.id} aria-pressed={plan.selected_starting_point_id===item.id} disabled={busy==="plan"} onClick={()=>onStartingPoint(item.id)}>{isEnglish?startingPointEn[item.id][0]:item.name}</button>)}</div></div>}
          <button type="button" className="sr-text-action" onClick={onBack}><ArrowLeft/>{pick(isEnglish,"重新描述","Start over")}</button>
        </>}
        {message&&<p className="sr-inline-message" role="status">{message}</p>}
      </aside>

      <div className="sr-column-resizer" role="separator" tabIndex={0} aria-orientation="vertical" aria-label={pick(isEnglish,"调整策略助手与策略画布宽度","Resize assistant and strategy canvas")} aria-valuemin={18} aria-valuemax={52} aria-valuenow={Math.round(columnWidths[0])} onPointerDown={event=>beginResize(0,event)} onPointerMove={continueResize} onPointerUp={finishResize} onPointerCancel={finishResize} onKeyDown={event=>resizeWithKeyboard(0,event)}><span/></div>

      <section className="sr-visual-editor" aria-label={pick(isEnglish,"可视策略编辑器","Visual strategy editor")}>
        <header><span><Layers3/><strong>{pick(isEnglish,"策略画布","Strategy canvas")}</strong></span><b>{pick(isEnglish,"受控组件","Controlled blocks")}</b></header>
        {plan?<EditableLogicCanvas isEnglish={isEnglish} plan={plan} graph={graph} essentials={essentials} sampleName={sampleName} options={options} busy={busy==="plan"} onOptions={onOptions} onRevise={onRevise} onGraphChange={onGraphChange} onDslChange={onDslChange}/>:<EmptyLogicCanvas isEnglish={isEnglish}/>}
      </section>

      <div className="sr-column-resizer" role="separator" tabIndex={0} aria-orientation="vertical" aria-label={pick(isEnglish,"调整策略画布与回测预览宽度","Resize strategy canvas and backtest preview")} aria-valuemin={42} aria-valuemax={74} aria-valuenow={Math.round(columnWidths[0]+columnWidths[1])} onPointerDown={event=>beginResize(1,event)} onPointerMove={continueResize} onPointerUp={finishResize} onPointerCancel={finishResize} onKeyDown={event=>resizeWithKeyboard(1,event)}><span/></div>

      <aside className="sr-backtest-dock" aria-label={pick(isEnglish,"回测预览","Backtest preview")}>
        {run?<WorkbenchResultPanel isEnglish={isEnglish} run={run} selectedStrategyId={selectedStrategyId} busy={busy==="save"} message={message} onSelect={onSelect} onSave={onSave} onRestart={onRestart}/>:<PreflightDock isEnglish={isEnglish} plan={plan} options={options} sampleName={sampleName} busy={busy} message={message} onOptions={onOptions} onRun={onRun} onCancel={onCancel}/>}
      </aside>
    </div>
    {run&&<WorkbenchDetails isEnglish={isEnglish} run={run}/>}
  </section>;
}

function EmptyLogicCanvas({isEnglish=false}:{isEnglish?:boolean}){
  const blocks=[
    [Layers3,pick(isEnglish,"股票样本","Stock sample"),pick(isEnglish,"生成后可查看完整名单","See the full list after generation")],
    [Activity,pick(isEnglish,"排序与过滤","Ranking and filters"),pick(isEnglish,"只使用允许的历史特征","Only approved historical traits")],
    [WalletCards,pick(isEnglish,"持有与成本","Holdings and costs"),pick(isEnglish,"统一等权、费用和调仓规则","Same weights, costs and schedule")],
  ] as const;
  return <div className="sr-empty-canvas"><div className="sr-canvas-intro"><Sparkles/><strong>{pick(isEnglish,"一句话会变成这些可点击模块","One sentence becomes these clickable blocks")}</strong><p>{pick(isEnglish,"不用先学因子或回测术语。规则生成后，每一步都能看懂和调整。","No factor or backtest knowledge required. Every generated step stays visible and adjustable.")}</p></div><div className="sr-node-stack muted">{blocks.map(([Icon,title,description],index)=><div key={title} className="sr-node-wrap"><article className="sr-strategy-node"><Icon/><span><small>{pick(isEnglish,`步骤 ${index+1}`,`Step ${index+1}`)}</small><strong>{title}</strong><em>{description}</em></span></article>{index<blocks.length-1&&<i className="sr-node-connector"/>}</div>)}</div></div>;
}

function EditableLogicCanvas({isEnglish=false,plan,graph,essentials,sampleName,options,busy,onOptions,onRevise,onGraphChange,onDslChange}:{isEnglish?:boolean;plan:StrategyPlan;graph:StrategyGraph;essentials:string[][];sampleName:string;options:ResearchOptions;busy:boolean;onOptions:(options:ResearchOptions)=>void;onRevise:(value:string)=>void;onGraphChange:(graph:StrategyGraph)=>void;onDslChange:(dsl:StrategyDSL)=>void}){
  const [selectedNodeId,setSelectedNodeId]=useState("");
  const [hoveredNode,setHoveredNode]=useState<string|null>(null);
  const stockMap = useMemo(()=>Object.fromEntries(STOCK_SAMPLE.map(item=>[item[0],item[1]])),[]);
  const factorCatalog:Array<[FactorId,string,string]>=[["momentum_60","60 日强度","60-day strength"],["low_volatility_20","20 日低波动","20-day low volatility"],["reversal_5","5 日反转","5-day reversal"],["trend_ma20_60","中期趋势","medium-term trend"]];

  const canvasNodes=useMemo(()=>{
    const fallbackNodes=[
      {id:"asset",kind:"asset",Icon:Layers3,label:pick(isEnglish,"股票范围","Stock universe"),value:sampleName,detail:pick(isEnglish,"所有候选与传统方法使用同一名单","All candidates and benchmarks use the same list")},
      {id:"sort",kind:"sort",Icon:Activity,label:pick(isEnglish,"排序与筛选","Sort and filter"),value:plan.dsl.factors.map(item=>item.id==="momentum_60"?pick(isEnglish,"60 日强度","60-day strength"):item.id==="low_volatility_20"?pick(isEnglish,"20 日低波动","20-day low volatility"):item.id==="reversal_5"?pick(isEnglish,"5 日反转","5-day reversal"):pick(isEnglish,"趋势过滤","Trend filter")).join(" + "),detail:plan.dsl.filters.filter(item=>item.enabled).map(item=>item.id==="exclude_high_volatility"?pick(isEnglish,"排除最高波动","Exclude highest volatility"):item.id==="trend_positive"?pick(isEnglish,"趋势为正","Positive trend"):item.id==="minimum_history"?pick(isEnglish,"上市时长足够","Sufficient listing history"):pick(isEnglish,"数据完整","Complete data")).join(" · ")||pick(isEnglish,"无额外过滤","No extra filters")},
      {id:"holdings",kind:"holdings",Icon:WalletCards,label:pick(isEnglish,"持仓与调仓","Holdings and rebalance"),value:pick(isEnglish,`选 ${plan.dsl.portfolio.max_positions} 只 · 等权`,`Top ${plan.dsl.portfolio.max_positions} · equal weight`),detail:pick(isEnglish,"固定最大持仓与单标上限","Fixed max positions and max single weight")},
      {id:"rebalance",kind:"rebalance",Icon:CalendarRange,label:pick(isEnglish,"多久重新比较","Review schedule"),value:plan.dsl.rebalance.frequency==="monthly"?pick(isEnglish,"每月一次","Monthly"):pick(isEnglish,"每两周一次","Every two weeks"),detail:pick(isEnglish,`每次计入 ${plan.dsl.costs.commission_bps+plan.dsl.costs.stamp_tax_bps+plan.dsl.costs.slippage_bps} bp 成本`,`Includes ${plan.dsl.costs.commission_bps+plan.dsl.costs.stamp_tax_bps+plan.dsl.costs.slippage_bps} bp costs`)},
    ];
    if(!graph.nodes.length) return fallbackNodes;
    const byId=Object.fromEntries(graph.nodes.map(node=>[node.id,node])) as Record<string,typeof graph.nodes[number]>;
    const root=byId[graph.root] ?? graph.nodes.find(node=>node.kind==="asset");
    if(!root) return fallbackNodes;
    const rootChildren=(from:string,condition?:string)=>graph.edges.filter(edge=>edge.from===from && (!condition||edge.condition===condition)).map(edge=>byId[edge.to]).filter(Boolean);
    const walk:typeof graph.nodes=[];
    const visited=new Set<string>();
    let cursor=root;
    for(let step=0;step<8;step++){
      walk.push(cursor);
      visited.add(cursor.id);
      const next=rootChildren(cursor.id,"next")[0];
      if(!next || visited.has(next.id)) break;
      cursor=next;
    }
    const sort=walk.find(node=>node.kind==="sort") ?? graph.nodes.find(node=>node.kind==="sort");
    const ifElseNode=sort ? rootChildren(sort.id,"next").find(node=>node.kind==="ifelse") : null;
    if(ifElseNode && walk[walk.length-1]?.id!==ifElseNode.id) walk.push(ifElseNode);
    const mapNode=(node: typeof graph.nodes[number])=>{
      const config=node.config ?? {};
      if(node.kind==="sort"){
        const factors=Array.isArray(config.factors)&&config.factors.length?config.factors as Array<{id:string;direction?:string;weight?:number}>:plan.dsl.factors;
        const filters=Array.isArray(config.filters)&&config.filters.length?(config.filters as Array<{id:string;enabled?:boolean}>):plan.dsl.filters;
        return {
          id:node.id,kind:node.kind,Icon:Activity,
          label:pick(isEnglish,"排序与筛选","Sort and filter"),
          value:factors.map(item=>item.id==="momentum_60"?pick(isEnglish,"60 日强度","60-day strength"):item.id==="low_volatility_20"?pick(isEnglish,"20 日低波动","20-day low volatility"):item.id==="reversal_5"?pick(isEnglish,"5 日反转","5-day reversal"):pick(isEnglish,"趋势过滤","Trend filter")).join(" + "),
          detail:filters.filter(item=>item.enabled!==false).map(item=>item.id==="exclude_high_volatility"?pick(isEnglish,"排除最高波动","Exclude highest volatility"):item.id==="trend_positive"?pick(isEnglish,"趋势为正","Positive trend"):item.id==="minimum_history"?pick(isEnglish,"上市时长足够","Sufficient listing history"):pick(isEnglish,"数据完整","Complete data")).join(" · ")||pick(isEnglish,"无额外过滤","No extra filters"),
        };
      }
      if(node.kind==="asset"){
        return {id:node.id,kind:node.kind,Icon:Layers3,label:pick(isEnglish,"股票范围","Stock universe"),value:sampleName,detail:pick(isEnglish,"所有候选与传统方法使用同一名单","All candidates and benchmarks use the same list")};
      }
      if(node.kind==="holdings"){
        return {id:node.id,kind:node.kind,Icon:WalletCards,label:pick(isEnglish,"持仓与调仓","Holdings and rebalance"),value:pick(isEnglish,`选 ${plan.dsl.portfolio.max_positions} 只 · 等权`,`Top ${plan.dsl.portfolio.max_positions} · equal weight`),detail:pick(isEnglish,"固定最大持仓与单标上限","Fixed max positions and max single weight")};
      }
      if(node.kind==="weight"){
        const maxPositions=Number((config as Record<string,unknown>).max_positions ?? plan.dsl.portfolio.max_positions);
        const singleWeight=Number((config as Record<string,unknown>).max_single_weight_pct ?? plan.dsl.portfolio.max_single_weight_pct);
        return {id:node.id,kind:node.kind,Icon:WalletCards,label:pick(isEnglish,"权重策略","Weight strategy"),value:pick(isEnglish,`每期最多 ${maxPositions} 只`,`Top ${maxPositions} positions`),detail:pick(isEnglish,`单标上限 ${singleWeight.toFixed(2)}%（仅影响权重上限）`,`Single-position cap ${singleWeight.toFixed(2)}%`)};
      }
      if(node.kind==="rebalance"){
        const rebalanceFrequency=(config.frequency as string)==="monthly" ? "monthly":"biweekly";
        const holdingDays=Number(config.holding_days ?? plan.dsl.rebalance.holding_days);
        const costs=typeof config.costs==="object" && config.costs ? (config.costs as Record<string,unknown>) : {commission_bps:plan.dsl.costs.commission_bps,stamp_tax_bps:plan.dsl.costs.stamp_tax_bps,slippage_bps:plan.dsl.costs.slippage_bps};
        return {id:node.id,kind:node.kind,Icon:CalendarRange,label:pick(isEnglish,"多久重新比较","Review schedule"),value:rebalanceFrequency==="monthly"?pick(isEnglish,"每月一次","Monthly"):pick(isEnglish,"每两周一次","Every two weeks"),detail:`${pick(isEnglish,"持有","Holding")} ${holdingDays} ${pick(isEnglish,"天 /","days /")} ${Number(costs.commission_bps as number)+Number(costs.stamp_tax_bps as number)+Number(costs.slippage_bps as number)} bp ${pick(isEnglish,"每期成本","cost / period")}`};
      }
      if(node.kind==="ifelse"){
        return {id:node.id,kind:node.kind,Icon:Layers3,label:pick(isEnglish,"IF / ELSE","IF / ELSE"),value:pick(isEnglish,"条件分支","Conditional branch"),detail:pick(isEnglish,"通过后继续排序与持有，不通过剔除候选","Pass leads to ranking / holding; fail removes candidate")};
      }
      if(node.kind==="filter"){
        const filters=Array.isArray(config.filters)?config.filters:plan.dsl.filters.map(item=>item.id);
        return {id:node.id,kind:node.kind,Icon:Filter,kindTag:"filter",label:pick(isEnglish,"过滤器","Filter"),value:filters.map(item=>String(item)).join(" + "),detail:pick(isEnglish,"仅用于 IF 分支","Used only on IF path")};
      }
      if(node.kind==="group"){return {id:node.id,kind:node.kind,Icon:Layers3,label:pick(isEnglish,"分组","Group"),value:pick(isEnglish,"资产分组","Asset grouping"),detail:pick(isEnglish,"分组节点（保留接口）","Grouping node (interface placeholder)")};}
      if(node.kind==="paste"){return {id:node.id,kind:node.kind,Icon:Copy,label:pick(isEnglish,"粘贴规则","Paste rule"),value:pick(isEnglish,"已粘贴规则片段","Pasted rule block"),detail:pick(isEnglish,"来源受控组件，不执行自由脚本","Controlled source, no free script")};}
      return {id:node.id,kind:node.kind,Icon:Layers3,label:pick(isEnglish,"资产","Node"),value:pick(isEnglish,`节点 ${node.id}`,`Node ${node.id}`),detail:pick(isEnglish,"保留节点","Retained node")};
    };
    const normalized=walk.map(item=>mapNode(item));
    const hasIfElse=normalized.some(node=>node.kind==="ifelse");
    if(!hasIfElse && ifElseNode) normalized.push(mapNode(ifElseNode));
    return normalized;
  },[graph,plan,isEnglish,sampleName,stockMap]);

  const sortNode=canvasNodes.find(node=>node.kind==="sort");
  const ifElseNode=sortNode ? graph.nodes.find(item=>item.kind==="ifelse" && item.id!=="" && graph.edges.some(edge=>edge.from===sortNode.id && edge.condition==="next" && edge.to===item.id)) : null;
  const ifElsePassNodes=ifElseNode ? graph.edges.filter(edge=>edge.from===ifElseNode.id && edge.condition==="if_true").map(edge=>canvasNodes.find(node=>node.id===edge.to)).filter(Boolean) : [];
  const ifElseFailNodes=ifElseNode ? graph.edges.filter(edge=>edge.from===ifElseNode.id && edge.condition==="if_false").map(edge=>canvasNodes.find(node=>node.id===edge.to)).filter(Boolean) : [];
  const selectedNode=canvasNodes.find(node=>node.id===selectedNodeId) ?? canvasNodes[0];
  const selectedIndex=canvasNodes.findIndex(node=>node.id===selectedNode.id);
  const hasFilters=plan.dsl.filters.some(item=>item.enabled) || (ifElsePassNodes.some(node=>Boolean(node)) && ifElsePassNodes.some(node=>node?.kind==="filter"));
  const filterNames=plan.dsl.filters.filter(item=>item.enabled).map(item=>item.id==="exclude_high_volatility"?pick(isEnglish,"排除最高波动","Exclude highest volatility"):item.id==="trend_positive"?pick(isEnglish,"趋势为正","Positive trend"):item.id==="minimum_history"?pick(isEnglish,"上市时长足够","Sufficient listing history"):pick(isEnglish,"数据完整","Complete data")).join(" · ")||pick(isEnglish,"无额外过滤","No filters");
  useEffect(()=>{if(canvasNodes[0]){setSelectedNodeId(current=>canvasNodes.some(node=>node.id===current)?current:canvasNodes[0].id);}},[canvasNodes]);
  function syncDslUpdate(nextDsl:StrategyDSL){onDslChange(nextDsl);onGraphChange(dslToGraph(nextDsl));}
  function formatFactorNames(){return plan.dsl.factors.map(item=>item.id==="momentum_60"?pick(isEnglish,"60 日强度","60-day strength"):item.id==="low_volatility_20"?pick(isEnglish,"20 日低波动","20-day low volatility"):item.id==="reversal_5"?pick(isEnglish,"5 日反转","5-day reversal"):pick(isEnglish,"趋势过滤","Trend filter")).join(" + ");}
  function toggleFactor(id:FactorId){
    const active=plan.dsl.factors.some(item=>item.id===id);
    const ids=active?plan.dsl.factors.map(item=>item.id).filter(item=>item!==id):[...plan.dsl.factors.map(item=>item.id),id];
    if(ids.length<1||ids.length>3)return;
    const weight=1/ids.length;
    syncDslUpdate({...plan.dsl,factors:ids.map(item=>({id:item,weight,direction:item==="low_volatility_20"?"lower":"higher"}))});
  }
  function toggleFilter(id:"trend_positive"|"exclude_high_volatility"|"minimum_history"|"exclude_missing_data"){
    const active=plan.dsl.filters.some(item=>item.id===id&&item.enabled);
    const filters=plan.dsl.filters.filter(item=>item.id!==id);
    if(!active)filters.push({id,enabled:true});
    syncDslUpdate({...plan.dsl,filters});
  }
  function onSetRebalance(period:"monthly"|"biweekly",holdingDays:number){syncDslUpdate({...plan.dsl,rebalance:{...plan.dsl.rebalance,frequency:period,holding_days:holdingDays}});}
  function applyAddRule(actionId:ComposerBlockActionId){
    const action=composerBlockActions.find(item=>item.id===actionId);
    if(!action) return;
    if(!graph.nodes.length) return;

    if(actionId === "asset"){
      setSelectedNodeId(graph.nodes.find(node=>node.kind==="asset")?.id ?? selectedNodeId);
      return;
    }

    const nodes = [...graph.nodes] as typeof graph.nodes;
    const edges = [...graph.edges] as typeof graph.edges;
    const selectedId = graph.nodes.some(node=>node.id===selectedNodeId) ? selectedNodeId : graph.nodes[0]?.id ?? "";
    const sortId = sortNode?.id ?? graph.nodes.find(node=>node.kind==="sort")?.id ?? "";

    const resolveRoot = ()=>{
      return graph.nodes.find(node=>node.id===graph.root)?.id
        ?? graph.nodes.find(node=>node.kind==="asset")?.id
        ?? graph.nodes[0]?.id
        ?? "";
    };
    const nextEdgesFrom = (id:string, condition?:"next"|"if_true"|"if_false") => {
      const list = edges.filter(edge=>edge.from===id);
      return (condition===undefined?list:list.filter(item=>item.condition===condition));
    };
    const primaryNext = (id:string) => {
      return nextEdgesFrom(id, "next")[0] ?? nextEdgesFrom(id, undefined)[0];
    };
    const removeNext = (id:string) => {
      for(let i=edges.length-1;i>=0;i--){
        if(edges[i]?.from===id && (edges[i]?.condition===undefined || edges[i]?.condition==="next")) edges.splice(i,1);
      }
    };

    const primaryNode = (from:string, condition?:"next"|"if_true"|"if_false") => {
      const found = primaryNext(from);
      if(!condition) return found ? byNodeId(found.to) : null;
      const hit = nextEdgesFrom(from, condition)[0];
      return hit ? byNodeId(hit.to) : null;
    };
    const byNodeId = (nodeId:string) => nodes.find(item=>item.id===nodeId) ?? null;
    const addEdge = (from:string,to:string,condition?:"next"|"if_true"|"if_false") => {
      if(!from||!to) return;
      edges.push({id:`${from}->${to}`,from,to,condition});
    };
    const allocateId = (kind:string) => {
      const suffix=nodes.filter(node=>node.kind===kind).length;
      return `${kind}-${suffix}`;
    };
    const insertBetween = (from:string,kind:string,config:Record<string,unknown>) => {
      const toNode = primaryNext(from);
      const nextId = toNode ? byNodeId(toNode.to)?.id : "";
      const nodeId=allocateId(kind);
      const newNode={id:nodeId,kind,label:kind,config} as typeof nodes[number];
      nodes.push(newNode);
      if(toNode) removeNext(from);
      addEdge(from,nodeId,"next");
      if(nextId) addEdge(nodeId,nextId,"next");
      return newNode;
    };

    const anchorId = (() => {
      if(actionId === "ifelse") return sortId || selectedId;
      if(selectedId && selectedId!=="" && nodes.some(item=>item.id===selectedId && item.kind!=="asset")) return selectedId;
      if(sortId) return sortId;
      return nodes[0]?.id ?? "";
    })();

    if(actionId === "ifelse"){
      const branchId = primaryNode(sortId,"next")?.id ? sortId : selectedId;
      const target = branchId || selectedId;
      if(!target) return;
      const ifElseId=allocateId("ifelse");
      const filterId=allocateId("filter");
      const failId=allocateId("paste");
      const oldNext = primaryNode(target,"next");
      const ifElseNode={id:ifElseId,kind:"ifelse",label:"IF / ELSE",config:{operator:"passFail"}} as typeof nodes[number];
      const filterNode={id:filterId,kind:"filter",label:"Filter",config:{filters:["trend_positive"],mode:"pass"}} as typeof nodes[number];
      const failNode={id:failId,kind:"paste",label:"Paste",config:{reason:"failed"}} as typeof nodes[number];
      removeNext(target);
      nodes.push(ifElseNode,filterNode,failNode);
      addEdge(target,ifElseId,"next");
      addEdge(ifElseId,filterId,"if_true");
      addEdge(ifElseId,failId,"if_false");
      if(oldNext){
        addEdge(filterId,oldNext.to,"next");
        addEdge(failId,oldNext.to,"next");
      }
      onGraphChange({version:"strategy-graph-v1",root:resolveRoot(),nodes,edges});
      setSelectedNodeId(ifElseId);
      return;
    }

    if(actionId === "weight"){
      const existing=nodes.find(item=>item.kind==="weight");
      if(existing){
        existing.config={...(existing.config),max_positions:plan.dsl.portfolio.max_positions,max_single_weight_pct:plan.dsl.portfolio.max_single_weight_pct,quantile:plan.dsl.portfolio.quantile,weighting:plan.dsl.portfolio.weighting};
        onGraphChange({version:"strategy-graph-v1",root:resolveRoot(),nodes,edges});
        setSelectedNodeId(existing.id);
        return;
      }
      const anchor = sortId || selectedId;
      const created=insertBetween(anchor,"weight",{max_positions:plan.dsl.portfolio.max_positions,max_single_weight_pct:plan.dsl.portfolio.max_single_weight_pct,quantile:plan.dsl.portfolio.quantile,weighting:plan.dsl.portfolio.weighting});
      onGraphChange({version:"strategy-graph-v1",root:resolveRoot(),nodes,edges});
      setSelectedNodeId(created.id);
      return;
    }

    if(actionId === "filter"){
      const anchor = selectedId || sortId;
      if(!anchor) return;
      const created=insertBetween(anchor,"filter",{filters:plan.dsl.filters.length ? plan.dsl.filters.map(item=>item.id) : ["trend_positive"],mode:"pass"});
      onGraphChange({version:"strategy-graph-v1",root:resolveRoot(),nodes,edges});
      setSelectedNodeId(created.id);
      return;
    }

    if(actionId === "group"){
      const anchor = anchorId;
      const created=insertBetween(anchor,"group",{mode:"custom",notes:"Group"});
      onGraphChange({version:"strategy-graph-v1",root:resolveRoot(),nodes,edges});
      setSelectedNodeId(created.id);
      return;
    }

    const anchor = anchorId;
    const created=insertBetween(anchor,"paste",{reason:"custom snippet"});
    onGraphChange({version:"strategy-graph-v1",root:resolveRoot(),nodes,edges});
    setSelectedNodeId(created.id);
  }

  function activeNodeLabel(){
    if(!selectedNode) return pick(isEnglish,"节点","Node");
    if(selectedNode.kind==="asset") return pick(isEnglish,"股票样本","stock sample");
    if(selectedNode.kind==="sort") return pick(isEnglish,"排序与过滤","sort and filter");
    if(selectedNode.kind==="holdings") return pick(isEnglish,"持仓与调仓","holdings and rebalance");
    if(selectedNode.kind==="ifelse") return pick(isEnglish,"IF/ELSE 条件","IF/ELSE condition");
    if(selectedNode.kind==="filter") return pick(isEnglish,"过滤条件","filter condition");
    if(selectedNode.kind==="rebalance") return pick(isEnglish,"频率与日历","frequency and calendar");
    return pick(isEnglish,"策略节点","strategy node");
  }
  return <div className="sr-editor-body">
    <div className="sr-node-stack">{canvasNodes.map((node,index)=>(
      <div key={node.id} className={`sr-node-wrap ${selectedNodeId===node.id?"sr-node-wrap--active":""}`} onMouseEnter={()=>setHoveredNode(node.id)} onMouseLeave={()=>setHoveredNode(null)}>
        <button type="button" className="sr-strategy-node" aria-pressed={selectedNodeId===node.id} onClick={()=>setSelectedNodeId(node.id)} onFocus={()=>setSelectedNodeId(node.id)}>
          <node.Icon/><span><small>{node.label}</small><strong>{node.value}</strong><em>{node.detail}</em></span><ChevronDown/>
        </button>
        {node.kind==="sort"&&(
          <div className="sr-branch-lane">
            <i/><span>{pick(isEnglish,"过滤判断","Filter decision")}</span>
            <div className="sr-branch-rules">
              <b>{pick(isEnglish,"先 IF / ELSE","IF/ELSE first")}</b>
              <b>{pick(isEnglish,"未通过不纳入本期候选","fail -> out this period")}</b>
            </div>
            <div className="sr-branch-outcomes">
              <b>{hasFilters?pick(isEnglish,"通过：继续比较","Pass: continue") : pick(isEnglish,"未设置过滤","No filters")}</b>
              <b>{hasFilters?pick(isEnglish,"不通过：剔除该标的","Fail: remove candidate") : pick(isEnglish,"可添加 Trend / Volatility","Add trend / volatility rule")}</b>
            </div>
          </div>
        )}
        {selectedNodeId===node.id&&<section className="sr-node-inline-editor" aria-live="polite">
          {node.kind==="asset"&&<details className="sr-inline-editor-sample" open><summary>{pick(isEnglish,"股票样本 (hover / click to edit inline)","Sample (hover / click to edit inline)")}</summary><SampleAdjustments isEnglish={isEnglish} options={options} busy={busy} onChange={onOptions}/></details>}
          {node.kind==="sort"&&<div className="sr-inline-rule-editor">
            <span>{pick(isEnglish,`排序特征（${plan.dsl.factors.length}/3）`,`Ranking traits (${plan.dsl.factors.length}/3)`)}</span>
            <div className="sr-inline-chip-row">{factorCatalog.map(([id,zh,en])=><button key={id} type="button" aria-pressed={plan.dsl.factors.some(item=>item.id===id)} disabled={busy} onClick={()=>toggleFactor(id)}>{isEnglish?en:zh}</button>)}</div>
            <span>{pick(isEnglish,"风险过滤（可选）","Risk filters (optional)")}</span>
            <div className="sr-inline-chip-row"><button type="button" aria-pressed={plan.dsl.filters.some(item=>item.id==="trend_positive"&&item.enabled)} disabled={busy} onClick={()=>toggleFilter("trend_positive")}>{pick(isEnglish,"趋势为正","Positive trend")}</button><button type="button" aria-pressed={plan.dsl.filters.some(item=>item.id==="exclude_high_volatility"&&item.enabled)} disabled={busy} onClick={()=>toggleFilter("exclude_high_volatility")}>{pick(isEnglish,"排除最高波动","Exclude highest volatility")}</button><button type="button" aria-pressed={plan.dsl.filters.some(item=>item.id==="minimum_history"&&item.enabled)} disabled={busy} onClick={()=>toggleFilter("minimum_history")}>{pick(isEnglish,"上市时长","History length")}</button></div>
            <small>{pick(isEnglish,"至少保留 1 个排序特征；最多 3 个。修改后旧回测立即失效。","Keep 1–3 ranking traits. Editing invalidates the previous backtest.")}</small>
          </div>}
          {node.kind==="holdings"&&<div className="sr-inline-rule-editor"><span>{pick(isEnglish,"持仓与调仓","Holdings")}</span>
            <div className="sr-inline-chip-row">
              <button type="button" aria-pressed={plan.dsl.portfolio.weighting==="equal"} disabled={busy} onClick={()=>syncDslUpdate({...plan.dsl,portfolio:{...plan.dsl.portfolio,weighting:"equal"}})}>{pick(isEnglish,"等权","Equal weight")}</button>
              <button type="button" aria-pressed={plan.dsl.portfolio.weighting==="equal"} disabled>{pick(isEnglish,"同权","Equal weight")}</button>
            </div>
            <label className="sr-inline-select"><span>{pick(isEnglish,"每期最多持有","Maximum holdings")}</span><select disabled={busy} value={options.maxPositions} onChange={event=>onOptions({...options,configurationMode:"manual",maxPositions:Number(event.target.value)})}>{[4,6,8,10,12].map(value=><option key={value} value={value}>{value} {pick(isEnglish,"只","stocks")}</option>)}</select></label>
            <small>{pick(isEnglish,"仅最大持仓会影响节点约束，排序与过滤逻辑不变。","Only max positions affect holding constraints; sorting and filter logic stays unchanged.")}</small>
          </div>}
          {node.kind==="rebalance"&&<div className="sr-inline-rule-editor"><span>{pick(isEnglish,"重新比较频率","Review frequency")}</span><div className="sr-inline-chip-row"><button type="button" aria-pressed={plan.dsl.rebalance.frequency==="monthly"} disabled={busy} onClick={()=>onSetRebalance("monthly",20)}>{pick(isEnglish,"每月","Monthly")}</button><button type="button" aria-pressed={plan.dsl.rebalance.frequency==="biweekly"} disabled={busy} onClick={()=>onSetRebalance("biweekly",10)}>{pick(isEnglish,"每两周","Every two weeks")}</button></div><small>{pick(isEnglish,"固定候选与同一成本一起比较，锁定历史不会再改规则。","Candidates remain fixed with one benchmarked cost model; the locked period never re-tunes rules.")}</small></div>}
            {node.kind==="ifelse"&&<div className="sr-inline-rule-editor"><span>{pick(isEnglish,"IF / ELSE","IF / ELSE")}</span><small>{pick(isEnglish,"通过/不通过由过滤条件驱动；编辑继续通过排序节点配置。","Pass/fail is driven by filter conditions; edit sort and filters to adjust logic.")}</small><div className="sr-inline-chip-row"><small>{filterNames}</small></div></div>}
            {node.kind==="weight"&&<div className="sr-inline-rule-editor"><span>{pick(isEnglish,"持仓权重","Position weight")}</span><small>{pick(isEnglish,"可直接改最大持仓与单标上限。","Edit max positions and single-symbol cap directly.")}</small><div className="sr-inline-chip-row"><button type="button" aria-pressed={true} onClick={()=>syncDslUpdate({...plan.dsl,portfolio:{...plan.dsl.portfolio,max_positions:plan.dsl.portfolio.max_positions}})}>{pick(isEnglish,"等权","Equal weight")}</button></div></div>}
            {node.kind==="filter"&&<div className="sr-inline-rule-editor"><span>{pick(isEnglish,"过滤片段","Filter segment")}</span><small>{filterNames || pick(isEnglish,"无可用过滤片段","No filter segment")}</small></div>}
          </section>}
        {index<canvasNodes.length-1&&<i className="sr-node-connector"/>}
      </div>
    ))}</div>
    <section className="sr-node-inspector" aria-live="polite">
      <header><span><ShieldCheck/><strong>{pick(isEnglish,"当前编辑节点","Active node")}</strong></span><small>{activeNodeLabel()}</small></header>
      <p>{selectedNode?.detail ?? ""}</p>
      {(selectedNode?.kind==="sort"||selectedNode?.kind==="filter")&&selectedNode&&<p className="sr-inline-node-note">{filterNames}</p>}
      <details className="sr-inline-add-blocks">
        <summary>{pick(isEnglish,"添加组件（白名单）","Add block (whitelist)")}</summary>
        <p>{pick(isEnglish,"只允许：Asset、Group、Weight、IF/ELSE、Filter、Paste。","Allowed only: Asset, Group, Weight, IF/ELSE, Filter, Paste.")}</p>
        <div>{composerBlockActions.map(action=><button type="button" key={action.id} disabled={busy} className={hoveredNode===selectedNodeId?"sr-add-inline":"sr-add-inline"} onClick={()=>applyAddRule(action.id)}>{pick(isEnglish,action.zh,action.en)}</button>)}</div>
      </details>
    </section>
  </div>;
}

function PreflightDock({isEnglish=false,plan,options,sampleName,busy,message,onOptions,onRun,onCancel}:{isEnglish?:boolean;plan:StrategyPlan|null;options:ResearchOptions;sampleName:string;busy:string|null;message:string;onOptions:(options:ResearchOptions)=>void;onRun:()=>void;onCancel:()=>void}){
  if(!plan)return <div className="sr-preview-empty"><header><BarChart3/><span><strong>{pick(isEnglish,"回测预览","Backtest preview")}</strong><small>{pick(isEnglish,"规则确认后才读取数据","Data loads only after review")}</small></span></header><div className="sr-preview-chart-placeholder"><i/><i/><i/><span>{pick(isEnglish,"候选与传统参照会画在同一张图","Candidate and benchmark will share one chart")}</span></div><ul><li><Check/>{pick(isEnglish,"研究区：寻找思路","Research: generate ideas")}</li><li><Check/>{pick(isEnglish,"验证区：独立比较","Validation: independent comparison")}</li><li><LockKeyhole/>{pick(isEnglish,"锁定区：最后才打开","Locked test: opened last")}</li></ul></div>;
  const target=options.targetCandidates??2;
  return <div className="sr-preflight-dock"><header><BarChart3/><span><strong>{pick(isEnglish,"准备运行","Ready to test")}</strong><small>{sampleName}</small></span></header>
    <div className="sr-preflight-facts"><span><small>{pick(isEnglish,"扫描上限","Screening limit")}</small><strong>{options.candidateBudget}</strong></span><span><small>{pick(isEnglish,"最后检查","Final checks")}</small><strong>{target}</strong></span><span><small>{pick(isEnglish,"固定参照","Fixed benchmarks")}</small><strong>4</strong></span></div>
    <div className="sr-gate-summary"><Target/><span><small>{pick(isEnglish,"通过线","Passing rule")}</small><strong>{pick(isEnglish,`先在验证区按“${goalLabels[plan.dsl.research_goal]}”胜过固定传统参照，锁定区再检查一次`,`Beat the fixed traditional reference in validation, then repeat in the locked test`)}</strong></span></div>
    <AutomationGoal isEnglish={isEnglish} options={options} busy={busy==="plan"} onChange={onOptions}/>
    {message&&<p className="sr-inline-message sr-dock-message" role="alert">{message}</p>}
    {busy==="run"?<ResearchRunning isEnglish={isEnglish} liveData={options.universeMode==="custom"} onCancel={onCancel}/>:<button className="sr-primary sr-dock-run" disabled={busy==="plan"} onClick={onRun}><Play/>{pick(isEnglish,`运行统一回测`,`Run unified backtest`)}</button>}
    <p className={`sr-dock-disclaimer ${options.universeMode==="preset"?"classroom":""}`}>{options.universeMode==="preset"?<><History/>{pick(isEnglish,"课堂演示样本可重复播放；结果只用于展示历史研究流程。","The classroom sample can be replayed; results only demonstrate the historical research workflow.")}</>:pick(isEnglish,"运行后不会自动继续改参数；已测组合会记入去重记录。","The locked result never tunes parameters; tested combinations are remembered.")}</p>
  </div>;
}

function WorkbenchResultPanel({isEnglish=false,run,selectedStrategyId,busy,message,onSelect,onSave,onRestart}:{isEnglish?:boolean;run:ResearchRun;selectedStrategyId:string;busy:boolean;message:string;onSelect:(id:string)=>void;onSave:()=>void;onRestart:()=>void}){
  const outcome=presentResearchOutcome(run);
  const finalists=outcome.finalists;
  const reference=run.evaluations.find(item=>item.strategy.id===run.comparison_standard.benchmark_strategy_id);
  const fallbackGoal:ResearchGoal=(run.evaluations[0]?.strategy?.research_goal) ?? "balanced";
  const saveable=run.evaluations.filter(item=>item.strategy.source!=="constrained_ai"||item.status==="limited_candidate");
  const preferredFocus=finalists.find(item=>item.status==="limited_candidate")?.strategy.id??finalists[0]?.strategy.id??"";
  const [focusedCandidateId,setFocusedCandidateId]=useState(preferredFocus);
  const activeId=finalists.some(item=>item.strategy.id===focusedCandidateId)?focusedCandidateId:preferredFocus;
  const selected=saveable.find(item=>item.strategy.id===selectedStrategyId);
  const classroomFocus=run.data_audit.status==="demo"?run.evaluations.find(item=>item.strategy.source==="user"||item.strategy.source==="template"):undefined;
  return <div className="sr-result-dock">
    <header><span className={outcome.kept?"passed":"failed"}>{outcome.kept?<Check/>:<X/>}</span><div><small>{pick(isEnglish,`已扫描 ${run.candidates_generated} 组`,`Screened ${run.candidates_generated}`)}</small><strong>{outcome.kept?pick(isEnglish,`保留 ${outcome.kept} 个候选`,`Retained ${outcome.kept}`):pick(isEnglish,"本次没有候选通过","No candidate passed")}</strong><p>{outcome.kept?pick(isEnglish,"逐个点击比较；这里从不显示平均策略。","Select each candidate; no averaged strategy is shown."):pick(isEnglish,"回测已完成验证段；因为没有候选通过，锁定段按规则没有打开。","Validation testing finished; the locked period stayed closed because no candidate passed.")}</p></div><button type="button" onClick={onRestart}>{pick(isEnglish,"调整并重新测试","Adjust and retest")}</button></header>
    <div className="sr-run-funnel"><span><b>{run.candidates_generated}</b><small>{pick(isEnglish,"扫描","screened")}</small></span><ArrowRight/><span><b>{finalists.length}</b><small>{pick(isEnglish,"最后检查","final checks")}</small></span><ArrowRight/><span className={outcome.kept?"passed":""}><b>{outcome.kept}</b><small>{pick(isEnglish,"保留","retained")}</small></span></div>
    {run.classroom_replay&&<p className="sr-classroom-replay" role="status"><History/>{pick(isEnglish,"课堂演示复盘：重复播放既有历史结果，不计作一次新的锁定验证。","Classroom replay: this reopens an existing historical result and does not count as a new locked validation.")}</p>}
    {finalists.length>0&&reference?<div className="sr-dock-results"><FinalCandidateComparisons items={finalists} reference={reference} goal={fallbackGoal} selectedId={activeId} onSelect={id=>{setFocusedCandidateId(id);if(finalists.find(item=>item.strategy.id===id)?.status==="limited_candidate")onSelect(id)}} isEnglish={isEnglish}/><BacktestPlayback key={activeId} run={run} compact simpleCompare focusStrategyId={activeId} isEnglish={isEnglish}/></div>:classroomFocus&&reference?<section className="sr-classroom-result"><div><History/><span><strong>{pick(isEnglish,"课堂展示：原始方法与固定参照","Classroom view: original method vs fixed reference")}</strong><small>{pick(isEnglish,"候选没有通过筛选，但仍显示已完成历史区间的折线，便于讲解流程；这不是通过结果。","No candidate passed, but the completed historical periods remain visible for teaching. This is not a passing result.")}</small></span></div><BacktestPlayback key={classroomFocus.strategy.id} run={run} compact simpleCompare focusStrategyId={classroomFocus.strategy.id} isEnglish={isEnglish}/><button type="button" onClick={onRestart}><RotateCcw/>{pick(isEnglish,"调整后再次演示","Adjust and replay")}</button></section>:<div className="sr-dock-no-final"><LockKeyhole/><strong>{pick(isEnglish,"验证已完成，锁定历史未打开","Validation finished; locked history stayed closed")}</strong><p>{pick(isEnglish,"没有候选先通过独立验证区。你可以调整扫描数量或规则后再次测试。","No candidate passed independent validation. Adjust the screening size or rules, then test again.")}</p><button type="button" onClick={onRestart}><RotateCcw/>{pick(isEnglish,"调整扫描量并重新测试","Adjust screening and retest")}</button></div>}
    <section className="sr-save-strip"><label><span>{pick(isEnglish,"保存为研究方法","Save as research method")}</span><select value={selectedStrategyId} onChange={event=>onSelect(event.target.value)}>{saveable.map(item=><option key={item.strategy.id} value={item.strategy.id}>{isEnglish?englishStrategyName(item.strategy):item.strategy.name} · {isEnglish?englishRoleStatus(item):roleAwareStatus(item)}</option>)}</select></label><button className="sr-primary" disabled={busy||!selectedStrategyId} onClick={onSave}><Save/>{busy?pick(isEnglish,"保存中…","Saving…"):pick(isEnglish,"保存","Save")}</button>{selected&&<small>{pick(isEnglish,"仅保存规则、条件和证据，不保存买卖信号。","Saves rules, conditions and evidence—not a trading signal.")}</small>}{message&&<p role="status">{message}</p>}</section>
  </div>;
}

function WorkbenchDetails({isEnglish=false,run}:{isEnglish?:boolean;run:ResearchRun}){
  return <details className="sr-workbench-details"><summary><SlidersHorizontal/>{pick(isEnglish,"展开筛选过程与专业指标","Open screening process and professional metrics")}<ChevronDown/></summary><div><section><ResearchFunnelSummary run={run} isEnglish={isEnglish}/><HarnessFlow run={run} isEnglish={isEnglish}/></section><section><CostAndStability run={run} isEnglish={isEnglish}/><ComparisonDashboard run={run} isEnglish={isEnglish}/><DataAudit run={run} isEnglish={isEnglish}/><MetricsTable run={run} isEnglish={isEnglish}/></section></div></details>;
}

function StageBar({stage,isEnglish=false}:{stage:1|2|3;isEnglish?:boolean}){return <nav className="sr-stagebar" aria-label={pick(isEnglish,"研究流程","Research flow")}>{(isEnglish?["Describe","Review rules","See results"]:["说想法","看懂规则","看结果"]).map((label,index)=>{const number=index+1;return <span key={label} className={stage===number?"active":stage>number?"done":""}><i>{stage>number?<Check/>:number}</i>{label}</span>})}</nav>}

function StartView({isEnglish=false,mode,text,goal,busy,message,onMode,onText,onGoal,onExample,onCreate}:{isEnglish?:boolean;mode:"idea"|"goal";text:string;goal:ResearchGoal;busy:boolean;message:string;onMode:(mode:"idea"|"goal")=>void;onText:(value:string)=>void;onGoal:(goal:ResearchGoal,description:string)=>void;onExample:(index:number)=>void;onCreate:()=>void}){
  const title=pick(isEnglish,"和策略研究助手聊聊","Chat with the strategy research assistant");
  const description=pick(isEnglish,"说一个模糊想法，或只说你想改善什么。助手会先生成可确认、可调整的草案，不会直接运行。","Describe a rough idea, or only say what you want to improve. The assistant creates a confirmable, adjustable draft before anything runs.");
  return <section className="sr-launch sr-composer-launch" aria-labelledby="sr-launch-title">
    <header><span className="sr-ai-kicker"><Sparkles/>{pick(isEnglish,"AI 辅助策略创建","AI-assisted strategy creation")}</span><h2 id="sr-launch-title">{title}</h2><p>{description}</p></header>
    <section className="sr-ai-command" aria-label={pick(isEnglish,"策略研究对话输入","Strategy research prompt")}>
      <header><Sparkles/><span><strong>{pick(isEnglish,"研究指令栏","Research command bar")}</strong><small>{mode==="idea"?pick(isEnglish,"把想法变成规则","Turn an idea into rules"):pick(isEnglish,"按目标生成三个起点","Generate three starting points from a goal")}</small></span></header>
      <div><textarea value={text} maxLength={1000} onChange={event=>onText(event.target.value)} aria-label={mode==="idea"?pick(isEnglish,"描述你的想法","Describe your idea"):pick(isEnglish,"描述你的研究目标","Describe your research goal")} placeholder={pick(isEnglish,"例如：我想找一个历史回撤没那么大、也不要频繁调整的方法。","For example: I want a method with smaller historical drawdowns and fewer changes.")}/><button className="sr-primary" disabled={busy||!text.trim()} onClick={onCreate}>{busy?pick(isEnglish,"正在生成草案…","Creating draft…"):mode==="goal"?pick(isEnglish,"生成三个起点","Create three starting points"):pick(isEnglish,"生成策略草案","Create strategy draft")}<ArrowRight/></button></div>
      <footer><span><ShieldCheck/>{pick(isEnglish,"先预览和确认，再读取数据回测","Preview and confirm before loading data or backtesting")}</span><b>{text.length}/1000</b></footer>
    </section>
    <div className="sr-path-label">{pick(isEnglish,"你现在更接近哪一种？","Which best describes where you are?")}</div>
    <div className="sr-entry-switch" role="group" aria-label={pick(isEnglish,"选择开始方式","Choose how to start")}><button aria-pressed={mode==="idea"} onClick={()=>onMode("idea")}><Lightbulb/><span><strong>{pick(isEnglish,"我有一个想法","I have an idea")}</strong><small>{pick(isEnglish,"哪怕还很模糊","Even if it is still rough")}</small></span></button><button aria-pressed={mode==="goal"} onClick={()=>onMode("goal")}><Target/><span><strong>{pick(isEnglish,"我只有目标","I only have a goal")}</strong><small>{pick(isEnglish,"让助手给我起点","Let the assistant suggest starting points")}</small></span></button></div>
    {mode==="goal"?<div className="sr-goal-pills" role="group" aria-label={pick(isEnglish,"选择研究目标","Choose a research goal")}>{GOALS.map(item=><button key={item.id} aria-pressed={goal===item.id} onClick={()=>onGoal(item.id,isEnglish?goalLabelsEn[item.id]:item.description)}>{isEnglish?goalLabelsEn[item.id]:item.label}</button>)}</div>:<div className="sr-example-pills" aria-label={pick(isEnglish,"想法示例","Idea examples")}>{(isEnglish?ideaExamplesEn:ideaExamples).map((item,index)=><button key={item} onClick={()=>onExample(index)}>{item}</button>)}</div>}
    {message&&<p className="sr-inline-message" role="status">{message}</p>}
    <details className="sr-quiet-help"><summary>{pick(isEnglish,"它接下来会做什么？","What happens next?")}</summary><p>{pick(isEnglish,"助手只从允许的因子、过滤器和参数中整理规则。你确认后，确定性引擎才会用相同数据和成本比较传统方法与候选；不会荐股、下单或承诺未来收益。","The assistant only uses allowed factors, filters and parameters. After you confirm, the deterministic engine compares traditional methods and candidates using the same data and costs. It never recommends stocks, trades, or promises returns.")}</p></details>
  </section>;
}

function SimpleDraftView({isEnglish=false,plan,options,busy,message,onBack,onStartingPoint,onOptions,onRun,onCancel}:{isEnglish?:boolean;plan:StrategyPlan;options:ResearchOptions;busy:string|null;message:string;onBack:()=>void;onStartingPoint:(id:string)=>void;onOptions:(options:ResearchOptions)=>void;onRun:()=>void;onCancel:()=>void}){
  const essentials=isEnglish?englishEssentials(plan):[...plan.plain_rules.slice(0,4).map(rule=>{const [name,...rest]=rule.split("：");return [name,rest.join("：")]}),["判断目标",goalLabels[plan.dsl.research_goal]]];
  const preset=universePreset(options.universeId);
  const sampleName=options.universeMode==="custom"?pick(isEnglish,`自选 ${options.customSymbols.length} 只`,`${options.customSymbols.length} selected stocks`):pick(isEnglish,preset.name,`${preset.symbols.length}-stock cross-industry sample`);
  const runLabel=pick(isEnglish,`检查最多 ${options.candidateBudget} 种方法`,`Check up to ${options.candidateBudget} methods`);
  const referenceName=plan.research_settings.comparison_gate==="goal_relative_equal_weight"?pick(isEnglish,"同股票样本等权持有","equal-weight holding of the same stocks"):pick(isEnglish,"按目标表现最好的传统方法","the best traditional method for this goal");
  const sampleCodes=options.universeMode==="custom"?options.customSymbols:[...preset.symbols];
  const sampleNames=sampleCodes.slice(0,6).map(code=>STOCK_SAMPLE.find(item=>item[0]===code)?.[1]??code).join("、");
  const plannerLabel=plan.planner==="constrained_ai"?pick(isEnglish,"AI 已生成 · 等你确认","AI generated · awaiting review"):pick(isEnglish,"受控规则模式 · 等你确认","Controlled rule mode · awaiting review");
  return <section className="sr-simple-draft sr-ai-draft" aria-labelledby="sr-simple-draft-title">
    <button className="sr-back" onClick={onBack}><ArrowLeft/>{pick(isEnglish,"继续和助手描述","Keep describing to the assistant")}</button>
    <header className="sr-draft-heading"><span><Sparkles/>{pick(isEnglish,"系统听懂的是","The system understood")}</span><h2 id="sr-simple-draft-title">{pick(isEnglish,"先看草案，再决定是否检验","Review the draft before testing it")}</h2><p>{pick(isEnglish,"每个模块都来自允许的研究组件。这里没有自由代码，也不会因为历史结果自动改规则。","Every block comes from an allowed research component. There is no free-form code, and historical results never rewrite the rules automatically.")}</p></header>
    {plan.starting_points.length>0&&<section className="sr-start-choice"><span>{pick(isEnglish,"选一个起点","Choose one starting point")}</span><div>{plan.starting_points.map(item=>{const english=startingPointEn[item.id];return <button key={item.id} aria-pressed={plan.selected_starting_point_id===item.id} disabled={busy==="plan"} onClick={()=>onStartingPoint(item.id)}><strong>{isEnglish?english[0]:item.name}</strong><small>{isEnglish?english[1]:item.summary}</small></button>})}</div></section>}
    <div className="sr-ai-draft-workspace">
      <section className="sr-ai-conversation" aria-label={pick(isEnglish,"与策略助手的对话","Conversation with the strategy assistant")}><article className="user"><span>{pick(isEnglish,"你","You")}</span><p>{plan.original_input}</p></article><article className="assistant"><span><Sparkles/>{pick(isEnglish,"策略研究助手","Strategy research assistant")}<b>{plannerLabel}</b></span><strong>{isEnglish?englishStrategyName(plan.dsl):plan.dsl.name}</strong><p>{isEnglish?englishThesis(plan.dsl):plan.dsl.thesis_plain}</p></article></section>
      <StrategyLogicCanvas isEnglish={isEnglish} plan={plan} essentials={essentials} sampleName={sampleName}/>
    </div>
    <section className="sr-confirmation-grid" aria-label={pick(isEnglish,"运行前确认","Confirm before running")}>
      <article><span>{pick(isEnglish,"股票与数据","Stocks and data")}</span><strong>{sampleName} · {options.universeMode==="custom"?pick(isEnglish,"运行时提取公开历史","Public history loaded at run time"):pick(isEnglish,"固定合成演示数据","Fixed synthetic demo data")}</strong><small>{sampleNames}{sampleCodes.length>6?pick(isEnglish,"等"," and others"):""}</small></article>
      <article><span>{pick(isEnglish,"费用怎样扣","How costs are applied")}</span><strong>{pick(isEnglish,`每期换手 × ${plan.dsl.costs.commission_bps+plan.dsl.costs.stamp_tax_bps+plan.dsl.costs.slippage_bps} bp`,`Turnover each period × ${plan.dsl.costs.commission_bps+plan.dsl.costs.stamp_tax_bps+plan.dsl.costs.slippage_bps} bp`)}</strong><small>{pick(isEnglish,`佣金 ${plan.dsl.costs.commission_bps} + 印花税 ${plan.dsl.costs.stamp_tax_bps} + 滑点 ${plan.dsl.costs.slippage_bps}；1 bp = 0.01%`,`Commission ${plan.dsl.costs.commission_bps} + stamp duty ${plan.dsl.costs.stamp_tax_bps} + slippage ${plan.dsl.costs.slippage_bps}; 1 bp = 0.01%`)}</small></article>
      <article className="wide"><span>{pick(isEnglish,"什么才算通过","What counts as passing")}</span><strong>{pick(isEnglish,`按“${goalLabels[plan.dsl.research_goal]}”，先在独立验证期胜过“${referenceName}”，最后一段还要再胜一次`,`For “${goalLabelsEn[plan.dsl.research_goal]}”, beat “${referenceName}” in validation, then beat it again in the final period`)}</strong><small>{pick(isEnglish,`最多检查 ${options.candidateBudget} 个候选策略；选 ${options.targetCandidates} 个策略做最后检查，不是选 ${options.targetCandidates} 只股票。`,`Check up to ${options.candidateBudget} candidate strategies; ${options.targetCandidates} strategies, not stocks, enter the final check.`)}</small></article>
    </section>
    <section className="sr-quick-settings" aria-label={pick(isEnglish,"单击调整研究强度","One-click research settings")}><header><Sparkles/><span><strong>{pick(isEnglish,"单击调整，不用懂参数","Adjust with one click—no parameter knowledge needed")}</strong><small>{pick(isEnglish,"只改变搜索量和停止方式，不偷偷改变上面的策略逻辑","Only the search effort and stopping rule change; the strategy logic above stays fixed")}</small></span></header><div><span>{pick(isEnglish,"扫描规模","Search effort")}</span>{([100,500,1000] as CandidateBudget[]).map(value=><button key={value} type="button" aria-pressed={options.candidateBudget===value} disabled={busy==="plan"} onClick={()=>onOptions({...options,candidateBudget:value,maxRounds:1})}>{value===100?pick(isEnglish,"快速 · 100","Quick · 100"):value===500?pick(isEnglish,"标准 · 500","Standard · 500"):pick(isEnglish,"深入 · 1000","Deep · 1,000")}</button>)}<span>{pick(isEnglish,"何时停止","When to stop")}</span><button type="button" aria-pressed={options.searchMode==="stop_on_validation_target"} disabled={busy==="plan"} onClick={()=>onOptions({...options,searchMode:"stop_on_validation_target"})}>{pick(isEnglish,`找够 ${options.targetCandidates} 个就检查`,`Check after finding ${options.targetCandidates}`)}</button><button type="button" aria-pressed={options.searchMode==="exhaust_budget"} disabled={busy==="plan"} onClick={()=>onOptions({...options,searchMode:"exhaust_budget"})}>{pick(isEnglish,"跑满本次预算","Use the full budget")}</button></div></section>
    <div className="sr-draft-adjustments"><details className="sr-adjust-disclosure"><summary><SlidersHorizontal/><span>{pick(isEnglish,"查看或修改股票名单","View or change the stock list")}<small>{sampleName}</small></span></summary><SampleAdjustments isEnglish={isEnglish} options={options} busy={busy==="plan"} onChange={onOptions}/></details><AutomationGoal isEnglish={isEnglish} options={options} busy={busy==="plan"} onChange={onOptions}/></div>
    {message&&<p className="sr-inline-message" role="status">{message}</p>}
    {busy==="run"?<ResearchRunning isEnglish={isEnglish} liveData={options.universeMode==="custom"} onCancel={onCancel}/>:<button className="sr-primary sr-run-action" disabled={busy==="plan"} onClick={onRun}>{runLabel} <ArrowRight/></button>}
  </section>;
}

function StrategyLogicCanvas({isEnglish=false,plan,essentials,sampleName}:{isEnglish?:boolean;plan:StrategyPlan;essentials:string[][];sampleName:string}){
  const icons=[Layers3,Activity,ShieldCheck,CalendarRange];
  const blocks=essentials.slice(0,4).map((item,index)=>({label:item[0]||pick(isEnglish,`规则 ${index+1}`,`Rule ${index+1}`),value:item[1]||"—",Icon:icons[index]}));
  const cost=plan.dsl.costs.commission_bps+plan.dsl.costs.stamp_tax_bps+plan.dsl.costs.slippage_bps;
  return <section className="sr-logic-canvas" aria-labelledby="sr-logic-canvas-title"><header><span><Sparkles/><strong id="sr-logic-canvas-title">{pick(isEnglish,"可确认策略画布","Confirmable strategy canvas")}</strong></span><b>{pick(isEnglish,"受控组件","Controlled blocks")}</b></header><div role="img" aria-label={pick(isEnglish,"从股票范围到调仓节奏的策略逻辑流程","Strategy logic from stock universe to review frequency")}>{blocks.map(({label,value,Icon},index)=><div className="sr-logic-step" key={`${label}-${index}`}><article><Icon/><span><small>{label}</small><strong>{index===0?sampleName:value}</strong></span></article>{index<blocks.length-1&&<ArrowRight/>}</div>)}</div><footer><span><WalletCards/>{pick(isEnglish,`等权 · 每期成本 ${cost} bp`,`Equal weight · ${cost} bp cost per period`)}</span><span><ShieldCheck/>{pick(isEnglish,"仅历史研究 · 不执行交易","Historical research only · no trading")}</span></footer></section>;
}

function AutomationGoal({isEnglish=false,options,busy,onChange}:{isEnglish?:boolean;options:ResearchOptions;busy:boolean;onChange:(options:ResearchOptions)=>void}){
  const target=options.targetCandidates??2;
  const [draftBudget,setDraftBudget]=useState(options.candidateBudget);
  const normalizedBudget=(value:number)=>Math.min(2000,Math.max(50,Math.round(value/50)*50));
  const commitBudget=(value:number)=>{const next=normalizedBudget(value);setDraftBudget(next);if(next!==options.candidateBudget)onChange({...options,candidateBudget:next,maxRounds:1})};
  const explanation=options.searchMode==="stop_on_validation_target"?pick(isEnglish,`每 50 组检查一次；验证区先选出 ${target} 个，再统一打开最后一段历史。最后一段结果不会用来继续调参。最多扫描 ${options.candidateBudget} 组，已测试组合会自动跳过。`,`Checks every 50 combinations; ${target} validation winners are selected before the final period is opened once. Final-period results never trigger more tuning. Up to ${options.candidateBudget} combinations, with tested combinations skipped.`):pick(isEnglish,`扫描完 ${options.candidateBudget} 组后统一比较；已经测试过的相同组合会自动跳过。`,`Screens all ${options.candidateBudget} combinations, automatically skipping identical combinations already tested.`);
  return <section className="sr-automation-goal" aria-labelledby="sr-automation-title">
    <header><Activity/><span><strong id="sr-automation-title">{pick(isEnglish,"自动筛选设置","Automatic screening")}</strong><small>{pick(isEnglish,`最多 ${options.candidateBudget} 组 · 选 ${target} 个做最后检查`, `Up to ${options.candidateBudget} · send ${target} to the final check`)}</small></span></header>
    <details className="sr-automation-advanced" open><summary>{pick(isEnglish,"扫描数量与停止方式","Screening size and stopping rule")}</summary><div className="sr-automation-controls">
      <div className="sr-volume-control"><span>{pick(isEnglish,"扫描上限","Screening limit")}</span><div className="sr-search-mode" role="group" aria-label={pick(isEnglish,"扫描规模","Screening size")}>{([100,500,1000] as CandidateBudget[]).map(value=><button key={value} type="button" aria-pressed={options.candidateBudget===value} disabled={busy} onClick={()=>{setDraftBudget(value);onChange({...options,candidateBudget:value,maxRounds:1})}}>{value===100?pick(isEnglish,"100 · 快速","100 · Quick"):value===500?pick(isEnglish,"500 · 标准","500 · Standard"):pick(isEnglish,"1000 · 深度","1,000 · Deep")}</button>)}</div><label className="sr-budget-control"><span className="sr-sr-only">{pick(isEnglish,"自定义扫描数量","Custom screening size")}</span><div><input type="range" min="50" max="2000" step="50" value={draftBudget} disabled={busy} onChange={event=>setDraftBudget(Number(event.target.value))} onPointerUp={event=>commitBudget(Number(event.currentTarget.value))} onKeyUp={event=>commitBudget(Number(event.currentTarget.value))} aria-label={pick(isEnglish,"拖动调整候选组合数量","Adjust candidate combinations")}/><input type="number" min="50" max="2000" step="50" value={draftBudget} disabled={busy} onChange={event=>setDraftBudget(Number(event.target.value))} onBlur={event=>commitBudget(Number(event.currentTarget.value))} onKeyDown={event=>{if(event.key==="Enter")commitBudget(Number(event.currentTarget.value))}} aria-label={pick(isEnglish,"输入候选组合数量","Enter candidate combinations")}/></div></label></div>
      <label><span>{pick(isEnglish,"送入最后检查","Send to final check")}</span><select disabled={busy} value={target} onChange={event=>onChange({...options,targetCandidates:Number(event.target.value) as TargetCandidates})}>{[1,2,3,4,5,6].map(value=><option key={value} value={value}>{isEnglish?`${value} validation candidate${value===1?"":"s"}`:`${value} 个验证候选`}</option>)}</select></label>
      <div className="sr-stop-mode" role="group" aria-label={pick(isEnglish,"何时停止扫描","When to stop screening")}><span>{pick(isEnglish,"扫描方式","Screening mode")}</span><button type="button" aria-pressed={options.searchMode==="stop_on_validation_target"} disabled={busy} onClick={()=>onChange({...options,searchMode:"stop_on_validation_target"})}>{pick(isEnglish,`够 ${target} 个就检查`,`Check after ${target}`)}</button><button type="button" aria-pressed={options.searchMode==="exhaust_budget"} disabled={busy} onClick={()=>onChange({...options,searchMode:"exhaust_budget"})}>{pick(isEnglish,"跑满上限","Use full budget")}</button></div>
    </div><p>{explanation}</p></details>
  </section>;
}

function SampleAdjustments({isEnglish=false,options,busy,onChange}:{isEnglish?:boolean;options:ResearchOptions;busy:boolean;onChange:(options:ResearchOptions)=>void}){
  type StockChoice={code:string;name:string;industry:string};
  const holdingOptions=[4,6,8,12] as const;
  const [query,setQuery]=useState("");
  const [suggestions,setSuggestions]=useState<StockChoice[]>([]);
  const [knownStocks,setKnownStocks]=useState<StockChoice[]>(STOCK_SAMPLE.map(item=>({code:item[0],name:item[1],industry:item[2]})));
  const [searchState,setSearchState]=useState("");
  useEffect(()=>{
    if(query.trim().length<2){const reset=window.setTimeout(()=>{setSuggestions([]);setSearchState("")},0);return()=>window.clearTimeout(reset)}
    const controller=new AbortController();
    const timer=window.setTimeout(()=>{setSearchState(pick(isEnglish,"正在搜索…","Searching…"));void fetch(`/api/stocks/search?q=${encodeURIComponent(query.trim())}&limit=8`,{signal:controller.signal}).then(async response=>{const body=await response.json();if(!response.ok)throw new Error(body.message);const rows=(body.items??[]).flatMap((item:Record<string,unknown>)=>{const code=String(item.code??"").padStart(6,"0");return /^\d{6}$/.test(code)?[{code,name:String(item.name??code),industry:String(item.industry??pick(isEnglish,"A股 · 行业待载入","A-share"))}]:[]});setSuggestions(rows);setKnownStocks(previous=>[...previous,...rows.filter((row:StockChoice)=>!previous.some(item=>item.code===row.code))]);setSearchState(rows.length?pick(isEnglish,`找到 ${rows.length} 只匹配股票`,`${rows.length} matching stocks found`):pick(isEnglish,"没有找到匹配股票","No matching stock found"))}).catch(error=>{if(error instanceof Error&&error.name!=="AbortError")setSearchState(pick(isEnglish,"股票搜索暂不可用","Stock search is temporarily unavailable"))})},350);
    return()=>{window.clearTimeout(timer);controller.abort()};
  },[query,isEnglish]);
  const preset=universePreset(options.universeId);
  const selectedSymbols=options.universeMode==="custom"?options.customSymbols:[...(preset.symbols as readonly string[])];
  const stocks=selectedSymbols.map(code=>knownStocks.find(item=>item.code===code)??{code,name:code,industry:pick(isEnglish,"A股 · 行业待载入","A-share")});
  function toggleSymbol(symbol:string){const exists=options.customSymbols.includes(symbol);if(exists&&options.customSymbols.length<=10)return;if(!exists&&options.customSymbols.length>=30)return;onChange({...options,configurationMode:"manual",customSymbols:exists?options.customSymbols.filter(item=>item!==symbol):[...options.customSymbols,symbol]})}
  return <section className="sr-sample-adjustments" aria-label={pick(isEnglish,"调整研究样本","Adjust research sample")}>
    <header><div><strong>{pick(isEnglish,"只调整样本和持仓数","Adjust only the sample and holdings")}</strong><small>{pick(isEnglish,"扫描数量与停止规则仍使用上方设置。","The screening limit and stopping rule remain the settings above.")}</small></div><button type="button" disabled={busy} onClick={()=>onChange({...options,configurationMode:"auto",universeMode:"preset",universeId:DEFAULT_RESEARCH_OPTIONS.universeId,maxPositions:DEFAULT_RESEARCH_OPTIONS.maxPositions})}>{pick(isEnglish,"恢复默认样本","Use default sample")}</button></header>
    <div className="sr-universe-mode" role="group" aria-label={pick(isEnglish,"股票样本方式","Stock sample mode")}><button type="button" aria-pressed={options.universeMode==="preset"} disabled={busy} onClick={()=>onChange({...options,configurationMode:"manual",universeMode:"preset"})}>{pick(isEnglish,"行业预设","Presets")}</button><button type="button" aria-pressed={options.universeMode==="custom"} disabled={busy} onClick={()=>onChange({...options,configurationMode:"manual",universeMode:"custom"})}>{pick(isEnglish,"搜索自选","Search stocks")}</button></div>
    {options.universeMode==="preset"?<div className="sr-preset-options">{UNIVERSE_PRESETS.map(item=><button type="button" key={item.id} aria-pressed={options.universeId===item.id} disabled={busy} onClick={()=>onChange({...options,configurationMode:"manual",universeId:item.id})}><strong>{isEnglish?`${item.symbols.length}-stock preset`:item.name}</strong><small>{isEnglish?"A fixed, transparent demo sample.":item.summary}</small></button>)}</div>:<div className="sr-stock-picker" role="group" aria-label={pick(isEnglish,"搜索并选择 A 股","Search and choose A-shares")}><div><strong>{pick(isEnglish,`已选 ${options.customSymbols.length}/30 只`,`${options.customSymbols.length}/30 selected`)}</strong><span>{pick(isEnglish,"至少 10 只；运行时提取公开前复权日线。","At least 10; public adjusted daily history is loaded at run time.")}</span></div><label className="sr-stock-search"><Search/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder={pick(isEnglish,"输入名称或 6 位代码","Enter a name or six-digit code")} aria-label={pick(isEnglish,"按名称或代码搜索 A 股","Search A-shares by name or code")}/><small role="status">{searchState||pick(isEnglish,"搜索结果只定义样本，不是推荐名单。","Search results define the sample; they are not recommendations.")}</small></label>{suggestions.length>0&&<div className="sr-search-results">{suggestions.map(item=><button key={item.code} type="button" disabled={busy||options.customSymbols.includes(item.code)||options.customSymbols.length>=30} onClick={()=>toggleSymbol(item.code)}><span><strong>{item.name}</strong><small>{item.code} · {item.industry}</small></span><b>{options.customSymbols.includes(item.code)?pick(isEnglish,"已添加","Added"):pick(isEnglish,"添加","Add")}</b></button>)}</div>}<div className="sr-selected-stocks">{stocks.map(item=><span key={item.code}><strong>{item.name}</strong><small>{item.code}</small><button type="button" aria-label={pick(isEnglish,`移除 ${item.name}`,`Remove ${item.name}`)} disabled={busy||options.customSymbols.length<=10} onClick={()=>toggleSymbol(item.code)}><X/></button></span>)}</div>{options.customSymbols.length<=10&&<p className="sr-choice-note" role="status">{pick(isEnglish,"已到最低 10 只；请先添加再移除。","Minimum reached; add another stock before removing one.")}</p>}</div>}
    <label className="sr-holdings-control sr-holdings-slider"><span><b>{pick(isEnglish,"每期最多观察","Maximum holdings per period")}</b><strong>{options.maxPositions} {pick(isEnglish,"只","stocks")}</strong></span><input type="range" min="0" max={holdingOptions.length-1} step="1" value={Math.max(0,holdingOptions.indexOf(options.maxPositions as typeof holdingOptions[number]))} disabled={busy} onInput={event=>onChange({...options,configurationMode:"manual",maxPositions:holdingOptions[Number(event.currentTarget.value)]??8})} aria-label={pick(isEnglish,"拖动调整每期最多观察股票数","Adjust maximum holdings per period")}/><div aria-hidden="true">{holdingOptions.map(value=><span key={value}>{value}</span>)}</div><small>{pick(isEnglish,"等权，不输出当前买入名单。","Equal weighted; no current buy list is produced.")}</small></label>
    <details className="sr-sample-preview sr-sample-preview-visible"><summary><div><strong>{pick(isEnglish,`本次使用 ${stocks.length} 只股票`,`${stocks.length} stocks in this run`)}</strong><small>{pick(isEnglish,"所有方法使用同一名单，默认收起","Every method uses the same list; collapsed by default")}</small></div><span>{pick(isEnglish,"查看完整名单","View full list")}<ChevronDown/></span></summary><div className="sr-visible-sample-list">{stocks.map(item=>localizedStock(item,isEnglish)).map(item=><span key={item.code}><strong>{item.name}</strong><small>{item.code} · {item.industry}</small></span>)}</div></details>
  </section>;
}

function SimpleResultView({isEnglish=false,run,selectedStrategyId,onSelect,onSave,busy,onRestart,message}:{isEnglish?:boolean;run:ResearchRun;selectedStrategyId:string;onSelect:(id:string)=>void;onSave:()=>void;busy:boolean;onRestart:()=>void;message:string}){
  const saveable=run.evaluations.filter(item=>item.strategy.source!=="constrained_ai"||item.status==="limited_candidate");
  const selected=saveable.find(item=>item.strategy.id===selectedStrategyId);
  const outcome=presentResearchOutcome(run);
  const finalists=outcome.finalists;
  const preferredCandidateId=finalists.find(item=>item.status==="limited_candidate")?.strategy.id??finalists[0]?.strategy.id??"";
  const [focusedCandidateId,setFocusedCandidateId]=useState(preferredCandidateId);
  const reference=run.evaluations.find(item=>item.strategy.id===run.comparison_standard.benchmark_strategy_id);
  const benchmarkDisplayName=isEnglish&&reference?englishStrategyName(reference.strategy):run.comparison_standard.benchmark_name;
  const confirmedGoal:ResearchGoal=(run.evaluations[0]?.strategy?.research_goal) ?? "balanced";
  const benchmarkReferenceStrategy=reference?.strategy ?? run.evaluations[0]?.strategy;
  const benchmarkReferenceEnglishName=benchmarkReferenceStrategy?englishStrategyName(benchmarkReferenceStrategy):run.comparison_standard.benchmark_name;
  const activeStrategyId=finalists.some(item=>item.strategy.id===focusedCandidateId)?focusedCandidateId:preferredCandidateId;
  const kept=outcome.kept;
  const target=run.research_settings?.target_candidates??1;const validationShortfall=run.candidate_space_exhausted?0:Math.max(0,target-finalists.length);const fullBudget=run.research_settings?.search_mode==="exhaust_budget";
  const campaignHeadline=outcome.stage==="retained"?pick(isEnglish,`最后检查后，保留 ${kept} 个候选`,`After the final check, ${kept} candidate${kept===1?" remains":"s remain"}`):outcome.stage==="locked_failed"?pick(isEnglish,"最后检查后，没有候选继续符合目标","No candidate still met the goal after the final check"):pick(isEnglish,"验证期没有候选超过固定参照","No candidate beat the fixed reference in validation");
  const campaignSummary=outcome.stage==="validation_failed"?pick(isEnglish,`同股票、同时间、同成本：扫描 ${run.candidates_generated} 组，0 个在独立验证期按“${goalLabels[confirmedGoal]}”胜过${benchmarkDisplayName}，因此最后一段历史没有打开。`,`Same stocks, dates and costs: ${run.candidates_generated} combinations were screened, but none beat ${benchmarkDisplayName} in validation, so the final period stayed closed.`):pick(isEnglish,`同股票、同时间、同成本：扫描 ${run.candidates_generated} 组，${finalists.length} 个进入最后检查，${kept} 个仍按“${goalLabels[confirmedGoal]}”胜过${benchmarkDisplayName}。`,`Same stocks, dates and costs: ${run.candidates_generated} combinations screened, ${finalists.length} entered the final check, and ${kept} still beat ${benchmarkDisplayName} for the confirmed goal.`);
  const failureReasons=outcome.reasons.slice(0,3).map(reason=>reason.replace(/[。；]+$/,""));
  const lockedSignatures=finalists.map(item=>JSON.stringify([item.locked_test?.net_return_pct,item.locked_test?.max_drawdown_pct,item.locked_test?.turnover_pct,item.locked_test?.stability_pct]));
  const duplicateLockedResults=lockedSignatures.length>1&&new Set(lockedSignatures).size<lockedSignatures.length;
  return <section className="sr-simple-results" aria-labelledby="sr-simple-result-title">
    <div className="sr-result-nav"><button type="button" onClick={onRestart}><ArrowLeft/>{validationShortfall&&!run.locked_at&&!run.candidate_space_exhausted?pick(isEnglish,"继续检查未测方法","Continue with untested methods"):pick(isEnglish,"调整条件，开始新研究","Adjust and start a new study")}</button><span>{run.data_audit.status==="demo"?pick(isEnglish,"合成演示数据","Synthetic demo data"):run.data_audit.status==="live"?pick(isEnglish,"公开历史数据","Public historical data"):run.data_audit.status==="partial"?pick(isEnglish,"部分覆盖的公开历史","Partial public history"):pick(isEnglish,"历史数据状态待检查","Historical data needs review")} · {pick(isEnglish,"截至","through")} {run.data_audit.data_cutoff}</span></div>
    {run.reused_previous_run&&<p className="sr-reused-note" role="status"><History/>{pick(isEnglish,"相同条件以前已完成，本次直接打开上次结果，没有重复计算，也没有根据最终结果继续调参。","These exact conditions were completed before. The previous result was reopened without recalculation or tuning on the final period.")}</p>}
    <section className={`sr-simple-result-hero ${kept?"passed":"failed"}`}><div><span>{fullBudget?pick(isEnglish,"本次预算已扫描完成","Full-budget screening completed"):pick(isEnglish,"自动寻找已结束","Automatic search completed")}</span><h2 id="sr-simple-result-title">{campaignHeadline}</h2><p>{campaignSummary}</p></div></section>
    {!kept&&<section className="sr-direct-verdict" aria-label={pick(isEnglish,"没有保留候选的原因","Why no candidate was retained")}><strong>{outcome.stage==="validation_failed"?pick(isEnglish,"为什么没进入最后检查？","Why did none enter the final check?"):pick(isEnglish,"为什么最后是 0 个？","Why were none retained?")}</strong><p>{failureReasons.length?failureReasons.join("；"):pick(isEnglish,"本次验证期没有候选达到预先确认的比较标准。","No candidate met the pre-confirmed validation standard in this run.")}</p><small>{outcome.stage==="validation_failed"?pick(isEnglish,"最后一段历史没有打开，也没有用于继续修改候选。","The final period stayed closed and was not used to revise candidates."):pick(isEnglish,`最后检查只用于验收，不会拿这段结果继续改参数。检查区间：${run.split.locked_test_start} 至 ${run.data_audit.data_cutoff}。`,`The final period is only used for acceptance, never for further tuning. Period: ${run.split.locked_test_start} through ${run.data_audit.data_cutoff}.`)}</small></section>}
    <div className="sr-outcome-flow" aria-label={pick(isEnglish,"本次筛选结果","Screening result")}><span><strong>{run.candidates_generated}</strong><small>{pick(isEnglish,"组已扫描","screened")}</small></span><i><ArrowRight/></i><span><strong>{finalists.length}</strong><small>{pick(isEnglish,"个进最后检查","final checks")}</small></span><i><ArrowRight/></i><span className={kept?"passed":"failed"}><strong>{kept}</strong><small>{pick(isEnglish,"个最终保留","retained")}</small></span></div>
    {run.candidate_space_exhausted&&<p className="sr-inline-message warning" role="status">{pick(isEnglish,"允许的候选组合已经全部检查完；要继续，请修改股票样本、规则或参数范围。","Every allowed candidate has been checked. Change the sample, rules or parameter range to continue.")}</p>}
    {duplicateLockedResults&&<p className="sr-duplicate-note">{pick(isEnglish,"有些候选的汇总数字相同；这不代表持仓一定相同。它们仍逐项列出，不取平均值。","Some candidates have matching summary metrics; this does not prove their holdings were identical. They are still listed individually, never averaged.")}</p>}
    {finalists.length>0?<div className="sr-result-explorer">
      {reference&&<FinalCandidateComparisons items={finalists} reference={reference} goal={confirmedGoal} selectedId={activeStrategyId} onSelect={id=>{setFocusedCandidateId(id);if(finalists.find(item=>item.strategy.id===id)?.status==="limited_candidate")onSelect(id)}} isEnglish={isEnglish}/>}
      <BacktestPlayback key={activeStrategyId} run={run} compact simpleCompare focusStrategyId={activeStrategyId} isEnglish={isEnglish}/>
    </div>:<section className="sr-no-final-chart" aria-label={pick(isEnglish,"没有可画的最后检查候选","No final-check candidate to chart")}><span>0</span><div><strong>{pick(isEnglish,"这里不画一条假装入围的候选曲线","No eliminated candidate is presented here as a finalist")}</strong><p>{pick(isEnglish,"本次没有方法通过独立验证期，因此没有候选进入最后检查。上面的 0 表示“没有入围”，不是收益为 0；每个淘汰原因仍保留在筛选记录中。","No method passed validation, so none entered the final check. The 0 means no finalist, not a zero return; every rejection reason remains in the screening record.")}</p></div></section>}
    <details className="sr-result-actions sr-methodology"><summary><ShieldCheck/>{pick(isEnglish,"这次怎样判断通过","How this run decided what passed")}</summary><div className="sr-methodology-body"><div className="sr-visible-rule"><ShieldCheck/><span><small>{pick(isEnglish,"统一通过线","Same passing rule for every candidate")}</small><strong>{pick(isEnglish,`验证期先胜过${benchmarkDisplayName}；最后检查期还要按“${goalLabels[confirmedGoal]}”再次胜过它，并通过成本、换手和稳定性限制。${confirmedGoal==="balanced"?" 平衡分 = 成本后收益 + 0.6 × 最大回撤，分数越高越符合目标。":""}`,`Beat ${benchmarkDisplayName} in validation, then do so again in the final period while passing cost, turnover and stability limits.${confirmedGoal==="balanced"?" Balance score = after-cost return + 0.6 × maximum drawdown; higher is better.":""}`)}</strong></span></div><div className="sr-split-dates" aria-label={pick(isEnglish,"三段历史日期","Three historical periods")}><span><small>{pick(isEnglish,"找思路","Research")}</small><strong>{pick(isEnglish,"截至","through")} {run.split.research_end}</strong></span><span><small>{pick(isEnglish,"独立比较","Validation")}</small><strong>{pick(isEnglish,"研究结束后至","after research through")} {run.split.validation_end}</strong></span><span className={outcome.stage==="validation_failed"?"unopened":""}><small>{outcome.stage==="validation_failed"?pick(isEnglish,"预设区间 · 未打开","Preset period · not opened"):pick(isEnglish,"最后只检查","Final check")}</small><strong>{run.split.locked_test_start} → {run.data_audit.data_cutoff}</strong></span></div></div></details>
    <details className="sr-result-actions"><summary><Activity/>{pick(isEnglish,"本次扫描记录","Screening record")}</summary><div><div className="sr-campaign-status" role="status"><span><small>{pick(isEnglish,"自动方式","Mode")}</small><strong>{fullBudget?pick(isEnglish,"跑满本次预算","Full-budget search"):pick(isEnglish,`先选 ${target} 个再检查`,`Select ${target} before final check`)}</strong></span><span><small>{pick(isEnglish,"本次新扫描","New combinations")}</small><strong>{run.candidates_generated} {pick(isEnglish,"组","combinations")}</strong></span><span><small>{pick(isEnglish,"自动跳过","Skipped from history")}</small><strong>{run.candidates_skipped??0} {pick(isEnglish,"组已测","tested")}</strong></span><span><small>{pick(isEnglish,"进入 / 保留","Entered / retained")}</small><strong>{finalists.length}/{kept}</strong></span>{validationShortfall>0&&!run.locked_at&&<button type="button" onClick={onRestart}>{pick(isEnglish,`还差 ${validationShortfall} 个，从未测试组合继续`,`Short by ${validationShortfall}; continue with untested combinations`)}</button>}</div><div className="sr-key-strip" aria-label={pick(isEnglish,"本次通过规则","Passing rule for this run")}><span><small>{pick(isEnglish,"你确认的目标","Confirmed goal")}</small><strong>{isEnglish?goalLabelsEn[confirmedGoal]:goalLabels[confirmedGoal]}</strong></span><span><small>{pick(isEnglish,"要胜过谁","Reference to beat")}</small><strong>{isEnglish?benchmarkReferenceEnglishName:run.comparison_standard.benchmark_name}</strong></span><span><small>{pick(isEnglish,"怎样才算通过","What counts as passing")}</small><strong>{pick(isEnglish,"验证区赢，最后一段还要赢","Win validation and win again in the final period")}</strong></span></div></div></details>
    <details className="sr-result-actions"><summary><Save/>{pick(isEnglish,"保存这次研究","Save this research")}</summary><div><label htmlFor="sr-save-method"><span>{pick(isEnglish,"将保存的方法","Method to save")}</span><select id="sr-save-method" value={selectedStrategyId} onChange={event=>onSelect(event.target.value)}>{saveable.map(item=><option key={item.strategy.id} value={item.strategy.id}>{isEnglish?englishStrategyName(item.strategy):item.strategy.name} · {isEnglish?englishRoleStatus(item):roleAwareStatus(item)}</option>)}</select></label>{selected&&<small><strong>{pick(isEnglish,"将保存：","Will save: ")}{isEnglish?englishStrategyName(selected.strategy):selected.strategy.name}</strong> · {isEnglish?englishThesis(selected.strategy):selected.strategy.thesis_plain}</small>}<button className="sr-primary" disabled={busy||!selectedStrategyId} onClick={onSave}>{busy?pick(isEnglish,"正在保存…","Saving…"):pick(isEnglish,"保存研究方法","Save research method")}</button>{message&&<p className="sr-inline-message" role="status">{isEnglish?(message.startsWith("已保存")?"Saved as a reusable research method. It will not trade or run automatically.":"The action could not be completed."):message}</p>}</div></details>
    <details id="sr-elimination-details" className="sr-result-actions"><summary><ShieldCheck/>{pick(isEnglish,"查看全部筛选过程","See the full screening process")}</summary><ResearchFunnelSummary run={run} isEnglish={isEnglish}/><HarnessFlow run={run} isEnglish={isEnglish}/></details>
    <details className="sr-result-actions"><summary><Database/>{pick(isEnglish,"查看专业数据","See professional details")}</summary><div><CostAndStability run={run} isEnglish={isEnglish}/><ComparisonDashboard run={run} isEnglish={isEnglish}/><DataAudit run={run} isEnglish={isEnglish}/><MetricsTable run={run} isEnglish={isEnglish}/></div></details>
    {run.attempts_total>=3&&<p className="sr-inline-message warning">{pick(isEnglish,"多次更换条件会增加挑中偶然历史结果的风险。","Repeatedly changing the setup increases the risk of selecting a chance historical result.")}</p>}
  </section>;
}

function goalMetric(metrics:ResearchRun["evaluations"][number]["validation"],goal:ResearchGoal,isEnglish:boolean){if(goal==="lower_drawdown")return [pick(isEnglish,"目标：最大回撤","Goal: largest decline"),metrics.max_drawdown_pct] as const;if(goal==="higher_stability")return [pick(isEnglish,"目标：阶段稳定性","Goal: period stability"),metrics.stability_pct] as const;if(goal==="lower_turnover")return [pick(isEnglish,"目标：换手率","Goal: turnover"),metrics.turnover_pct] as const;if(goal==="higher_net_return")return [pick(isEnglish,"目标：成本后收益","Goal: after-cost return"),metrics.net_return_pct] as const;return [pick(isEnglish,"目标：平衡分","Goal: balance score"),metrics.net_return_pct===null||metrics.max_drawdown_pct===null?null:metrics.net_return_pct+0.6*metrics.max_drawdown_pct] as const;}
function FinalCandidateComparisons({items,reference,goal,selectedId,onSelect,isEnglish=false}:{items:ResearchRun["evaluations"];reference:ResearchRun["evaluations"][number];goal:ResearchGoal;selectedId:string;onSelect:(id:string)=>void;isEnglish?:boolean}){
  const referenceMetrics=reference.locked_test??reference.validation;
  const allFailed=items.every(item=>item.status!=="limited_candidate");
  return <section className="sr-retained-list" aria-labelledby="sr-retained-title">
    <header><div><h3 id="sr-retained-title">{allFailed?pick(isEnglish,"选择一个候选看折线（均未通过）","Choose a candidate line (none passed)"):pick(isEnglish,"选择候选看折线","Choose a candidate line")}</h3></div><span>{items.length}</span></header>
    <div>{items.map((item,index)=>{
      const metrics=item.locked_test??item.validation;
      const passed=item.status==="limited_candidate";
      const [primaryLabel,primaryValue]=goalMetric(metrics,goal,isEnglish);const [,referencePrimary]=goalMetric(referenceMetrics,goal,isEnglish);
      const outcome=passed?pick(isEnglish,"最终保留","Retained"):pick(isEnglish,"最后未延续","Did not continue");
      return <button type="button" key={item.strategy.id} className={passed?"passed":"failed"} aria-pressed={selectedId===item.strategy.id} onClick={()=>onSelect(item.strategy.id)}>
        <span className="sr-candidate-index">{index+1}</span>
        <span className="sr-candidate-name"><strong>{item.strategy.source==="constrained_ai"?friendlyStrategyName(item.strategy,isEnglish):(isEnglish?englishStrategyName(item.strategy):item.strategy.name)}</strong><small>{outcome}</small></span>
        <span className="sr-candidate-metric"><small>{primaryLabel}</small><strong>{formatMetric(primaryValue)}</strong><i>{pick(isEnglish,"参照","Ref")} {formatMetric(referencePrimary)}</i></span>
        <span className="sr-row-action">{selectedId===item.strategy.id?pick(isEnglish,"正在查看","Viewing"):pick(isEnglish,"查看","View")}<ArrowRight/></span>
      </button>;
    })}</div>
  </section>;
}

export function DraftView({plan,options,confirmed,busy,message,onConfirm,onBack,onStartingPoint,onOptions,onRun}:{plan:StrategyPlan;options:ResearchOptions;confirmed:boolean;busy:string|null;message:string;onConfirm:(value:boolean)=>void;onBack:()=>void;onStartingPoint:(id:string)=>void;onOptions:(options:ResearchOptions)=>void;onRun:()=>void}){
  return <section className="sr-draft-v2" aria-labelledby="sr-draft-title"><header><button className="sr-back" onClick={onBack}>← 改一下</button><div><span>系统理解为</span><h2 id="sr-draft-title">{plan.dsl.name}</h2><p>{plan.dsl.thesis_plain}</p></div></header>{plan.starting_points.length>0&&<section className="sr-start-choice"><span>选一个研究起点</span><div>{plan.starting_points.map(item=><button key={item.id} aria-pressed={plan.selected_starting_point_id===item.id} disabled={busy==="plan"} onClick={()=>onStartingPoint(item.id)}><strong>{item.name}</strong><small>{item.summary}</small></button>)}</div></section>}<ResearchControls plan={plan} options={options} busy={busy==="plan"} onChange={onOptions}/><StrategyRecipe rules={plan.plain_rules}/><details className="sr-rule-details"><summary><SlidersHorizontal/>成本和研究边界 <ChevronDown/></summary><div><p>持有 {plan.dsl.rebalance.holding_days} 日 · 最多 {plan.dsl.portfolio.max_positions} 只 · 等权</p><p>成本：佣金 {plan.dsl.costs.commission_bps} + 印花税 {plan.dsl.costs.stamp_tax_bps} + 滑点 {plan.dsl.costs.slippage_bps} bps</p><p>每次只检查有限候选，不会反复尝试到出现好结果。</p>{plan.warnings.map(item=><p key={item}>{item}</p>)}</div></details><label className="sr-confirm-v2"><input type="checkbox" checked={confirmed} onChange={event=>onConfirm(event.target.checked)}/><span><strong>这就是我想检查的方法</strong><small>勾选后才会运行；修改任何条件都需要重新确认</small></span></label>{message&&<p className="sr-inline-message" role="status">{message}</p>}{busy==="run"?<ResearchRunning/>:<button className="sr-primary sr-run-action" disabled={!confirmed||busy==="plan"} onClick={onRun}>{options.configurationMode==="auto"?"开始自动比较":"按我的设置开始比较"} <LockKeyhole/></button>}</section>;
}

// Kept temporarily for compatibility with embedded consumers of the former exported flow.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function EnglishResearchControls({plan,options,busy,onChange}:{plan:StrategyPlan;options:ResearchOptions;busy:boolean;onChange:(options:ResearchOptions)=>void}){
  type StockChoice={code:string;name:string;industry:string};
  const presetCopy:Record<string,[string,string]>={
    "cn-a-cross-industry-v1":["Cross-industry demo","24 fixed stocks across several industries"],
    "cn-a-non-financial-17":["Non-financial demo","17 fixed stocks excluding banks, insurers and brokers"],
    "cn-a-finance-consumer-health-14":["Finance, consumer and healthcare","14 fixed stocks across those sectors and transport"],
    "cn-a-real-economy-10":["Energy, industry and materials","10 fixed stocks across real-economy sectors"],
  };
  const [query,setQuery]=useState("");
  const [suggestions,setSuggestions]=useState<StockChoice[]>([]);
  const [knownStocks,setKnownStocks]=useState<StockChoice[]>(STOCK_SAMPLE.map(item=>({code:item[0],name:item[1],industry:item[2]})));
  const [searchState,setSearchState]=useState("");
  useEffect(()=>{
    if(query.trim().length<2){const reset=setTimeout(()=>{setSuggestions([]);setSearchState("")},0);return()=>clearTimeout(reset)}
    const controller=new AbortController();
    const timer=setTimeout(()=>{setSearchState("Searching…");void fetch(`/api/stocks/search?q=${encodeURIComponent(query.trim())}&limit=8`,{signal:controller.signal}).then(async response=>{const body=await response.json();if(!response.ok)throw new Error(body.message);const rows=(body.items??[]).flatMap((item:Record<string,unknown>)=>{const code=String(item.code??"").padStart(6,"0");return /^\d{6}$/.test(code)?[{code,name:String(item.name??code),industry:String(item.industry??"A-share")}]:[]});setSuggestions(rows);setKnownStocks(previous=>[...previous,...rows.filter((row:StockChoice)=>!previous.some(item=>item.code===row.code))]);setSearchState(rows.length?`${rows.length} matching stocks found`:"No matching stock found")}).catch(error=>{if(error instanceof Error&&error.name!=="AbortError")setSearchState("Stock search is temporarily unavailable")})},350);
    return()=>{clearTimeout(timer);controller.abort()};
  },[query]);
  const preset=universePreset(options.universeId);
  const selectedSymbols=options.configurationMode==="manual"&&options.universeMode==="custom"?options.customSymbols:[...(preset.symbols as readonly string[])];
  const stocks=selectedSymbols.map(code=>knownStocks.find(item=>item.code===code)??{code,name:code,industry:"A-share"});
  function toggleSymbol(symbol:string){const checked=options.customSymbols.includes(symbol);if(checked&&options.customSymbols.length<=10)return;if(!checked&&options.customSymbols.length>=30)return;onChange({...options,customSymbols:checked?options.customSymbols.filter(item=>item!==symbol):[...options.customSymbols,symbol]})}
  return <section className="sr-controls" aria-labelledby="sr-controls-title-en">
    <header><div><h3 id="sr-controls-title-en">Choose how much to adjust</h3><p>Automatic mode prepares the conditions. Manual mode changes only the bounded research setup.</p></div><div className="sr-config-tabs" role="tablist" aria-label="Research setup mode"><button role="tab" aria-selected={options.configurationMode==="auto"} disabled={busy} onClick={()=>onChange({...DEFAULT_RESEARCH_OPTIONS,configurationMode:"auto"})}>Automatic</button><button role="tab" aria-selected={options.configurationMode==="manual"} disabled={busy} onClick={()=>onChange({...options,configurationMode:"manual"})}>Adjust</button></div></header>
    {options.configurationMode==="auto"?<div className="sr-auto-config"><div><Activity/><span><strong>The system runs a bounded sequence</strong><small>24-stock demo sample · up to {options.maxRounds} rounds × {options.candidateBudget} candidates.</small></span></div><ol><li><strong>Run fixed references</strong><span>Same stocks, dates and costs</span></li><li><strong>Create and screen candidates</strong><span>Only allowed simple rules</span></li><li><strong>Stop at the target or limit</strong><span>The final period is never used to revise rules</span></li></ol><label className="sr-auto-rounds"><span>Maximum automatic rounds</span><select disabled={busy} value={options.maxRounds} onChange={event=>onChange({...options,maxRounds:Number(event.target.value) as ResearchRounds})}>{[1,2,3].map(value=><option key={value} value={value}>{value} {value===1?"round":"rounds"} · up to {value*options.candidateBudget} candidates</option>)}</select></label><p>This is not an endless search: order and limits are fixed before the final period is opened.</p></div>:<div className="sr-manual-config">
      <div className="sr-universe-heading"><div><strong>1 · Choose the stock sample</strong><small>Use a transparent demo preset or build a 10–30 stock historical sample by name or code.</small></div><div className="sr-universe-mode" role="group" aria-label="Stock sample mode"><button aria-pressed={options.universeMode==="preset"} onClick={()=>onChange({...options,universeMode:"preset"})}>Presets</button><button aria-pressed={options.universeMode==="custom"} onClick={()=>onChange({...options,universeMode:"custom"})}>Search stocks</button></div></div>
      {options.universeMode==="preset"?<div className="sr-preset-options">{UNIVERSE_PRESETS.map(item=>{const copy=presetCopy[item.id]??["Demo preset","Fixed transparent stock sample"];return <button key={item.id} aria-pressed={options.universeId===item.id} disabled={busy} onClick={()=>onChange({...options,universeId:item.id})}><strong>{copy[0]}</strong><small>{copy[1]}</small></button>})}</div>:<div className="sr-stock-picker" role="group" aria-label="Search and choose A-shares"><div><strong>{options.customSymbols.length}/30 selected</strong><span>At least 10 stocks are required for cross-sectional comparison.</span></div><label className="sr-stock-search"><Search/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Enter a name or six-digit code" aria-label="Search A-shares by name or code"/><small role="status">{searchState||"Search results define a research sample; they are not recommendations."}</small></label>{suggestions.length>0&&<div className="sr-search-results">{suggestions.map(item=><button key={item.code} type="button" disabled={busy||options.customSymbols.includes(item.code)||options.customSymbols.length>=30} onClick={()=>toggleSymbol(item.code)}><span><strong>{item.name}</strong><small>{item.code} · {item.industry}</small></span><b>{options.customSymbols.includes(item.code)?"Added":"Add"}</b></button>)}</div>}<div className="sr-selected-stocks">{stocks.map(item=><span key={item.code}><strong>{item.name}</strong><small>{item.code}</small><button type="button" aria-label={`Remove ${item.name}`} disabled={busy||options.customSymbols.length<=10} onClick={()=>toggleSymbol(item.code)}><X/></button></span>)}</div>{options.customSymbols.length<=10&&<p className="sr-choice-note" role="status">Minimum reached. Add another stock before removing one.</p>}{options.customSymbols.length>=30&&<p className="sr-choice-note" role="status">Maximum reached. Remove a stock before adding another.</p>}</div>}
      <div className="sr-parameter-row"><label><span>2 · Maximum holdings</span><select disabled={busy} value={options.maxPositions} onChange={event=>onChange({...options,maxPositions:Number(event.target.value)})}>{[4,6,8,12].map(value=><option key={value} value={value}>{value} stocks</option>)}</select><small>Equal weighted; no current buy list is produced.</small></label><label><span>3 · Candidates per round</span><select disabled={busy} value={options.candidateBudget} onChange={event=>onChange({...options,candidateBudget:Number(event.target.value) as CandidateBudget})}>{[3,4,5,6].map(value=><option key={value} value={value}>{value} candidates</option>)}</select><small>Built only from the auditable component list.</small></label><label><span>4 · Automatic rounds</span><select disabled={busy} value={options.maxRounds} onChange={event=>onChange({...options,maxRounds:Number(event.target.value) as ResearchRounds})}>{[1,2,3].map(value=><option key={value} value={value}>{value} {value===1?"round":"rounds"} · up to {value*options.candidateBudget}</option>)}</select><small>Stops early when a candidate passes comparison.</small></label></div>
    </div>}
    <details className="sr-sample-preview"><summary><div><strong>{stocks.length} {options.configurationMode==="manual"&&options.universeMode==="custom"?"selected A-shares":"fixed demo stocks"}</strong><small>Every method uses exactly the same list.</small></div><span>See the full list</span></summary><div className="sr-visible-sample-list">{stocks.map(item=><span key={item.code}><strong>{item.name}</strong><small>{item.code}</small></span>)}</div><p><strong>Sample note: </strong>{options.configurationMode==="manual"&&options.universeMode==="custom"?"Public adjusted daily history is loaded at run time; insufficient coverage causes an explicit failure.":"This is a fixed synthetic demo sample, not the full A-share market."} The list defines research scope and is not a recommendation.</p></details>
    <div className="sr-comparison-gate"><ShieldCheck/><span><strong>What counts as passing?</strong><small>After data and cost checks, a candidate must beat the best fixed simple method for “{goalLabelsEn[plan.dsl.research_goal]}” on the separate comparison period. Otherwise the next preset round runs, up to the limit. The final period is never used to continue searching.</small></span></div>
  </section>;
}

function ResearchControls({plan,options,busy,onChange}:{plan:StrategyPlan;options:ResearchOptions;busy:boolean;onChange:(options:ResearchOptions)=>void}){
  type StockChoice={code:string;name:string;industry:string};
  const [query,setQuery]=useState("");const [suggestions,setSuggestions]=useState<StockChoice[]>([]);const [knownStocks,setKnownStocks]=useState<StockChoice[]>(STOCK_SAMPLE.map(item=>({code:item[0],name:item[1],industry:item[2]})));const [searchState,setSearchState]=useState("");
  useEffect(()=>{if(query.trim().length<2){const reset=setTimeout(()=>{setSuggestions([]);setSearchState("")},0);return()=>clearTimeout(reset)}const controller=new AbortController();const timer=setTimeout(()=>{setSearchState("正在搜索…");void fetch(`/api/stocks/search?q=${encodeURIComponent(query.trim())}&limit=8`,{signal:controller.signal}).then(async response=>{const body=await response.json();if(!response.ok)throw new Error(body.message);const rows=(body.items??[]).flatMap((item:Record<string,unknown>)=>{const code=String(item.code??"").padStart(6,"0");return /^\d{6}$/.test(code)?[{code,name:String(item.name??code),industry:String(item.industry??"A股 · 行业待载入")}]:[]});setSuggestions(rows);setKnownStocks(previous=>[...previous,...rows.filter((row:StockChoice)=>!previous.some(item=>item.code===row.code))]);setSearchState(rows.length?`找到 ${rows.length} 只匹配股票`:"没有找到匹配股票")}).catch(error=>{if(error instanceof Error&&error.name!=="AbortError")setSearchState("股票搜索暂不可用，请稍后重试")})},350);return()=>{clearTimeout(timer);controller.abort()}},[query]);
  const preset=universePreset(options.universeId);const selectedSymbols=options.configurationMode==="manual"&&options.universeMode==="custom"?options.customSymbols:[...(preset.symbols as readonly string[])];const stocks=selectedSymbols.map(code=>knownStocks.find(item=>item.code===code)??{code,name:code,industry:"A股 · 行业待载入"});const industries=[...new Set(stocks.map(item=>item.industry))];
  function toggleSymbol(symbol:string){const checked=options.customSymbols.includes(symbol);if(checked&&options.customSymbols.length<=10)return;if(!checked&&options.customSymbols.length>=30)return;onChange({...options,customSymbols:checked?options.customSymbols.filter(item=>item!==symbol):[...options.customSymbols,symbol]})}
  return <section className="sr-controls" aria-labelledby="sr-controls-title"><header><div><h3 id="sr-controls-title">先确定怎么研究</h3><p>默认自动准备全部条件；想控制范围时再自己调整。</p></div><div className="sr-config-tabs" role="tablist" aria-label="选择研究配置方式"><button role="tab" aria-selected={options.configurationMode==="auto"} disabled={busy} onClick={()=>onChange({...DEFAULT_RESEARCH_OPTIONS,configurationMode:"auto"})}>自动配置</button><button role="tab" aria-selected={options.configurationMode==="manual"} disabled={busy} onClick={()=>onChange({...options,configurationMode:"manual"})}>自己调整</button></div></header>
    {options.configurationMode==="auto"?<div className="sr-auto-config"><div><Activity/><span><strong>系统会自动分轮研究</strong><small>默认样本 24 只；最多 {options.maxRounds} 轮 × 每轮 {options.candidateBudget} 个候选。</small></span></div><ol><li><strong>先跑固定参照</strong><span>相同样本、时间和成本</span></li><li><strong>分轮生成并筛选</strong><span>只组合允许的简单规则</span></li><li><strong>达到目标或上限即停</strong><span>锁定测试打开后绝不再改</span></li></ol><label className="sr-auto-rounds"><span>自动研究上限</span><select disabled={busy} value={options.maxRounds} onChange={event=>onChange({...options,maxRounds:Number(event.target.value) as ResearchRounds})}>{[1,2,3].map(value=><option key={value} value={value}>{value} 轮 · 最多 {value*options.candidateBudget} 个候选</option>)}</select></label><p>这不是无限调参：候选顺序和轮数先固定，只看验证区决定是否停止；锁定历史只打开一次。</p></div>:<div className="sr-manual-config"><div className="sr-universe-heading"><div><strong>1 · 选择股票范围</strong><small>可以选预设演示样本，也可以按名称或代码组成真实历史样本。</small></div><div className="sr-universe-mode" role="group" aria-label="股票样本方式"><button aria-pressed={options.universeMode==="preset"} onClick={()=>onChange({...options,universeMode:"preset"})}>行业预设</button><button aria-pressed={options.universeMode==="custom"} onClick={()=>onChange({...options,universeMode:"custom"})}>搜索自选</button></div></div>{options.universeMode==="preset"?<div className="sr-preset-options">{UNIVERSE_PRESETS.map(item=><button key={item.id} aria-pressed={options.universeId===item.id} disabled={busy} onClick={()=>onChange({...options,universeId:item.id})}><strong>{item.name}</strong><small>{item.summary}</small></button>)}</div>:<div className="sr-stock-picker" role="group" aria-label="搜索并选择 A 股"><div><strong>已选 {options.customSymbols.length}/30 只</strong><span>至少 10 只；运行时提取公开前复权日线。</span></div><label className="sr-stock-search"><Search/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="输入名称或 6 位代码，例如：宁德时代 / 300750" aria-label="按名称或代码搜索 A 股"/><small role="status">{searchState||"支持沪深北 A 股；搜索结果不是推荐名单"}</small></label>{suggestions.length>0&&<div className="sr-search-results">{suggestions.map(item=><button key={item.code} type="button" disabled={busy||options.customSymbols.includes(item.code)||options.customSymbols.length>=30} onClick={()=>toggleSymbol(item.code)}><span><strong>{item.name}</strong><small>{item.code} · {item.industry}</small></span><b>{options.customSymbols.includes(item.code)?"已添加":"添加"}</b></button>)}</div>}<div className="sr-selected-stocks">{stocks.map(item=><span key={item.code}><strong>{item.name}</strong><small>{item.code}</small><button type="button" aria-label={`移除 ${item.name}`} disabled={busy||options.customSymbols.length<=10} onClick={()=>toggleSymbol(item.code)}><X/></button></span>)}</div>{options.customSymbols.length<=10&&<p className="sr-choice-note" role="status">已到最低 10 只；横截面排序需要足够样本，请先添加再移除。</p>}{options.customSymbols.length>=30&&<p className="sr-choice-note" role="status">已到 30 只上限；先移除一只再添加。</p>}</div>}<div className="sr-parameter-row"><label><span>2 · 每期最多观察</span><select disabled={busy} value={options.maxPositions} onChange={event=>onChange({...options,maxPositions:Number(event.target.value)})}>{[4,6,8,12].map(value=><option key={value} value={value}>{value} 只股票</option>)}</select><small>等权，不输出当前买入名单。</small></label><label><span>3 · 每轮候选数</span><select disabled={busy} value={options.candidateBudget} onChange={event=>onChange({...options,candidateBudget:Number(event.target.value) as CandidateBudget})}>{[3,4,5,6].map(value=><option key={value} value={value}>{value} 个候选</option>)}</select><small>候选来自固定可审计组件。</small></label><label><span>4 · 自动研究轮数</span><select disabled={busy} value={options.maxRounds} onChange={event=>onChange({...options,maxRounds:Number(event.target.value) as ResearchRounds})}>{[1,2,3].map(value=><option key={value} value={value}>{value} 轮（最多 {value*options.candidateBudget} 个）</option>)}</select><small>累计达到首页目标或轮数上限即停。</small></label></div></div>}
    <details className="sr-sample-preview"><summary><div><strong id="sample-preview-title">本次使用 {stocks.length} 只{options.configurationMode==="manual"&&options.universeMode==="custom"?"自选 A 股":"固定演示股票"}</strong><small>{industries.length} 类行业 · 所有方法使用同一名单</small></div><span>查看完整名单</span></summary><div className="sr-industry-summary">{industries.map(industry=><span key={industry}>{industry} {stocks.filter(item=>item.industry===industry).length}</span>)}</div><div className="sr-visible-sample-list">{stocks.map(item=><span key={item.code}><strong>{item.name}</strong><small>{item.code} · {item.industry}</small></span>)}</div><p><strong>样本说明：</strong>{options.configurationMode==="manual"&&options.universeMode==="custom"?"运行时逐只提取公开历史数据；覆盖不足会明确失败，不会以演示价格替代。":"这是验证研究流程的固定合成演示样本，不是完整 A 股市场。"} 股票名单仅定义研究范围，不是推荐名单。</p></details>
    <div className="sr-comparison-gate"><ShieldCheck/><span><strong>什么时候算通过</strong><small>先检查数据与成本，再看是否比表现最好的固定简单方法更符合“{GOALS.find(item=>item.id===plan.dsl.research_goal)?.label}”。没超过就进入下一轮；到上限仍没超过就结束。锁定历史打开后绝不继续。</small></span></div></section>;
}

function StrategyRecipe({rules}:{rules:string[]}){const icons=[Layers3,Activity,ShieldCheck,CalendarRange,WalletCards,Target];return <section className="sr-recipe" aria-labelledby="recipe-title"><header><h3 id="recipe-title">你的方法会这样执行</h3><span>确认无误后再开始</span></header><div>{rules.map((rule,index)=>{const [name,...rest]=rule.split("：");const Icon=icons[index]??SlidersHorizontal;return <article key={rule}><Icon/><span><small>{name}</small><strong>{rest.join("：")}</strong></span>{index<rules.length-1&&<ArrowRight/>}</article>})}</div></section>}

function ResearchRunning({isEnglish=false,liveData=false,onCancel}:{isEnglish?:boolean;liveData?:boolean;onCancel?:()=>void}){const [elapsed,setElapsed]=useState(0);useEffect(()=>{const timer=window.setInterval(()=>setElapsed(value=>value+1),1000);return()=>window.clearInterval(timer)},[]);return <section className="sr-running-v2" role="status" aria-live="polite"><header><Activity/><div><strong>{liveData?pick(isEnglish,"正在读取公开历史并计算","Loading public history and calculating"):pick(isEnglish,"正在计算演示样本","Calculating the demo sample")}</strong><span>{pick(isEnglish,`已等待 ${elapsed} 秒 · 通常几秒内完成`,`Elapsed ${elapsed}s · usually completes within seconds`)}</span></div></header><div className="sr-running-track" role="progressbar" aria-label={pick(isEnglish,"研究计算进行中","Research calculation in progress")}><i/></div><p>{pick(isEnglish,"系统会顺序完成：准备数据 → 比较固定方法 → 检查候选 → 最后验收。结果完成前不会显示猜测的百分比。","The system runs in order: prepare data → compare fixed methods → check candidates → final acceptance. No guessed percentage is shown before completion.")}</p>{onCancel&&<button type="button" onClick={onCancel}>{pick(isEnglish,"停止等待结果","Stop waiting")}</button>}</section>}

export function ResultView({run,selectedStrategyId,onSelect,onSave,busy,onRestart,message}:{run:ResearchRun;selectedStrategyId:string;onSelect:(id:string)=>void;onSave:()=>void;busy:boolean;onRestart:()=>void;message:string}){
  const [view,setView]=useState<"summary"|"methods"|"process"|"details">("methods");
  const saveable=run.evaluations.filter(item=>item.strategy.source!=="constrained_ai"||item.status==="limited_candidate");
  const selected=saveable.find(item=>item.strategy.id===selectedStrategyId);
  const kept=run.funnel.at(-1)?.count??0;
  const headline=kept?`找到 ${kept} 个值得保留的候选`:`这次没有找到比传统方法更合适的候选`;
  return <section className="sr-results-v2" aria-labelledby="sr-result-title"><div className="sr-result-nav"><button type="button" onClick={onRestart}><ArrowLeft/>修改条件</button><span>历史数据截至 {run.data_audit.data_cutoff}</span></div><section className="sr-result-hero"><div><span>{kept?"有候选通过":"如实结束，没有硬凑答案"}</span><h2 id="sr-result-title">{headline}</h2><p>{run.interpretation.tradeoff}</p></div><dl><div><dt>尝试了</dt><dd>{run.candidates_generated}<small>种改进</small></dd></div><div><dt>通过验证</dt><dd>{run.funnel.find(item=>item.id==="locked")?.count??0}<small>种</small></dd></div><div><dt>最终保留</dt><dd>{kept}<small>种</small></dd></div></dl></section><nav className="sr-result-tabs" aria-label="查看研究结果">{[["summary","先看结论"],["methods","逐个方法"],["process","怎么验证"],["details","专业详情"]].map(([id,label])=><button key={id} aria-current={view===id?"page":undefined} onClick={()=>setView(id as typeof view)}>{label}</button>)}</nav>{view==="summary"&&<><BeginnerSummary run={run} onSeeMethods={()=>setView("methods")}/><section className="sr-save-v2"><header><div><h3>把这次研究保存下来</h3><p>以后可以用新数据重新检查；不会产生买卖指令。</p></div><Save/></header><label><span>保存哪个方法</span><select value={selectedStrategyId} onChange={event=>onSelect(event.target.value)}>{saveable.map(item=><option key={item.strategy.id} value={item.strategy.id}>{item.strategy.name} · {roleAwareStatus(item)}</option>)}</select></label>{selected&&<small>{sourceLabels[selected.strategy.source]} · {selected.strategy.thesis_plain}</small>}<div><button className="sr-secondary" onClick={onRestart}>换个条件再研究</button><button className="sr-primary" disabled={busy||!selectedStrategyId} onClick={onSave}>{busy?"正在保存…":"保存研究方法"}</button></div>{message&&<p className="sr-inline-message" role="status">{message}</p>}</section></>}{view==="methods"&&<><BacktestPlayback run={run}/><ComparisonDashboard run={run}/></>}{view==="process"&&<HarnessFlow run={run}/>} {view==="details"&&<><CostAndStability run={run}/><details className="sr-insight-details" open><summary>结论依据 <ChevronDown/></summary><div><ul>{run.interpretation.evidence.map(item=><li key={item}><Check/>{item}</li>)}</ul><p><strong>可以说明：</strong>{run.interpretation.improvement}</p><p><strong>不能说明：</strong>{run.interpretation.cannot_conclude.join("；")}</p></div></details><details className="sr-data-details"><summary><Database/>数据覆盖和已知限制 <ChevronDown/></summary><DataAudit run={run}/></details><details className="sr-data-details"><summary><SlidersHorizontal/>完整指标表 <ChevronDown/></summary><MetricsTable run={run}/></details></>}{run.attempts_total>=3&&<p className="sr-inline-message warning">你已尝试多组条件，继续挑历史结果会增加过拟合风险。</p>}</section>;
}

function BeginnerSummary({run,onSeeMethods}:{run:ResearchRun;onSeeMethods:()=>void}){
  const metrics=(item:ResearchRun["evaluations"][number])=>item.locked_test??item.validation;
  const original=run.evaluations.find(item=>item.strategy.source==="user"||item.strategy.source==="template");
  const traditional=run.evaluations.find(item=>item.strategy.id===run.comparison_standard?.benchmark_strategy_id)??run.evaluations.find(item=>item.strategy.source==="traditional");
  const candidate=[...run.evaluations].filter(item=>item.strategy.source==="constrained_ai").sort((a,b)=>Number(b.status==="limited_candidate")-Number(a.status==="limited_candidate")||(metrics(b).net_return_pct??-999)-(metrics(a).net_return_pct??-999))[0];
  const rows=[original&&{item:original,label:"你原来的方法",help:"系统按你确认的规则执行"},traditional&&{item:traditional,label:"传统参照",help:"固定的简单规则，不是 AI 生成"},candidate&&{item:candidate,label:candidate.status==="limited_candidate"?"通过的改进":"最接近目标的改进",help:"系统只在允许范围内做的小改动"}].filter(Boolean) as Array<{item:ResearchRun["evaluations"][number];label:string;help:string}>;
  return <section className="sr-beginner-summary" aria-labelledby="sr-beginner-title"><header><div><h3 id="sr-beginner-title">先比较这三个</h3><p>它们使用同一批股票、同一段历史和同样的交易成本。</p></div><details><summary>“传统参照”是什么？</summary><p>不经过 AI 修改的固定简单方法，例如平均持有、选择过去 60 日较强或过去 20 日波动较小的股票。它是候选必须超过的基准。</p></details></header><div className="sr-key-comparison">{rows.map(({item,label,help})=>{const value=metrics(item);return <article key={item.strategy.id}><span>{label}</span><h4>{item.strategy.name}</h4><p>{help}</p><dl><div><dt>成本后结果</dt><dd>{formatMetric(value.net_return_pct)}</dd></div><div><dt>期间最大回撤</dt><dd>{formatMetric(value.max_drawdown_pct)}</dd></div></dl><strong className={`sr-status ${item.status}`}>{roleAwareStatus(item)}</strong></article>})}</div><div className="sr-plain-next"><strong>这次该怎么理解</strong><p>{run.funnel.at(-1)?.count?"有候选通过了预先设定的检查，可以保存为研究方法，以后继续重检。":"传统方法在验证阶段更符合你设定的目标，所以系统没有打开候选的最后一段历史。你可以保存原方法作为记录，或修改目标和样本后重新研究。"}</p><button type="button" onClick={onSeeMethods}>查看每个方法的曲线 <ArrowRight/></button></div></section>;
}

function DataAudit({run,isEnglish=false}:{run:ResearchRun;isEnglish?:boolean}){const limitations=isEnglish?["The default source is a fixed synthetic demo sample, not the full A-share market.","Historical close-based simulation does not reproduce every suspension, price-limit queue or market-impact constraint.","Historical results do not predict future performance and do not form a stock recommendation."]:run.data_audit.limitations;return <div className="sr-data-audit-v2"><dl><div><dt>{pick(isEnglish,"来源","Source")}</dt><dd>{isEnglish?(run.data_audit.status==="demo"?"Fixed synthetic demo snapshot":run.data_audit.source_name):run.data_audit.source_name}</dd></div><div><dt>{pick(isEnglish,"数据截止","Data through")}</dt><dd>{run.data_audit.data_cutoff}</dd></div><div><dt>{pick(isEnglish,"覆盖","Coverage")}</dt><dd>{run.data_audit.loaded_symbols}/{run.data_audit.requested_symbols} ({run.data_audit.coverage_pct}%)</dd></div><div><dt>{pick(isEnglish,"状态","Status")}</dt><dd>{isEnglish?(run.data_audit.status==="demo"?"Demo data":run.data_audit.status):run.data_audit.status}</dd></div></dl><ul>{limitations.map(item=><li key={item}>{item}</li>)}</ul></div>}
function MetricsTable({run,isEnglish=false}:{run:ResearchRun;isEnglish?:boolean}){return <div className="sr-table-wrap"><table><thead><tr><th>{pick(isEnglish,"方法","Method")}</th><th>{pick(isEnglish,"角色 / 状态","Role / status")}</th><th>{pick(isEnglish,"验证区","Comparison period")}</th><th>{pick(isEnglish,"锁定区","Final period")}</th><th>{pick(isEnglish,"最大回撤","Largest decline")}</th><th>{pick(isEnglish,"换手","Turnover")}</th><th>{pick(isEnglish,"稳定性","Stability")}</th></tr></thead><tbody>{run.evaluations.map(item=><tr key={item.strategy.id}><td>{isEnglish?englishStrategyName(item.strategy):item.strategy.name}</td><td>{isEnglish?englishRoleStatus(item):roleAwareStatus(item)}</td><td>{formatMetric(item.validation.net_return_pct)}</td><td>{formatMetric(item.locked_test?.net_return_pct)}</td><td>{formatMetric(item.locked_test?.max_drawdown_pct??item.validation.max_drawdown_pct)}</td><td>{formatMetric(item.validation.turnover_pct)}</td><td>{formatMetric(item.validation.stability_pct)}</td></tr>)}</tbody></table></div>}
function formatMetric(value:number|null|undefined){return value===null||value===undefined?"—":`${value.toFixed(2)}%`}

function SavedLibrary({isEnglish=false,items,busy,onAction,onOpenDetail}:{isEnglish?:boolean;items:SavedResearchStrategy[];busy:boolean;onAction:(id:string,action:"clone"|"delete"|"rerun"|"evidence")=>void;onOpenDetail:(strategy:SavedResearchStrategy)=>void}){
  return <section id="saved-research" className="sr-library-panel">
    <header className="sr-library-header"><History/><div><h3>{pick(isEnglish,"我的研究方法","My saved methods")}</h3><small>{pick(isEnglish,`已保存 ${items.length} 个方法，可打开单个策略查看`,`${items.length} saved method${items.length===1?"":"s"} · open a strategy for full details`)}</small></div></header>
    {!items.length?<div className="sr-library-empty"><History/><span><strong>{pick(isEnglish,"还没有保存的方法","No saved methods yet")}</strong><small>{pick(isEnglish,"完成一次研究后，保存的方法会在这里出现。","Saved methods appear here after research is completed.")}</small></span></div>:<div className="sr-library-table-wrap"><table className="sr-library-table"><thead><tr><th>{pick(isEnglish,"策略名称","Method name")}</th><th>{pick(isEnglish,"包含资产","Assets")}</th><th>{pick(isEnglish,"开始关注时间","Created")}</th><th>{pick(isEnglish,"样本外日期","Out-of-sample end")}</th><th>{pick(isEnglish,"年化收益","Annual return")}</th><th>{pick(isEnglish,"最大回撤","Max drawdown")}</th><th>{pick(isEnglish,"操作","Actions")}</th></tr></thead><tbody>{items.map(item=><tr key={item.id}><td><button type="button" className="sr-library-method-name" onClick={()=>onOpenDetail(item)}>{localizedStrategyName(item.dsl,item.name,isEnglish)||pick(isEnglish,"已保存方法","Saved method")}</button><small>{pick(isEnglish,`版本 ${item.version}`,`v${item.version}`)}{item.parent_strategy_id?pick(isEnglish," · 已复制"," · copied"):""}</small></td><td><strong>{localizedUniverseName(item.universe_snapshot,isEnglish)}</strong><small>{localizedDataStatus(item.universe_snapshot.status,isEnglish)}</small></td><td><time>{item.confirmed_at}</time></td><td><time>{item.data_cutoff}</time></td><td>{formatMetric(item.latest_metrics?.net_return_pct)}</td><td>{formatMetric(item.latest_metrics?.max_drawdown_pct)}</td><td className="sr-library-actions"><button type="button" onClick={()=>onAction(item.id,"rerun")} disabled={busy}>{pick(isEnglish,"重检","Recheck")}</button><button type="button" onClick={()=>onAction(item.id,"clone")} disabled={busy}>{pick(isEnglish,"复制并修改","Copy")}</button><button type="button" onClick={()=>onOpenDetail(item)}>{pick(isEnglish,"查看详情","Open")}</button><button type="button" onClick={()=>onAction(item.id,"delete")} disabled={busy} aria-label={pick(isEnglish,"删除研究方法","Delete method")}><Trash2/></button></td></tr>)}</tbody></table></div>}
  </section>;
}

function chooseStrategyEvaluation(run:ResearchRun|undefined|null,strategyId:string){
  if(!run)return null;
  const exact=run.evaluations.find(item=>item.strategy.id===strategyId);
  if(exact)return exact;
  const passedCandidate=run.evaluations.find(item=>item.strategy.source==="constrained_ai"&&item.status==="limited_candidate");
  if(passedCandidate)return passedCandidate;
  const benchmark=run.evaluations.find(item=>item.strategy.id===run.comparison_standard?.benchmark_strategy_id);
  return passedCandidate??benchmark??run.evaluations[0]??null;
}

function strategyTerminalValue(valuePct:number|null|undefined,start=10000){
  if(valuePct===null||valuePct===undefined)return "—";
  return `¥${(start*(1+valuePct/100)).toLocaleString("en-US",{maximumFractionDigits:2})}`;
}

function SavedStrategyDetailDrawer({isEnglish=false,strategy,run,loading,onClose}:{isEnglish?:boolean;strategy:SavedResearchStrategy|null;run:ResearchRun|null;loading:boolean;onClose:()=>void}){
  if(!strategy)return null;
  const selected=chooseStrategyEvaluation(run,strategy.dsl.id);
  const displayInitialCapital=1000000;
  const finalMetrics=selected?selected.locked_test??selected.validation:null;
  const runReference=run?.id ? `#${run.id.slice(0,8)}` : pick(isEnglish,"未运行","Not run");
  const runTime=run?.confirmed_at ? new Date(run.confirmed_at).toLocaleString(isEnglish?"en-US":"zh-CN", {hour12:false}) : pick(isEnglish,"未重算","Not recalculated");
  const sampleStart=run?.split.research_end;
  const sampleEnd=run?.data_audit.data_cutoff;
  const benchmark=run
    ? run.evaluations.find(item=>item.strategy.id===run.comparison_standard?.benchmark_strategy_id)??run.evaluations.find(item=>item.strategy.source==="traditional")
    : null;
  const benchmarkName=benchmark?friendlyStrategyName(benchmark.strategy,isEnglish):pick(isEnglish,"未设置基准","No baseline strategy");
  const benchmarkStatus=benchmark?(isEnglish?englishRoleStatus(benchmark):sourceLabels[benchmark.strategy.source]):pick(isEnglish,"基准尚未计算","Baseline not calculated");
  return <div className="sr-saved-drawer-overlay" aria-live="polite"><button className="sr-drawer-backdrop" aria-label={pick(isEnglish,"关闭详情","Close details")} onClick={onClose}/><aside className="sr-saved-drawer" role="dialog" aria-modal="true" aria-label={pick(isEnglish,"方法详情","Method details")}>
    <header><div><span>{pick(isEnglish,"方法详情","Method details")}</span><h2>{localizedStrategyName(strategy.dsl,strategy.name,isEnglish)}</h2><small>{localizedStrategyThesis(strategy.dsl,strategy.thesis_plain,isEnglish)}</small></div><button type="button" onClick={onClose}>{pick(isEnglish,"关闭","Close")}</button></header>
    <section className="sr-drawer-chart-shell">
      <div className="sr-drawer-hero">
        <div className="sr-drawer-meta">
          <span>{pick(isEnglish,"策略回放","Backtest overview")}</span>
          <div><small>{pick(isEnglish,"时间范围","Sample period")}</small><strong>{sampleStart&&sampleEnd?`${sampleStart} – ${sampleEnd}`:pick(isEnglish,"待加载","Loading")}</strong></div>
          <div><small>{pick(isEnglish,"初始资金","Initial capital")}</small><strong>¥{displayInitialCapital.toLocaleString(isEnglish ? "en-US" : "zh-CN")}</strong><small>{pick(isEnglish,"预览页可改","Editable in preview page")}</small></div>
          <div><small>{pick(isEnglish,"佣金","Commission")}</small><strong>{strategy.cost_assumptions.commission_bps.toFixed(2)} bps</strong></div>
          <div><small>{pick(isEnglish,"印花税/交易税","Stamp + trading tax")}</small><strong>{strategy.cost_assumptions.stamp_tax_bps.toFixed(2)} bps</strong></div>
          <div><small>{pick(isEnglish,"滑点","Slippage")}</small><strong>{strategy.cost_assumptions.slippage_bps.toFixed(2)} bps</strong></div>
          <div><small>{pick(isEnglish,"运行时刻","Run")}</small><strong>{runReference} · {runTime}</strong></div>
          <div><small>{pick(isEnglish,"对照策略","Benchmark")}</small><strong>{benchmarkName}</strong><small>{benchmarkStatus}</small></div>
        </div>
      </div>
      {loading?<div className="sr-drawer-placeholder">{pick(isEnglish,"加载回测曲线中…","Loading history chart…")}</div>:run&&selected? <BacktestPlayback run={run} compact simpleCompare focusStrategyId={selected.strategy.id} isEnglish={isEnglish}/>:<div className="sr-drawer-placeholder">{pick(isEnglish,"该方法尚未产生可回放结果。","No reproducible history is available for this method yet.")}</div>}
      <div className="sr-saved-drawer-kpi">
        <article><span>{pick(isEnglish,"模拟终值","Final value")}</span><strong>{finalMetrics?strategyTerminalValue(finalMetrics.net_return_pct):"—"}</strong></article>
        <article><span>{pick(isEnglish,"佣金","Commission")}</span><strong>{strategy.cost_assumptions.commission_bps.toFixed(2)} bps</strong></article>
        <article><span>{pick(isEnglish,"印花税/交易税","Tax (stamp / trading)")}</span><strong>{strategy.cost_assumptions.stamp_tax_bps.toFixed(2)} bps</strong></article>
        <article><span>{pick(isEnglish,"滑点","Slippage")}</span><strong>{strategy.cost_assumptions.slippage_bps.toFixed(2)} bps</strong></article>
      </div>
      <div className="sr-drawer-details">
        <div className="sr-saved-drawer-kpi">
          <article><span>{pick(isEnglish,"年化收益","Annualized return")}</span><strong>{finalMetrics&&finalMetrics.annualized_return_pct!==null&&finalMetrics.annualized_return_pct!==undefined?formatMetric(finalMetrics.annualized_return_pct):"—"}</strong></article>
          <article><span>{pick(isEnglish,"最大回撤","Max drawdown")}</span><strong>{finalMetrics&&finalMetrics.max_drawdown_pct!==null&&finalMetrics.max_drawdown_pct!==undefined?formatMetric(finalMetrics.max_drawdown_pct):"—"}</strong></article>
          <article><span>{pick(isEnglish,"夏普","Sharpe")}</span><strong>{finalMetrics&&finalMetrics.sharpe!==null&&finalMetrics.sharpe!==undefined?Number(finalMetrics.sharpe).toFixed(2):"—"}</strong></article>
          <article><span>{pick(isEnglish,"对照策略","Benchmark")}</span><strong>{benchmark?(isEnglish?englishStrategyName(benchmark.strategy):benchmark.strategy.name):pick(isEnglish,"待确定","Pending")}</strong></article>
        </div>
        {run&&<details className="sr-detail-drawer-methods"><summary>{pick(isEnglish,"规则执行逻辑","How it works")}</summary><StrategyRuleTree strategy={strategy.dsl} isEnglish={isEnglish}/></details>}
        {run&&<details className="sr-detail-drawer-run"><summary>{pick(isEnglish,"回测明细","Backtest details")}</summary><MetricsTable run={run} isEnglish={isEnglish}/></details>}
      </div>
    </section>
  </aside></div>;
}

function StrategyRuleTree({strategy,isEnglish=false}:{strategy:StrategyDSL;isEnglish?:boolean}){
  const factorLabel:Record<string,string>={momentum_60:"60 日强度",low_volatility_20:"20 日低波动",reversal_5:"5 日反转",trend_ma20_60:"趋势过滤"};
  const factorLabelEn:Record<string,string>={momentum_60:"60-day strength",low_volatility_20:"20-day low volatility",reversal_5:"5-day reversal",trend_ma20_60:"trend filter"};
  const filterLabel:Record<string,string>={trend_positive:"趋势为正",exclude_high_volatility:"排除最高波动",minimum_history:"历史覆盖足够",exclude_missing_data:"排除数据缺失"};
  const filterLabelEn:Record<string,string>={trend_positive:"Trend is positive",exclude_high_volatility:"Exclude highest volatility",minimum_history:"Sufficient history coverage",exclude_missing_data:"Exclude symbols with missing history"};
  const filters=strategy.filters.filter(item=>item.enabled);
  const filterTexts=filters.map(filter=>isEnglish?filterLabelEn[filter.id]:filterLabel[filter.id]).filter(Boolean);
  return <div className="sr-strategy-rule-tree">
    <article className="sr-rule-node"><strong>{pick(isEnglish,"资产池","Asset universe")}</strong><p>{pick(isEnglish,`${strategy.universe.mode==="custom"?"自选样本":"行业预设"} · ${strategy.universe.id ?? strategy.universe.mode}`,`${strategy.universe.mode==="custom"?"Custom sample":"Preset sample"} · ${strategy.universe.id ?? strategy.universe.mode}`)}</p><small>{pick(isEnglish,"由该配置定义的样本","Sample defined by this configuration")}</small></article>
    <div className="sr-rule-branch"><div className="sr-rule-path sr-rule-path-if">IF</div><article className="sr-rule-node"><strong>{pick(isEnglish,"排序与筛选","Sort and rank")}</strong><p>{strategy.factors.map(factor=>(isEnglish?factorLabelEn[factor.id]:factorLabel[factor.id])).join(" + ")}；{pick(isEnglish,`按 ${strategy.portfolio.quantile*100}% 分位选前 ${strategy.portfolio.max_positions} 只`,`top ${strategy.portfolio.max_positions} by ${strategy.portfolio.quantile*100}% quantile`)}，{pick(isEnglish,strategy.portfolio.weighting==="equal"?"等权":"按规则加权",strategy.portfolio.weighting==="equal"?"equal weighted":"weighted by rule")}</p></article></div>
    <div className="sr-rule-branch"><div className="sr-rule-path sr-rule-path-if">IF/ELSE</div><div className="sr-rule-branch-lane"><article className="sr-rule-node"><strong>{pick(isEnglish,"条件判断","Condition")}</strong><p>{filterTexts.length?filterTexts.join(isEnglish?"; ":"；"):pick(isEnglish,"无过滤条件","no filters")}</p></article><article className="sr-rule-node"><strong>{pick(isEnglish,"通过","Pass")}</strong><p>{pick(isEnglish,"进入排序节点","Continue to ranking node")}</p></article><article className="sr-rule-node"><strong>{pick(isEnglish,"不通过","Fail")}</strong><p>{pick(isEnglish,"本期剔除","Exclude this period's candidate")}</p></article></div></div>
    <div className="sr-rule-branch"><div className="sr-rule-path sr-rule-path-if">THEN</div><article className="sr-rule-node"><strong>{pick(isEnglish,"持仓与调仓","Holdings and rebalance")}</strong><p>{pick(isEnglish,`${strategy.portfolio.weighting==="equal"?"等权":"按规则加权"} / ${strategy.rebalance.frequency==="monthly"?"每月":"每两周"}（持有 ${strategy.rebalance.holding_days} 天）`,`${strategy.portfolio.weighting==="equal"?"Equal weight":"Rule weighting"} / ${strategy.rebalance.frequency==="monthly"?"Monthly":"Biweekly"} (${strategy.rebalance.holding_days} days)`)}</p></article></div>
  </div>;
}
