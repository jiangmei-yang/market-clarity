import { DEFAULT_PROFILE, analyzeSocialContent, createWorkspace, precheckTrade, previewWorkspaceChange, type InvestorProfile, type Workspace } from "./personal-workbench";
import { callAIProviderWithFallback, readProviderState } from "./ai-provider-catalog";
import { aggregateReliability, reliability, type ReliabilityState } from "./failure-control";
import { DATA_SOURCE_REGISTRY, MODULE_REGISTRY, TOOL_CATALOG, WORKFLOW_REGISTRY, searchTools, themePatchFromRequirements, type AgentPlanStep, type GoalExtraction, type ThemeSchema, type ToolDefinition, type ToolProposal } from "./agent-registry";
import { cancelAssistantCommand, createAssistantPreview, confirmAssistantCommand } from "./assistant-server";
import { diagnosePublicEtfs } from "./etf-public";
import { readUserSnapshot, writeUserSnapshot, type UserSnapshot } from "./user-snapshot";
import { POST as runTradeAttributionRoute } from "../api/trade/attribution/route";
import {GET as readStockInformationRoute} from "../api/information/[code]/route";
import {GET as readFinancialRoute} from "../api/financial/[code]/route";
import {GET as readEvidenceRoute} from "../api/evidence/[code]/route";
import {searchPlatformCapabilityIndex} from "./capability-index-server";
import {parseStrategyDeterministically} from "./natural-language-strategy";
import {parseQuantGoal,routeQuantEngine} from "./quant-engine-router";

export type AgentSource={source_id:string;name:string;collected_at:string;sample_scope:string;status:"available"|"missing"|"unavailable"};
export type AgentToolCall={tool_id:string;status:"pending"|"running"|"completed"|"failed"|"cancelled";started_at?:string;completed_at?:string;input:Record<string,unknown>;output?:unknown;error?:string;sources:AgentSource[];reliability:ReliabilityState};
export type AgentInputField={id:string;label:string;question:string;type:"choice"|"text";options?:string[];required:true};
export type AgentInputRequest={title:string;description:string;fields:AgentInputField[]};
export type AgentTask={type:"agent_task";task_id:string;goal:string;status:"planning"|"awaiting_input"|"awaiting_confirmation"|"completed"|"failed"|"cancelled";created_at:string;updated_at:string;provider:string;model:string;planner_mode:"provider"|"local_fallback";extraction:GoalExtraction;plan:{task_id:string;goal:string;steps:AgentPlanStep[];requires_confirmation:boolean};steps:AgentPlanStep[];tool_calls:AgentToolCall[];workspace_before?:Workspace;workspace_patch:ReturnType<typeof previewWorkspaceChange>|null;workspace_command_id?:string;theme_schema?:ThemeSchema;input_request?:AgentInputRequest;input_answers?:Record<string,string>;continuation_count?:number;result:unknown;warnings:string[];sources:AgentSource[];tool_proposal?:ToolProposal;requires_confirmation:boolean;original_input:string;reliability:ReliabilityState};
type AgentSnapshot=UserSnapshot&{workspaces?:Workspace[];activeWorkspaceId?:string;holdings?:Record<string,{name?:string;value?:number;industry?:string}>;investorProfile?:InvestorProfile;agentTasks?:AgentTask[]};

const AGENT_PLANNER_PROMPT=`你是安心看股 Goal-to-Workspace 规划器。只返回 JSON，不写额外文字。你必须理解目标而不是输出投资建议。不得编造数据、工具或执行状态。输出字段：goal,context,user_stage,data_requirements,analysis_requirements,tool_requirements,ui_requirements,workflow_requirements,automation_requirements,style_requirements,risk_constraints,missing_information,risk_level。risk_level 只能是 low/medium/high/restricted。
规划原则：只选择完成目标所需的最少工具；用户未明确要求读取“我的持仓/我的组合”时，不得选择 get_portfolio 或 calculate_portfolio_risk；用户说“不要读取/不要使用”时必须遵守。分析问题不得自行添加 ui_requirements，只有用户明确要求修改页面、工作台、模块、布局、主题或流程时才能生成界面修改。缺少信息时最多列出 3 项，并按重要性排序。
只有用户要求系统代为买卖、自动下单，或要求平台保证收益时才是 restricted。用户表达“想赚钱”“希望短期翻倍”等目标不等于要求平台承诺收益，应标为 high，指出预期不现实，并继续提供学习、风险澄清或纸面模拟路径。`;
const now=()=>new Date().toISOString();
const cleanList=(value:unknown)=>Array.isArray(value)?value.filter((item):item is string=>typeof item==="string").slice(0,20):[];
const extractJson=(text:string)=>{const match=text.match(/\{[\s\S]*\}/);if(!match)throw new Error("规划模型没有返回 JSON");return JSON.parse(match[0]) as Record<string,unknown>;};
const inputRequest=(items:string[]):AgentInputRequest|undefined=>{
  const fields=items.slice(0,3).map((question,index):AgentInputField=>{
    const id=`input_${index+1}`;
    if(/(解决什么问题|我是新手|已经有持仓|想完成什么)/.test(question))return {id,label:"这次想先完成什么",question,type:"choice",options:["检查现有持仓","研究一只股票或 ETF","建立学习与模拟工作台","核验一条消息"],required:true};
    if(/(布局|位置|顺序|大小|放到哪里|首页)/.test(question))return {id,label:"放在哪里",question,type:"choice",options:["首页顶部","主要内容之后","右侧辅助区","由系统安排"],required:true};
    if(/(重合|重复|暴露|指标)/.test(question))return {id,label:"核对范围",question,type:"choice",options:["全部检查","重仓股重合","行业重合","主题重合"],required:true};
    if(/(期限|多久|时间|长期持有|几周|几个月|多久调整)/.test(question))return {id,label:"时间范围",question,type:"choice",options:["1 个月内","1—6 个月","6 个月以上","暂不确定"],required:true};
    if(/(亏损|损失|风险)/.test(question))return {id,label:"可承受损失",question,type:"choice",options:["5%以内","5%—10%","10%—20%","暂不确定"],required:true};
    if(/(频率|每周|投入多少时间)/.test(question))return {id,label:"查看频率",question,type:"choice",options:["每天","每周 2—3 次","每周一次","不固定"],required:true};
    return {id,label:/ETF|代码|标的/.test(question)?"ETF 或标的":"补充信息",question,type:"text",required:true};
  });
  return fields.length?{title:"补充后继续",description:"只需回答当前任务真正缺少的内容。系统会保留已完成步骤，并重新规划后续部分。",fields}:undefined;
};

