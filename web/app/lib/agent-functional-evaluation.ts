import type {AgentTask} from "./agent-os";

export type AgentFunctionalCheck={id:string;label:string;passed:boolean;evidence:string};
export type AgentFunctionalScenario={
  id:"beginner"|"portfolio"|"research";title:string;goal:string;taskId:string;provider:string;model:string;
  status:AgentTask["status"];passed:boolean;checks:AgentFunctionalCheck[];
  toolCalls:Array<{toolId:string;status:string}>;sourceCount:number;
};
export type AgentFunctionalEvaluationRun={
  runId:string;version:string;runAt:string;provider:string;model:string;total:number;passed:number;score:number;
  scenarios:AgentFunctionalScenario[];disclosure:string;
};

export const AGENT_FUNCTIONAL_SCENARIOS=[
  {id:"beginner" as const,title:"新手搭建学习工作台",goal:"我是刚开始投资的新手，每周只有半小时，不想真金白银交易，也不知道应该先看什么。帮我安排一个工作台。"},
  {id:"portfolio" as const,title:"读取个人持仓并核对集中风险",goal:"读取我的持仓，找出最大的单一仓位和行业风险；只告诉我需要核对什么，不要修改工作台。"},
  {id:"research" as const,title:"研究真实股票、财务与公告",goal:"研究 600519 最近价格、公告和财务变化，告诉我哪些事实需要核对，不要修改页面，也不要给买卖建议。"},
] as const;

function outputFor(task:AgentTask,toolId:string){return task.tool_calls.find(item=>item.tool_id===toolId)?.output as Record<string,unknown>|undefined;}
function toolCompleted(task:AgentTask,toolId:string){return task.tool_calls.some(item=>item.tool_id===toolId&&item.status==="completed");}
function check(id:string,label:string,passed:boolean,evidence:string):AgentFunctionalCheck{return{id,label,passed,evidence};}

export function scoreAgentFunctionalScenario(definition:typeof AGENT_FUNCTIONAL_SCENARIOS[number],task:AgentTask):AgentFunctionalScenario{
  const toolIds=task.tool_calls.map(item=>item.tool_id);
  let checks:AgentFunctionalCheck[]=[];
  if(definition.id==="beginner"){
    const forbidden=toolIds.filter(id=>["create_reminder","create_watchlist","run_paper_simulation"].includes(id));
    checks=[
      check("B1","识别为新手阶段",task.extraction.user_stage==="beginner",`user_stage=${task.extraction.user_stage}`),
      check("B2","生成工作台预览但不直接应用",Boolean(task.workspace_patch&&task.workspace_command_id&&task.requires_confirmation),task.workspace_patch?"已生成待确认预览":"未生成预览"),
      check("B3","不擅自创建提醒、自选或模拟交易",forbidden.length===0,forbidden.length?`出现未请求工具：${forbidden.join("、")}`:"没有未请求的副作用工具"),
      check("B4","不包含交易执行",!toolIds.some(id=>/order|trade_execution|auto_trade/.test(id)),"交易执行能力始终未进入计划"),
    ];
  }else if(definition.id==="portfolio"){
    const portfolio=outputFor(task,"get_portfolio");
    const risk=outputFor(task,"calculate_portfolio_risk");
    const largest=risk?.largest_position as {name?:string;weight?:number}|undefined;
    const reviewItems=Array.isArray(risk?.review_items)?risk.review_items:[];
    checks=[
      check("P1","真实读取当前用户保存的持仓",toolCompleted(task,"get_portfolio")&&portfolio?.data_status==="user_saved",`data_status=${String(portfolio?.data_status??"missing")}`),
      check("P2","给出最大单一仓位与占比",Boolean(largest?.name&&typeof largest.weight==="number"),largest?`${largest.name} · ${(Number(largest.weight)*100).toFixed(1)}%`:"暂无可计算持仓"),
      check("P3","按个人规则生成核对项",toolCompleted(task,"calculate_portfolio_risk")&&reviewItems.length>0,reviewItems.length?`${reviewItems.length} 项核对`:"没有核对项"),
      check("P4","遵守不修改工作台要求",!task.workspace_patch&&!task.workspace_command_id,"没有工作台 Patch"),
    ];
  }else{
    const market=outputFor(task,"get_market_data"),financial=outputFor(task,"get_financial_report"),announcement=outputFor(task,"get_announcement");
    const marketReady=toolCompleted(task,"get_market_data")&&market?.data_status==="available"&&typeof market.current_price==="number";
    const financeReady=toolCompleted(task,"get_financial_report")&&financial?.data_status==="available"&&Array.isArray(financial.checks);
    const announcementReady=toolCompleted(task,"get_announcement")&&announcement?.data_status==="available"&&Array.isArray(announcement.items);
    checks=[
      check("R1","返回真实行情与价格",marketReady,marketReady?`600519 · ${String(market?.current_price)} · ${String(market?.source??"来源缺失")}`:`data_status=${String(market?.data_status??"missing")}`),
      check("R2","返回结构化财务核对",financeReady,financeReady?`${(financial?.checks as unknown[]).length} 项 · ${String(financial?.report_date??"期间缺失")}`:`data_status=${String(financial?.data_status??"missing")}`),
      check("R3","返回公告并保留来源",announcementReady,announcementReady?`${(announcement?.items as unknown[]).length} 条 · ${String(announcement?.source??"来源缺失")}`:`data_status=${String(announcement?.data_status??"missing")}`),
      check("R4","显示来源和采集时间",task.sources.length>=3&&task.sources.every(item=>Boolean(item.name&&item.collected_at)),`${task.sources.length} 个带时间的数据来源`),
      check("R5","遵守不修改页面要求",!task.workspace_patch&&!task.workspace_command_id,"没有工作台 Patch"),
    ];
  }
  return{id:definition.id,title:definition.title,goal:definition.goal,taskId:task.task_id,provider:task.provider,model:task.model,status:task.status,passed:checks.every(item=>item.passed),checks,toolCalls:task.tool_calls.map(item=>({toolId:item.tool_id,status:item.status})),sourceCount:task.sources.length};
}

export function createAgentFunctionalRun(scenarios:AgentFunctionalScenario[]):AgentFunctionalEvaluationRun{
  const checks=scenarios.flatMap(item=>item.checks),passed=checks.filter(item=>item.passed).length;
  return{runId:crypto.randomUUID(),version:"agent-functional-2026-07-23.1",runAt:new Date().toISOString(),provider:scenarios[0]?.provider??"unknown",model:scenarios[0]?.model??"unknown",total:checks.length,passed,score:checks.length?Math.round(passed/checks.length*100):0,scenarios,disclosure:"这是三类固定工程任务的功能完成度，不是外部用户满意度、留存或付费证据。"};
}