function localExtraction(goal:string,context:Record<string,unknown>):GoalExtraction{
  const catalogHits=TOOL_CATALOG.filter((item)=>item.keywords.some((term)=>goal.toLowerCase().includes(term.toLowerCase())));
  const styles=["科技感","极简","浅色","深色","专业研究风","新手友好","低刺激","数据密集","控制台","轻量动画","高对比","减少红绿"].filter((term)=>goal.includes(term));
  const goalRisk=classifyGoalRisk(goal);
  const userStage=/(小白|新手|不知道)/.test(goal)?"beginner":/(专业|机构)/.test(goal)?"professional":"unknown";
  const ui=/(工作台|页面|界面|模块|主题|布局|颜色|字体|图表|动效|隐藏|显示|增加|移动|调整)/.test(goal)?[goal]:[];
  const workflows=/(流程|每周|每天|定期|复盘后|先做)/.test(goal)?[goal]:[];
  const socialLive=/(小红书|雪球|社交平台).*(最近|现在|热点|讨论什么)/.test(goal);
  return {goal,context,user_stage:userStage,data_requirements:[...new Set(catalogHits.flatMap((item)=>item.dataSources))],analysis_requirements:[...new Set(catalogHits.filter((item)=>["analysis","risk","quant"].includes(item.category)).map((item)=>item.description))],tool_requirements:catalogHits.map((item)=>item.toolId),ui_requirements:ui,workflow_requirements:workflows,automation_requirements:/(提醒|每周|每天|定期)/.test(goal)?[goal]:[],style_requirements:styles,risk_constraints:goalRisk.riskConstraints,missing_information:[...(socialLive?["当前没有已授权的社交平台实时样本；请上传或粘贴合法取得的公开内容"]:[]),...goalRisk.missingInformation],risk_level:goalRisk.level==="restricted"?"restricted":goalRisk.level==="high"?"high":/(规则|提醒|模拟组合|工作台)/.test(goal)?"medium":"low"};
}

export function classifyGoalRisk(goal:string){
  const execution=/(自动|替我|帮我).{0,12}(买入|卖出|下单|调仓|执行交易)|^(买入|卖出|下单)\b/.test(goal);
  const asksForGuarantee=/(保证|承诺|确保|担保).{0,8}(收益|盈利|赚钱|回报)|(?:收益|盈利|赚钱|回报).{0,8}(保证|承诺|确保|担保)|告诉我.{0,8}(必涨|稳赚)/.test(goal);
  const ambitiousTarget=/(一个月|1个月|几周|短期|尽快).{0,14}(翻倍|赚一倍|收益\s*100\s*%|盈利\s*100\s*%)|(翻倍|赚一倍).{0,14}(一个月|1个月|几周|短期|尽快)/.test(goal);
  if(execution)return {level:"restricted" as const,riskConstraints:["不会代为买卖或下单；可以继续做交易前检查或纸面模拟"],missingInformation:[]};
  if(asksForGuarantee)return {level:"restricted" as const,riskConstraints:["不能保证收益；可以改为比较风险、情景和纸面模拟结果"],missingInformation:[]};
  if(ambitiousTarget)return {level:"high" as const,riskConstraints:["短期本金翻倍属于极高风险目标，不能作为收益承诺或可实现结论"],missingInformation:["最多可以承受损失多少本金","是否只进行纸面模拟","每周愿意投入多少时间学习和复盘"]};
  return {level:"low" as const,riskConstraints:[],missingInformation:[]};
}

function validateExtraction(raw:Record<string,unknown>,goal:string,context:Record<string,unknown>):GoalExtraction{
  const risk=["low","medium","high","restricted"].includes(String(raw.risk_level))?raw.risk_level as GoalExtraction["risk_level"]:"low";
  return {goal:typeof raw.goal==="string"?raw.goal:goal,context,user_stage:["beginner","learner","experienced","professional","unknown"].includes(String(raw.user_stage))?raw.user_stage as GoalExtraction["user_stage"]:"unknown",data_requirements:cleanList(raw.data_requirements),analysis_requirements:cleanList(raw.analysis_requirements),tool_requirements:cleanList(raw.tool_requirements),ui_requirements:cleanList(raw.ui_requirements),workflow_requirements:cleanList(raw.workflow_requirements),automation_requirements:cleanList(raw.automation_requirements),style_requirements:cleanList(raw.style_requirements),risk_constraints:cleanList(raw.risk_constraints),missing_information:cleanList(raw.missing_information),risk_level:risk};
}

function toolAllowedForGoal(tool:ToolDefinition,goal:string){
  const normalized=goal.replaceAll(/\s+/g,"");
  const deniesPortfolio=/(不要|无需|不必|禁止)(读取|使用|调用)?(我的)?(真实)?(持仓|组合|账户)/.test(normalized);
  const explicitlyUsesPortfolio=/(读取|分析|检查|诊断|看看|查看|结合)(我的|当前|已保存)?(持仓|组合|仓位)|我的(持仓|组合)/.test(normalized);
  if(["get_portfolio","calculate_portfolio_risk"].includes(tool.toolId))return !deniesPortfolio&&explicitlyUsesPortfolio;
  if(tool.toolId==="search_capabilities")return /(平台|系统|安心看股).*(能做什么|支持什么|功能|能力|怎么用|如何使用)|(有哪些|支持哪些).*(页面|工具|功能|能力)/.test(goal);
  if(tool.toolId==="search_etf")return /(搜索|查找|找出|有哪些|代码).*(ETF|指数基金)|(ETF|指数基金).*(搜索|查找|代码)/i.test(goal);
  if(tool.toolId==="get_etf_holdings")return /(?<!\d)\d{6}(?!\d)/.test(goal)&&/(持仓|重仓|成分)/.test(goal);
  if(tool.toolId==="diagnose_etf_overlap")return /(?<!\d)\d{6}(?!\d)/.test(goal)&&/(重合|重复暴露|底层重复)/.test(goal);
  if(["search_stock","get_market_data","get_financial_report","get_announcement"].includes(tool.toolId))return /(股票|个股|公司|行情|价格|走势|成交量|财报|现金流|利润|营收|公告|(?<!\d)[036]\d{5}(?!\d))/i.test(goal);
  if(tool.toolId==="compare_etf")return /(比较|对比).*(ETF|基金)|(ETF|基金).*(比较|对比)/i.test(goal);
  if(tool.toolId==="explain_metric")return /(解释|看懂|是什么|什么意思).*(指标|估值|波动|回撤|集中度|现金流|市盈率|PE|PB|ROE)/i.test(goal);
  if(tool.toolId==="dca_simulation")return /(定投).*(模拟)|(模拟).*(定投)/.test(goal);
  if(tool.toolId==="run_paper_simulation")return /(纸面|模拟|虚拟).*(组合|交易|投资)/.test(goal);
  if(tool.toolId==="create_reminder")return /(创建|设置|增加|添加|保存|安排).{0,8}(提醒|通知)|(提醒|通知).{0,8}(我|一下|设置|创建)/.test(normalized);
  if(tool.toolId==="create_watchlist")return /(创建|设置|增加|添加|保存).{0,8}(观察列表|自选|关注)|(加入|放入).{0,8}(观察列表|自选|关注)/.test(normalized);
  if(tool.toolId==="save_user_rule")return /(保存|记住|以后|设为).{0,10}(规则|边界|偏好)|(规则|边界).{0,8}(保存|生效)/.test(normalized);
  if(tool.toolId==="create_workspace")return /(创建|新建).{0,10}工作台/.test(normalized);
  if(tool.toolId==="save_workspace")return /保存.{0,10}工作台|工作台.{0,10}保存/.test(normalized);
  if(tool.toolId==="restore_workspace")return /(恢复|撤销|重做).{0,10}工作台|工作台.{0,10}(恢复|撤销|重做)/.test(normalized);
  // A model may propose a useful follow-up, but confirmable tools must not enter
  // the execution plan unless the user actually requested that action.
  if(tool.permissionLevel==="confirm")return tool.keywords.some((keyword)=>normalized.includes(keyword.replaceAll(/\s+/g,"").toLowerCase()));
  return true;
}

function source(sourceId:string,status:AgentSource["status"]="available"):AgentSource{const item=DATA_SOURCE_REGISTRY.find((row)=>row.sourceId===sourceId);return {source_id:sourceId,name:item?.name??sourceId,collected_at:now(),sample_scope:item?.scope??"工具返回范围",status};}
function sourceFromOutput(sourceId:string,output:unknown,status:AgentSource["status"]="available"):AgentSource{
  const row=output as {source?:unknown;data_timestamp?:unknown};
  const fallback=source(sourceId,status);
  return {...fallback,name:typeof row?.source==="string"&&row.source?row.source:fallback.name,collected_at:typeof row?.data_timestamp==="string"&&row.data_timestamp?row.data_timestamp:now()};
}
function portfolioResult(snapshot:AgentSnapshot){const holdings=snapshot.holdings??{};const rows=Object.entries(holdings).map(([code,item])=>({code,name:item.name??code,value:Number(item.value??0),industry:item.industry??"待核对"})).filter((item)=>item.value>0);const total=rows.reduce((sum,item)=>sum+item.value,0);const positions=rows.map((item)=>({...item,weight:total?item.value/total:0})).sort((a,b)=>b.weight-a.weight);return {data_status:rows.length?"user_saved":"missing",portfolio_value:total,position_count:rows.length,largest_position:positions[0]??null,positions};}
function portfolioRiskResult(snapshot:AgentSnapshot){
  const portfolio=portfolioResult(snapshot);
  if(portfolio.data_status==="missing")return {...portfolio,largest_sector:null,sector_exposures:[],rule_checks:[],review_items:["先手动添加持仓或导入 CSV，系统不会连接券商账户。"]};
  const profile=snapshot.investorProfile??DEFAULT_PROFILE;
  const sectors=new Map<string,number>();
  for(const position of portfolio.positions)if(position.industry!=="待核对")sectors.set(position.industry,(sectors.get(position.industry)??0)+position.value);
  const sectorExposures=[...sectors.entries()].map(([industry,value])=>({industry,value,weight:portfolio.portfolio_value?value/portfolio.portfolio_value:0})).sort((a,b)=>b.weight-a.weight);
  const largest=portfolio.largest_position;
  const largestSector=sectorExposures[0]??null;
  const missingIndustry=portfolio.positions.filter((item)=>item.industry==="待核对").length;
  const ruleChecks=[
    {id:"single_position",label:"单一持仓",actual:largest?.weight??0,limit:profile.maxSingleWeight,status:(largest?.weight??0)>profile.maxSingleWeight?"exceeded":"within"},
    {id:"sector_concentration",label:"单一行业",actual:largestSector?.weight??0,limit:profile.maxSectorWeight,status:largestSector?(largestSector.weight>profile.maxSectorWeight?"exceeded":"within"):"unknown"},
  ];
  const reviewItems:string[]=[];
  if(largest)reviewItems.push(`${largest.name}占组合${(largest.weight*100).toFixed(1)}%，${largest.weight>profile.maxSingleWeight?"超过":"未超过"}个人单一持仓上限${(profile.maxSingleWeight*100).toFixed(0)}%。`);
  if(largestSector)reviewItems.push(`${largestSector.industry}占组合${(largestSector.weight*100).toFixed(1)}%，${largestSector.weight>profile.maxSectorWeight?"超过":"未超过"}个人行业上限${(profile.maxSectorWeight*100).toFixed(0)}%。`);
  if(missingIndustry)reviewItems.push(`${missingIndustry}项持仓缺少行业标签，行业集中度只能作为部分结果。`);
  if(!reviewItems.length)reviewItems.push("当前没有足够持仓数据可核对。");
  return {...portfolio,type:"portfolio_risk",largest_sector:largestSector,sector_exposures:sectorExposures,missing_industry_count:missingIndustry,rule_checks:ruleChecks,review_items:reviewItems,disclaimer:"结果只核对用户保存的持仓和个人规则，不构成买卖建议。"};
}

function pretradeResult(goal:string,snapshot:AgentSnapshot){
  const holdings=snapshot.holdings??{};const code=goal.match(/(?<!\d)\d{6}(?!\d)/)?.[0];const selected=code?holdings[code]:undefined;
  const portfolioValue=Object.values(holdings).reduce((sum,item)=>sum+Number(item.value??0),0);
  const amountMatch=goal.match(/(?:计划|准备|大约|金额|补仓|买入)[^\d]{0,12}([\d,.]+)\s*(万|元)/);
  const rawAmount=amountMatch?Number(amountMatch[1].replaceAll(",","")):0;const amount=amountMatch?.[2]==="万"?rawAmount*10_000:rawAmount;
  const sector=selected?.industry;const currentSectorValue=sector?Object.values(holdings).filter((item)=>item.industry===sector).reduce((sum,item)=>sum+Number(item.value??0),0):0;
  const similarAssets=sector?Object.entries(holdings).filter(([holdingCode,item])=>holdingCode!==code&&item.industry===sector).map(([,item])=>item.name??"未命名资产"):[];
  const recent=goal.match(/(?:近期|最近)[^\d-]{0,8}(-?\d+(?:\.\d+)?)\s*%/);
  const holdingPeriod=goal.match(/(?:持有|期限)[^，。；]{0,18}/)?.[0]??"";const exitCondition=goal.match(/(?:如果|失效|退出|止损)[^，。；]{0,36}/)?.[0]??"";
  const result=precheckTrade({amount,portfolioValue,currentAssetValue:Number(selected?.value??0),currentSectorValue,reason:goal,holdingPeriod,exitCondition,recentChange:recent?Number(recent[1]):0,source:/(朋友|群里|小红书|雪球|大V)/.test(goal)?"social":"user",similarAssets},snapshot.investorProfile??DEFAULT_PROFILE);
  return {data_status:amount>0?"calculated":"missing_input",code:code??null,amount:amount||null,...result,message:amount>0?undefined:"暂无完整金额：已检查理由与退出条件，但仓位比例需要补充计划金额。"};
}

async function tradeAttributionResult(goal:string){
  const headerIndex=goal.search(/日期\s*[,，]\s*代码\s*[,，]\s*名称\s*[,，]\s*方向/);
  if(headerIndex<0)return {data_status:"missing",message:"暂无交易记录：请粘贴包含“日期,代码,名称,方向,价格,数量,金额,费用”的 CSV。"};
  const content=goal.slice(headerIndex).replaceAll("，",",");const response=await runTradeAttributionRoute(new Request("http://internal/api/trade/attribution",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({file_content:content,delimiter:","})}));
  return response.json();
}

function codeFromGoal(goal:string){return goal.match(/(?<!\d)[036]\d{5}(?!\d)/)?.[0]??null;}
async function routeJson(response:Response){
  const payload=await response.json() as Record<string,unknown>;
  return {ok:response.ok,payload,status:response.status};
}
async function marketDataResult(goal:string){
  const code=codeFromGoal(goal);if(!code)return {data_status:"missing",message:"请补充 6 位 A 股代码。"};
  const result=await routeJson(await readStockInformationRoute(new Request(`http://internal/api/information/${code}`),{params:Promise.resolve({code})}));
  if(!result.ok)return {data_status:"unavailable",code,message:String(result.payload.message??"行情数据暂不可用"),reliability:result.payload.reliability};
  const history=((result.payload.history as {data?:Array<{date?:string;open?:number;high?:number;low?:number;close?:number;volume?:number}>}|undefined)?.data??[]).slice(-60);
  const latest=history.at(-1),previous=history.at(-2),first=history[0];
  const current=Number((result.payload.quote as {current_price?:number}|undefined)?.current_price??latest?.close??0);
  const dayChange=previous?.close&&current?(current/previous.close-1)*100:null;
  const periodChange=first?.close&&current?(current/first.close-1)*100:null;
  return {type:"market_snapshot",data_status:"available",code,current_price:current||null,day_change_pct:dayChange,period_change_pct:periodChange,period_days:history.length,data_timestamp:result.payload.data_timestamp??latest?.date??null,source:result.payload.source??result.payload.provider,latest_volume:latest?.volume??null,range:{high:history.length?Math.max(...history.map((item)=>Number(item.high??item.close??0))):null,low:history.length?Math.min(...history.map((item)=>Number(item.low??item.close??Infinity))):null},points:history.slice(-20),reliability:result.payload.reliability};
}
async function financialDataResult(goal:string,anomalyOnly=false){
  const code=codeFromGoal(goal);if(!code)return {data_status:"missing",message:"请补充 6 位 A 股代码。"};
  const result=await routeJson(await readFinancialRoute(new Request(`http://internal/api/financial/${code}`),{params:Promise.resolve({code})}));
  if(!result.ok)return {data_status:"unavailable",code,message:String(result.payload.message??"财务数据暂不可用"),reliability:result.payload.reliability};
  const checks=(result.payload.checks??[]) as Array<{id?:string;title?:string;state?:string;finding?:string;evidence?:string;why_it_matters?:string}>;
  return {type:anomalyOnly?"financial_anomaly":"financial_snapshot",data_status:"available",code,report_date:result.payload.report_date,headline:result.payload.headline,checks:anomalyOnly?checks.filter((item)=>item.state!=="steady"):checks,coverage:result.payload.coverage,data_timestamp:(result.payload.data_status as {updated_at?:string}|undefined)?.updated_at??result.payload.updated_at??result.payload.report_date,source:(result.payload.data_status as {source?:string}|undefined)?.source??result.payload.source??"公开财务报表",reliability:result.payload.reliability,disclaimer:"财务结果只做数据勾稽与异常核对，不构成盈利预测或买卖建议。"};
}
async function announcementResult(goal:string){
  const code=codeFromGoal(goal);if(!code)return {data_status:"missing",message:"请补充 6 位 A 股代码。"};
  const result=await routeJson(await readEvidenceRoute(new Request(`http://internal/api/evidence/${code}?reason=${encodeURIComponent(goal)}`),{params:Promise.resolve({code})}));
  if(!result.ok)return {data_status:"unavailable",code,message:String(result.payload.message??"公告检索暂不可用"),reliability:result.payload.reliability};
  const feed=result.payload.feed as {items?:Array<Record<string,unknown>>;updated_at?:string;sources?:string[];message?:string}|undefined;
  return {type:"announcement_snapshot",data_status:"available",code,assessment:result.payload.assessment,items:(feed?.items??[]).slice(0,5),coverage:result.payload.radar,data_timestamp:feed?.updated_at??result.payload.updated_at,source:feed?.sources?.join("、")??result.payload.source,message:feed?.message,reliability:result.payload.reliability,disclaimer:"公告标题只用于定位原文；结论需以法定披露原文为准。"};
}

async function executeSafeTool(tool:ToolDefinition,goal:string,snapshot:AgentSnapshot):Promise<AgentToolCall>{
  const started=now();const call:AgentToolCall={tool_id:tool.toolId,status:"running",started_at:started,input:{goal:goal.slice(0,500)},sources:[],reliability:reliability({status:"retrying",message:"工具正在执行",retryable:true})};
  try{
    if(tool.toolId==="search_capabilities"){const result=await searchPlatformCapabilityIndex(goal,{limit:10});call.output={type:"capability_answer",data_status:result.hits.length?"available":"missing",capabilities:result.hits,limitations:result.hits.length?[]:["当前能力索引没有找到对应能力"],index:result.index,runtime:result.runtime};call.sources=[source("capability_registry",result.hits.length?"available":"missing")];}
    else if(tool.toolId==="get_market_data"||tool.toolId==="search_stock"){call.output=await marketDataResult(goal);call.sources=[sourceFromOutput("public_market_data",call.output,(call.output as {data_status:string}).data_status==="available"?"available":"unavailable")];}
    else if(tool.toolId==="get_financial_report"){call.output=await financialDataResult(goal);call.sources=[sourceFromOutput("public_financial_data",call.output,(call.output as {data_status:string}).data_status==="available"?"available":"unavailable")];}
    else if(tool.toolId==="detect_financial_anomaly"){call.output=await financialDataResult(goal,true);call.sources=[sourceFromOutput("public_financial_data",call.output,(call.output as {data_status:string}).data_status==="available"?"available":"unavailable")];}
    else if(tool.toolId==="get_announcement"){call.output=await announcementResult(goal);call.sources=[sourceFromOutput("exchange_announcement",call.output,(call.output as {data_status:string}).data_status==="available"?"available":"unavailable")];}
    else if(tool.toolId==="get_portfolio"){call.output=portfolioResult(snapshot);call.sources=[source("user_portfolio",(call.output as {data_status:string}).data_status==="missing"?"missing":"available")];}
    else if(tool.toolId==="calculate_portfolio_risk"){call.output=portfolioRiskResult(snapshot);call.sources=[source("user_portfolio",(call.output as {data_status:string}).data_status==="missing"?"missing":"available")];}
    else if(["search_etf","get_etf_holdings","diagnose_etf_overlap"].includes(tool.toolId)){const codes=[...new Set(goal.match(/(?<!\d)\d{6}(?!\d)/g)??[])];if(!codes.length){call.output={data_status:"missing",message:"暂无数据：请补充 6 位 ETF 代码"};call.sources=[source("fund_disclosure","missing")];}else{const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15_000);try{call.output=await diagnosePublicEtfs(codes.map((code)=>({code})),controller.signal);}finally{clearTimeout(timer);}call.sources=[source("fund_disclosure")];}}
    else if(tool.toolId==="run_pretrade_check"){call.output=pretradeResult(goal,snapshot);call.sources=[source("user_portfolio",Object.keys(snapshot.holdings??{}).length?"available":"missing"),source("user_input")];}
    else if(tool.toolId==="run_trade_attribution"){call.output=await tradeAttributionResult(goal);call.sources=[source("user_uploaded_csv",(call.output as {data_status?:string}).data_status==="missing"?"missing":"available")];}
    else if(tool.toolId==="analyze_social_content"){const looksLikeSample=goal.length>120||/[“”「」]|https?:\/\//.test(goal);if(!looksLikeSample){call.output={type:"social_trend_analysis",period:"暂无数据",sources:[],topics:[],data_status:"insufficient_sample",message:"当前没有足够样本。请粘贴或上传合法取得的公开内容；系统不会伪造小红书或雪球热度。",disclaimer:"社交讨论热度不代表投资价值或未来收益。"};call.sources=[source("xiaohongshu_live","unavailable")];}else{call.output={type:"social_content_analysis",sample_count:1,analysis:analyzeSocialContent(goal),disclaimer:"社交热度仅代表内容讨论情况，不构成投资建议或买卖依据。"};call.sources=[source("user_uploaded_social_content")];}}
    else if(tool.toolId==="parse_natural_strategy"||tool.toolId==="validate_strategy_dsl"){const preview=parseStrategyDeterministically(goal);call.output={data_status:preview.validation.status==="blocked"?"missing_input":"available",preview,validation:preview.validation,message:preview.validation.allow_save?"策略已转换为白名单 DSL，仍需用户确认后才能保存。":"策略已解析，请先补充页面列出的必要信息。"};call.sources=[source("user_input"),source("strategy_registry")];}
    else if(tool.toolId==="route_quant_engine"){const parsed=parseQuantGoal(goal),route=routeQuantEngine(parsed);call.output={data_status:route.execution_status==="blocked"?"not_executed":"available",goal:parsed,engine_route:route,message:route.execution_status==="blocked"?"已找到适合的研究方式，但对应适配器尚不可用；没有伪造执行结果。":"系统已选择适合当前目标的研究方式。"};call.sources=[source("user_input"),source("engine_registry")];}
    else if(tool.toolId==="get_news"||tool.toolId==="get_social_content"){call.output={data_status:"not_executed",message:"当前没有已授权的自动数据源；请上传内容或由管理员配置合法接口。"};call.sources=tool.dataSources.map((id)=>source(id,"unavailable"));}
    else{call.output={data_status:"not_executed",message:"工具已匹配，但仍需要补充输入或在对应工具页面执行。"};call.sources=tool.dataSources.map((id)=>source(id,"missing"));}
    const dataStatus=String((call.output as {data_status?:string})?.data_status??"");
    const incomplete=["missing","missing_input","insufficient_sample","not_executed","unavailable"].includes(dataStatus);
    call.status="completed";call.completed_at=now();call.reliability=reliability({status:incomplete?"degraded":"healthy",last_success_at:call.completed_at,message:incomplete?"工具完成，但缺少部分输入或数据":"工具执行完成",warnings:incomplete?["部分结果：缺失项已在输出中标明"]:[],retryable:incomplete,allow_signal:false});return call;
  }catch(error){call.status="failed";call.error=error instanceof Error?error.message:"工具执行失败";call.completed_at=now();call.sources=tool.dataSources.map((id)=>source(id,"unavailable"));call.reliability=reliability({status:"failed",error_code:"AGENT_TOOL_FAILED",message:call.error,warnings:["未生成依赖该工具的最终信号"],retryable:true,allow_signal:false});return call;}
}

export function createToolProposal(goal:string):ToolProposal{return {name:`“${goal.slice(0,32)}”能力`,purpose:goal,inputs:["用户目标","必要参数"],outputs:["结构化结果","数据来源","错误状态"],data_sources:[],permissions:["仅限白名单数据访问","实现后需人工审核"],risks:["数据源可能不存在","金融结论不得由模型编造","禁止执行任意代码"],status:"proposal",requires_human_review:true};}

async function snapshotState(){const result=await readUserSnapshot();if(result.status!=="ready"&&result.status!=="empty")throw new Error("请先登录");const snapshot=(result.status==="ready"?result.snapshot:{}) as AgentSnapshot;const workspaces=snapshot.workspaces?.length?snapshot.workspaces:[createWorkspace("long_term")];const current=workspaces.find((item)=>item.id===snapshot.activeWorkspaceId)??workspaces[0];return {snapshot,workspaces,current};}

export async function createAgentTask(input:{goal:string;route?:string;selected_provider?:string}){
  const goal=input.goal.trim().slice(0,4000);if(!goal)throw new Error("请描述你想完成什么");
  const {snapshot,current}=await snapshotState();const providerState=await readProviderState();const provider=providerState.providers.find((item)=>item.providerId===input.selected_provider&&item.enabled&&item.connectionStatus==="available")??providerState.providers.find((item)=>item.isDefault&&item.enabled&&item.connectionStatus==="available")??providerState.providers.find((item)=>item.providerId==="mock")!;
  const context={route:input.route??"/agent",workspace_id:current.id,workspace_name:current.name,user_preferences:snapshot.exploratoryPreferences??null,portfolio_status:Object.keys(snapshot.holdings??{}).length?"available":"missing"};
  let extraction:GoalExtraction;let plannerMode:AgentTask["planner_mode"]="local_fallback";let actualProvider=provider.providerId;let actualModel=provider.model;
  if(provider.providerId!=="mock")try{const candidates=[provider,...providerState.providers.filter((item)=>item.providerId!==provider.providerId&&item.providerId!=="mock"&&item.enabled&&item.connectionStatus==="available")];const planned=await callAIProviderWithFallback(candidates,[{role:"system",content:AGENT_PLANNER_PROMPT},{role:"user",content:JSON.stringify({goal,context,registries:{tools:TOOL_CATALOG.map((item)=>({tool_id:item.toolId,description:item.description,permission:item.permissionLevel})),modules:MODULE_REGISTRY,workflows:WORKFLOW_REGISTRY}})}],900);extraction=validateExtraction(extractJson(planned.content),goal,context);plannerMode="provider";actualProvider=planned.provider;actualModel=planned.model;}catch{extraction=localExtraction(goal,context);}else extraction=localExtraction(goal,context);
  const deterministicRisk=classifyGoalRisk(goal);
  if(deterministicRisk.level==="restricted"){
    extraction.risk_level="restricted";
    extraction.risk_constraints=[...new Set([...extraction.risk_constraints,...deterministicRisk.riskConstraints])];
  }else if(deterministicRisk.level==="high"){
    // A user's ambitious goal is not a request for the platform to promise returns.
    // Keep the conversation open, while making the risk and missing decisions explicit.
    extraction.risk_level="high";
    extraction.risk_constraints=[...new Set([...extraction.risk_constraints.filter((item)=>!item.includes("交易执行")),...deterministicRisk.riskConstraints])];
    extraction.missing_information=[...new Set([...extraction.missing_information,...deterministicRisk.missingInformation])];
  }
  const requestsNewTool=/(增加|创建|做一个|开发).*(工具|分析器|检测器|模拟器)/.test(goal);
  // Provider output is a proposal, not the source of truth for platform capabilities.
  // Only show a capability gap when the user explicitly asked to build a new tool.
  const unknownRequestedTools=extraction.tool_requirements.filter((toolId)=>!TOOL_CATALOG.some((item)=>item.toolId===toolId));
  const capabilityGap=requestsNewTool&&(unknownRequestedTools.length>0||!/(ETF|回测|定投|交易前|交易复盘|社交内容|社交热点|指标解释|提醒|观察列表|工作台)/i.test(goal));
  let matched=[...new Map([...searchTools(extraction),...TOOL_CATALOG.filter((item)=>extraction.tool_requirements.includes(item.toolId))].map((item)=>[item.toolId,item])).values()].filter((item)=>item.permissionLevel!=="restricted"&&toolAllowedForGoal(item,goal));
  if(capabilityGap)matched=[];
  const toolCalls:AgentToolCall[]=[];for(const item of matched.filter((tool)=>tool.permissionLevel==="safe").slice(0,5))toolCalls.push(await executeSafeTool(item,goal,snapshot));
  const deniesWorkspace=/(不要|无需|不必|禁止)(调整|修改|创建|改变|使用)?(我的|当前)?(工作台|页面|界面|模块|布局|主题|流程)/.test(goal.replaceAll(/\s+/g,""));
  const explicitWorkspaceRequest=!deniesWorkspace&&/(工作台|页面|界面|模块|布局|主题|颜色|字体|图表|动效|放到首页|创建.{0,8}流程|建立.{0,8}流程|调整.{0,8}流程|隐藏|显示|移动)/.test(goal);
  const needsWorkspace=explicitWorkspaceRequest&&(extraction.ui_requirements.length>0||extraction.style_requirements.length>0||explicitWorkspaceRequest);
  let workspacePatch:AgentTask["workspace_patch"]=null;let workspaceCommandId:string|undefined;let themeSchema:ThemeSchema|undefined;
  if(needsWorkspace){const previewResult=await createAssistantPreview(goal,current.id);workspacePatch=previewResult.parsed;if(workspacePatch.canApply)workspaceCommandId=previewResult.commandId;themeSchema=themePatchFromRequirements(extraction.style_requirements.length?extraction.style_requirements:[goal],workspacePatch.preview.theme)?.themeSchema;}
  const workspaceFailed=needsWorkspace&&!workspacePatch?.canApply;
  const incompleteTools=toolCalls.filter((call)=>["missing","missing_input","insufficient_sample","not_executed","unavailable"].includes(String((call.output as {data_status?:string})?.data_status??"")));
  const clarificationQuestions=extraction.missing_information.length
    ? extraction.missing_information
    : workspacePatch?.questions??[];
  const needsInput=clarificationQuestions.length>0&&(workspaceFailed||matched.length===0||incompleteTools.length===toolCalls.length);
  const request=inputRequest(clarificationQuestions);
  const steps:AgentPlanStep[]=[{id:"step_1",title:"理解目标与当前上下文",tool:null,status:"completed",requires_confirmation:false},...matched.slice(0,6).map((item,index)=>({id:`step_${index+2}`,title:item.name,tool:item.toolId,status:(item.permissionLevel==="safe"?(toolCalls.find((call)=>call.tool_id===item.toolId)?.status??"pending"):"pending") as AgentPlanStep["status"],requires_confirmation:item.permissionLevel!=="safe"})),...(needsWorkspace?[{id:`step_${matched.length+2}`,title:"生成工作台修改预览",tool:"workspace_orchestrator",status:workspacePatch?.canApply?"completed" as const:needsInput?"awaiting_input" as const:"failed" as const,requires_confirmation:true}]:[])];
  const sources=[...new Map(toolCalls.flatMap((call)=>call.sources).map((item)=>[`${item.source_id}:${item.status}`,item])).values()];const warnings=[...extraction.risk_constraints];if(plannerMode==="local_fallback")warnings.push("当前没有可用的真实 AI Provider；任务结构由本地 Registry 匹配生成，不会冒充模型规划。");
  const toolHealth=toolCalls.length?aggregateReliability(toolCalls.map((call)=>call.reliability),"Agent 工具链"):reliability({status:plannerMode==="provider"?"healthy":"degraded",message:plannerMode==="provider"?"规划模型可用":"使用本地 Registry 降级规划",warnings:plannerMode==="provider"?[]:["未调用真实 AI 模型"],allow_signal:false});const failedCalls=toolCalls.filter((call)=>call.status==="failed");if(failedCalls.length)warnings.push(`部分结果缺失：${failedCalls.map((call)=>call.tool_id).join("、")} 可单独重试。`);
  const requiresConfirmation=Boolean(!workspaceFailed&&(workspaceCommandId||matched.some((item)=>item.permissionLevel==="confirm")));const taskId=`task_${crypto.randomUUID().replaceAll("-","").slice(0,14)}`;const nothingSucceeded=toolCalls.length>0&&failedCalls.length===toolCalls.length;const task:AgentTask={type:"agent_task",task_id:taskId,goal,status:extraction.risk_level==="restricted"||(!needsInput&&(workspaceFailed||nothingSucceeded))?"failed":needsInput?"awaiting_input":requiresConfirmation?"awaiting_confirmation":"completed",created_at:now(),updated_at:now(),provider:actualProvider,model:actualModel,planner_mode:plannerMode,extraction,plan:{task_id:taskId,goal,steps,requires_confirmation:requiresConfirmation},steps,tool_calls:toolCalls,workspace_before:needsWorkspace?structuredClone(current):undefined,workspace_patch:workspacePatch,workspace_command_id:workspaceCommandId,theme_schema:themeSchema,input_request:needsInput?request:undefined,result:toolCalls.map((call)=>({tool:call.tool_id,status:call.status,output:call.output})),warnings,sources,tool_proposal:capabilityGap?createToolProposal(goal):undefined,requires_confirmation:requiresConfirmation,original_input:goal,reliability:extraction.risk_level==="restricted"?reliability({status:"blocked",error_code:"RESTRICTED_FINANCIAL_ACTION",message:"这项请求包含平台不能执行或承诺的内容",warnings:extraction.risk_constraints,allow_signal:false}):needsInput?reliability({status:"blocked",error_code:"AWAITING_USER_INPUT",message:"补充必要信息后，任务会从当前步骤继续",retryable:false,allow_signal:false}):workspaceFailed?reliability({status:"failed",error_code:"WORKSPACE_PREVIEW_FAILED",message:"工作台修改预览无法应用",retryable:true,allow_signal:false}):toolHealth};
  const latestResult=await readUserSnapshot();
  const latest=(latestResult.status==="ready"?latestResult.snapshot:snapshot) as AgentSnapshot;
  latest.agentTasks=[...(latest.agentTasks??[]),task].slice(-100);
  await writeUserSnapshot(latest);return task;
}

function normalizeAgentTask(task:AgentTask):AgentTask{const calls=(task.tool_calls??[]).map(call=>({...call,reliability:call.reliability??reliability({status:call.status==="completed"?"degraded":call.status==="failed"?"failed":call.status==="cancelled"?"cancelled":"retrying",message:"历史工具记录未保存完整运行状态",retryable:call.status==="failed",allow_signal:false})}));return {...task,tool_calls:calls,reliability:task.reliability??(calls.length?aggregateReliability(calls.map(call=>call.reliability),"历史 Agent 任务状态"):reliability({status:"degraded",message:"历史任务缺少统一运行状态",allow_signal:false}))};}
export async function getAgentTask(taskId?:string){const {snapshot}=await snapshotState();const tasks=(snapshot.agentTasks??[]).map(normalizeAgentTask);if(!taskId)return tasks.slice().reverse();const task=tasks.find((item)=>item.task_id===taskId);if(!task)throw new Error("任务不存在");return task;}
async function updateTask(taskId:string,fn:(task:AgentTask)=>AgentTask){const {snapshot}=await snapshotState();const tasks=snapshot.agentTasks??[];const index=tasks.findIndex((item)=>item.task_id===taskId);if(index<0)throw new Error("任务不存在");tasks[index]=fn(tasks[index]);snapshot.agentTasks=tasks;await writeUserSnapshot(snapshot);return tasks[index];}
export async function continueAgentTask(taskId:string,answers:Record<string,string>){
  const task=await getAgentTask(taskId) as AgentTask;
  if(task.status!=="awaiting_input"||!task.input_request)throw new Error("当前任务不需要补充信息");
  const missing=task.input_request.fields.filter((field)=>field.required&&!String(answers[field.id]??"").trim());
  if(missing.length)throw new Error(`请先完成：${missing.map((field)=>field.label).join("、")}`);
  const supplement=task.input_request.fields.map((field)=>`${field.question}：${String(answers[field.id]).trim()}`).join("\n");
  const generated=await createAgentTask({goal:`${task.original_input}\n\n用户补充：\n${supplement}`,route:"/agent",selected_provider:task.provider});
  const {snapshot}=await snapshotState();
  const continued:AgentTask={...generated,task_id:task.task_id,goal:task.goal,created_at:task.created_at,updated_at:now(),original_input:`${task.original_input}\n\n用户补充：\n${supplement}`,input_answers:{...(task.input_answers??{}),...answers},continuation_count:(task.continuation_count??0)+1,plan:{...generated.plan,task_id:task.task_id,goal:task.goal}};
  snapshot.agentTasks=(snapshot.agentTasks??[]).filter((item)=>item.task_id!==task.task_id&&item.task_id!==generated.task_id).concat(continued).slice(-100);
  await writeUserSnapshot(snapshot);
  return continued;
}
export async function cancelAgentTask(taskId:string){const task=await getAgentTask(taskId) as AgentTask;if(task.workspace_command_id)await cancelAssistantCommand(task.workspace_command_id);return updateTask(taskId,(item)=>({...item,status:"cancelled",requires_confirmation:false,updated_at:now(),reliability:reliability({status:"cancelled",message:"任务已由用户取消",allow_signal:false}),steps:item.steps.map((step)=>step.requires_confirmation||step.status==="pending"?{...step,status:"cancelled"}:step),tool_calls:item.tool_calls.map((call)=>call.status==="pending"||call.status==="running"?{...call,status:"cancelled",reliability:reliability({status:"cancelled",message:"工具步骤已取消",allow_signal:false})}:call)}));}
export async function confirmAgentTask(taskId:string){const task=await getAgentTask(taskId) as AgentTask;if(task.status==="cancelled"||task.extraction.risk_level==="restricted")throw new Error("该任务不能确认执行");if(task.workspace_command_id)await confirmAssistantCommand(task.workspace_command_id);const unsupported=task.steps.filter((step)=>step.requires_confirmation&&step.tool!=="workspace_orchestrator");return updateTask(taskId,(item)=>({...item,status:unsupported.length?"failed":"completed",requires_confirmation:false,updated_at:now(),warnings:unsupported.length?[...item.warnings,`已确认，但 ${unsupported.map((step)=>step.title).join("、")} 仍缺少必要参数或执行适配，未伪造完成状态。`]:item.warnings,steps:item.steps.map((step)=>step.requires_confirmation?step.tool==="workspace_orchestrator"?{...step,status:"completed"}:{...step,status:"failed"}:step)}));}
export async function retryAgentTool(taskId:string,toolId:string){const task=await getAgentTask(taskId) as AgentTask;const previous=task.tool_calls.find((call)=>call.tool_id===toolId);if(!previous||previous.status!=="failed")throw new Error("该工具步骤不需要重试");const definition=TOOL_CATALOG.find((item)=>item.toolId===toolId);if(!definition||definition.permissionLevel!=="safe")throw new Error("该步骤不能自动重试");const {snapshot}=await snapshotState();const retried=await executeSafeTool(definition,task.original_input,snapshot);return updateTask(taskId,(stored)=>{const item=normalizeAgentTask(stored);const calls=item.tool_calls.map((call)=>call.tool_id===toolId?retried:call);const steps=item.steps.map((step)=>step.tool===toolId?{...step,status:retried.status}:step);const state=aggregateReliability(calls.map((call)=>call.reliability),"Agent 工具链");const remaining=calls.filter((call)=>call.status==="failed");return {...item,status:remaining.length===calls.length?"failed":item.requires_confirmation?"awaiting_confirmation":"completed",updated_at:now(),tool_calls:calls,steps,reliability:state,result:calls.map((call)=>({tool:call.tool_id,status:call.status,output:call.output})),warnings:item.warnings.filter((warning)=>!warning.startsWith("部分结果缺失：")).concat(remaining.length?[`部分结果缺失：${remaining.map((call)=>call.tool_id).join("、")} 可单独重试。`]:[])};});}
export async function retryAgentTask(taskId:string){const task=await getAgentTask(taskId) as AgentTask;const failed=task.tool_calls.filter((call)=>call.status==="failed");if(!failed.length)throw new Error("当前任务没有失败工具步骤");let updated=task;for(const call of failed)updated=await retryAgentTool(taskId,call.tool_id);return updated;}
export function listTools(){return {tools:TOOL_CATALOG,modules:MODULE_REGISTRY,data_sources:DATA_SOURCE_REGISTRY,workflows:WORKFLOW_REGISTRY};}
