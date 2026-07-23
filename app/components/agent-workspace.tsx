"use client";

import { useEffect, useState } from "react";
import { Bot, Check, CircleAlert, Clock3, Database, Download, ListChecks, LoaderCircle, Play, RefreshCw, RotateCcw, ShieldCheck, Sparkles, Square, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Reliability={status:string;message:string;error_code?:string|null;warnings:string[];retryable:boolean;allow_signal:boolean;allow_trade:boolean;fallback_used?:string|null};
type InputField={id:string;label:string;question:string;type:"choice"|"text";options?:string[];required:true};
type MiniWorkspace={name:string;modules:Array<{type:string;visible:boolean;order:number;width:"full"|"half"|"third"}>;workflow:string[]};
type Task={task_id:string;goal:string;status:string;created_at:string;provider:string;model:string;planner_mode:string;reliability?:Reliability;extraction:{user_stage:string;data_requirements:string[];analysis_requirements:string[];ui_requirements:string[];workflow_requirements:string[];missing_information:string[];risk_level:string};steps:Array<{id:string;title:string;tool:string|null;status:string;requires_confirmation:boolean}>;tool_calls:Array<{tool_id:string;status:string;error?:string;output?:unknown;reliability?:Reliability;sources:Array<{name:string;collected_at:string;sample_scope:string;status:string}>}>;workspace_before?:MiniWorkspace;workspace_patch?:{summary:string;changes:string[];questions:string[];warnings:string[];affectedModules:string[];preview?:MiniWorkspace}|null;theme_schema?:{name:string;mode:string;density:string;motion:string;colors:Record<string,string>;accessibility:{high_contrast:boolean;reduced_motion:boolean}};input_request?:{title:string;description:string;fields:InputField[]};input_answers?:Record<string,string>;continuation_count?:number;result:unknown;warnings:string[];sources:Array<{source_id:string;name:string;collected_at:string;sample_scope:string;status:string}>;tool_proposal?:{name:string;purpose:string;inputs:string[];outputs:string[];risks:string[]};requires_confirmation:boolean};
type Provider={providerId:string;displayName:string;model?:string;enabled:boolean;connectionStatus?:string;secretStatus?:string};

const examples=["分析我的 ETF 持仓，找出重复暴露，并把风险模块放到首页。","我是新手，帮我建立一个学习和模拟投资工作台。","我经常被社交平台影响，增加一个内容风险分析流程。","把当前页面改成科技感浅色主题，并减少红绿颜色。"];
const statusLabel:Record<string,string>={planning:"规划中",awaiting_input:"等待补充",awaiting_confirmation:"待确认",completed:"已完成",failed:"执行失败",cancelled:"已取消",pending:"等待",running:"执行中"};
const moduleNames:Record<string,string>={portfolio_risk:"持仓风险",etf_overlap:"ETF 重复暴露",social_risk:"社交内容风险",social_topics:"社交热点主题",social_heat:"热度变化",social_sentiment:"情绪分布",fundamental_verification:"基本面核验",valuation_verification:"估值核验",volume_verification:"资金与成交量核验",portfolio_overlap:"与持仓重合度",financial_quality:"财报体检",simulation_portfolio:"模拟持仓",term_explainer:"术语解释",pretrade_checklist:"交易前检查",weekly_digest:"每周摘要"};

export function AgentWorkspace(){
  const [goal,setGoal]=useState("");const [task,setTask]=useState<Task|null>(null);const [history,setHistory]=useState<Task[]>([]);const [providers,setProviders]=useState<Provider[]>([]);const [provider,setProvider]=useState("mock");const [themeId,setThemeId]=useState("light_quiet");const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [answers,setAnswers]=useState<Record<string,string>>({});
  const loadHistory=()=>fetch("/agent/tasks",{cache:"no-store"}).then((r)=>r.json() as Promise<{tasks?:Task[]}>).then((p)=>setHistory(p.tasks??[])).catch(()=>undefined);
  const loadActiveTheme=()=>fetch("/api/me/snapshot",{cache:"no-store"}).then((r)=>r.json() as Promise<{snapshot?:{activeWorkspaceId?:string;workspaces?:Array<{id:string;theme?:{themeId?:string}}>}}>).then((p)=>{const rows=p.snapshot?.workspaces??[];const active=rows.find((item)=>item.id===p.snapshot?.activeWorkspaceId)??rows[0];setThemeId(active?.theme?.themeId??"light_quiet")}).catch(()=>undefined);
  useEffect(()=>{void loadHistory();void loadActiveTheme();fetch("/assistant/session",{cache:"no-store"}).then((r)=>r.json() as Promise<{providers?:Provider[];default_provider_id?:string}>).then((p)=>{setProviders(p.providers??[]);setProvider(p.default_provider_id??"mock")}).catch(()=>undefined)},[]);
  const run=async()=>{if(!goal.trim()||busy)return;setBusy(true);setError("");try{const response=await fetch("/agent/tasks",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({goal,route:"/agent",selected_provider:provider})});const payload=await response.json() as Task&{message?:string};if(!response.ok)throw new Error(payload.message||"任务无法创建");setTask(payload);void loadHistory();}catch(e){setError(e instanceof Error?e.message:"任务无法创建")}finally{setBusy(false)}};
  const continueTask=async()=>{if(!task?.input_request||busy)return;setBusy(true);setError("");try{const response=await fetch(`/agent/tasks/${task.task_id}/continue`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({answers})});const payload=await response.json() as Task&{message?:string};if(!response.ok)throw new Error(payload.message||"任务无法继续");setTask(payload);setAnswers({});void loadHistory();}catch(e){setError(e instanceof Error?e.message:"任务无法继续")}finally{setBusy(false)}};
  const action=async(kind:"confirm"|"cancel"|"retry")=>{if(!task)return;setBusy(true);setError("");try{const response=await fetch(`/agent/tasks/${task.task_id}/${kind}`,{method:"POST",headers:{"content-type":"application/json"},body:kind==="confirm"?JSON.stringify({confirmed:true}):undefined});const payload=await response.json() as Task&{message?:string};if(!response.ok)throw new Error(payload.message||"操作失败");setTask(payload);if(kind==="confirm"&&task.theme_schema)setThemeId(task.theme_schema.mode==="dark"?"dark_focus":task.theme_schema.accessibility.high_contrast?"high_contrast":"clear_blue");window.dispatchEvent(new CustomEvent("anxin:snapshot-updated"));void loadHistory();}catch(e){setError(e instanceof Error?e.message:"操作失败")}finally{setBusy(false)}};
  const retryTool=async(toolId:string)=>{if(!task||busy)return;setBusy(true);setError("");try{const response=await fetch(`/agent/tasks/${task.task_id}/tools/${toolId}/retry`,{method:"POST"});const payload=await response.json() as Task&{message?:string};if(!response.ok)throw new Error(payload.message||"工具重试失败");setTask(payload);void loadHistory();}catch(e){setError(e instanceof Error?e.message:"工具重试失败")}finally{setBusy(false)}};
  const undo=async()=>{setBusy(true);try{const response=await fetch("/workspace/undo",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({confirmed:true})});if(!response.ok)throw new Error("没有可撤销的修改");await loadActiveTheme();window.dispatchEvent(new CustomEvent("anxin:snapshot-updated"));}catch(e){setError(e instanceof Error?e.message:"撤销失败")}finally{setBusy(false)}};
  const exportTask=()=>{if(!task)return;const blob=new Blob([JSON.stringify(task,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=`anxin-agent-${task.task_id}.json`;link.click();URL.revokeObjectURL(url)};
  const currentProvider=providers.find((item)=>item.providerId===provider);
  return <div className="agent-os" data-agent-theme={themeId}>
    <header className="agent-os-header"><div><span className="agent-kicker"><Bot/>任务工作台</span><h1>告诉我你想完成什么</h1><p>系统会列出步骤、调用已授权工具，并把保存或界面修改停在确认之前。</p></div><label><span>当前处理方式</span><select value={provider} onChange={(e)=>setProvider(e.target.value)}>{providers.filter((p)=>p.enabled).map((p)=><option key={p.providerId} value={p.providerId}>{p.displayName} · {p.model||"规则模式"}</option>)}</select><small>{provider==="mock"?"使用能力目录和确定性工具，不生成模型回答":currentProvider?.connectionStatus==="available"?"模型已连接":"需要配置"}</small></label></header>
    <section className="agent-command"><Textarea value={goal} onChange={(e)=>setGoal(e.target.value)} placeholder="告诉我你想完成什么，我来帮你搭建和执行。" rows={4}/><div className="agent-example-row">{examples.map((item)=><button key={item} onClick={()=>setGoal(item)}>{item}</button>)}</div><footer><span>查询和计算可直接执行；工作台、规则、提醒和模拟必须确认。</span><Button onClick={()=>void run()} disabled={!goal.trim()||busy}>{busy?<LoaderCircle className="spin"/>:<Play/>}生成执行计划</Button></footer></section>
    {error&&<div className="agent-error"><CircleAlert/>{error}</div>}
    {!task?<AgentEmpty/>:<div className="agent-task-grid">
      <section className="agent-intent"><header><Bot/><span><strong>目标结构</strong><small>{task.planner_mode==="provider"?"由当前模型规划":"由本地 Registry 安全匹配"}</small></span></header><div className="agent-intent-grid"><article><small>用户阶段</small><strong>{stageLabel(task.extraction.user_stage)}</strong></article><article><small>风险等级</small><strong>{riskLabel(task.extraction.risk_level)}</strong></article><article><small>需要数据</small><strong>{task.extraction.data_requirements.length} 项</strong></article><article><small>需要分析</small><strong>{task.extraction.analysis_requirements.length} 项</strong></article></div>{task.extraction.missing_information.length>0&&task.status!=="awaiting_input"&&<div className="agent-missing"><strong>可选补充</strong>{task.extraction.missing_information.slice(0,3).map((item)=><p key={item}><CircleAlert/>{item}</p>)}</div>}</section>
      {task.status==="awaiting_input"&&task.input_request&&<section className="agent-input-request">
        <header><CircleAlert/><span><strong>{task.input_request.title}</strong><small>{task.input_request.description}</small></span><Badge variant="outline">步骤 {Math.max(2,task.steps.findIndex((step)=>step.status==="awaiting_input")+1)}</Badge></header>
        <div className="agent-input-fields">{task.input_request.fields.map((field)=><fieldset key={field.id}><legend>{field.label}</legend><p>{field.question}</p>{field.type==="choice"?<div className="agent-choice-grid">{field.options?.map((option)=><button key={option} type="button" data-selected={answers[field.id]===option} onClick={()=>setAnswers((current)=>({...current,[field.id]:option}))}>{option}</button>)}</div>:<Input value={answers[field.id]??""} onChange={(event)=>setAnswers((current)=>({...current,[field.id]:event.target.value}))} placeholder="输入代码、名称或必要说明"/>}</fieldset>)}</div>
        <footer><span>已完成 {task.input_request.fields.filter((field)=>String(answers[field.id]??"").trim()).length}/{task.input_request.fields.length}</span><Button onClick={()=>void continueTask()} disabled={busy||task.input_request.fields.some((field)=>!String(answers[field.id]??"").trim())}>{busy?<LoaderCircle className="spin"/>:<Play/>}继续这项任务</Button></footer>
      </section>}
      <section className="agent-plan"><header><div><ListChecks/><span><small>任务 {task.task_id.slice(-6)}</small><strong>{task.goal}</strong></span></div><Badge variant={task.status==="completed"?"secondary":"outline"}>{statusLabel[task.status]??task.status}</Badge></header><div className="agent-steps">{task.steps.map((step,index)=><article key={step.id} data-status={step.status}><i>{step.status==="completed"?<Check/>:step.status==="failed"?<CircleAlert/>:index+1}</i><span><strong>{step.title}</strong><small>{step.tool||"任务规划"}{step.requires_confirmation?" · 需要确认":""}</small></span><em>{statusLabel[step.status]??step.status}</em></article>)}</div>{task.warnings.length>0&&<aside className="agent-warnings">{task.warnings.map((w)=><p key={w}><ShieldCheck/>{w}</p>)}</aside>}</section>
      <section className="agent-tools"><header><Wrench/><span><strong>工具调用</strong><small>{task.tool_calls.length} 项白名单能力</small></span></header>{task.tool_calls.length?task.tool_calls.map((call)=><article key={call.tool_id}><div><strong>{call.tool_id}</strong><Badge variant="outline">{statusLabel[call.status]??call.status}</Badge>{call.status==="failed"&&call.reliability?.retryable&&<Button size="sm" variant="ghost" onClick={()=>void retryTool(call.tool_id)} disabled={busy}><RefreshCw/>单步重试</Button>}</div><p>{summarizeOutput(call.output,call.error)}</p>{call.reliability&&<small>{call.reliability.message} · 信号{call.reliability.allow_signal?"允许":"阻断"} · 交易禁止</small>}</article>):<p className="agent-muted">本任务不需要调用金融数据工具。</p>}</section>
      <section className="agent-sources"><header><Database/><span><strong>数据来源</strong><small>来源、时间和样本边界</small></span></header>{task.sources.length?task.sources.map((item,index)=><article key={`${item.source_id}-${index}`}><div><strong>{item.name}</strong><Badge variant="outline">{item.status==="available"?"可用":item.status==="missing"?"缺少输入":"不可用"}</Badge></div><p>{item.sample_scope}</p><time>{new Date(item.collected_at).toLocaleString("zh-CN")}</time></article>):<p className="agent-muted">当前任务没有使用外部金融数据。</p>}</section>
      <section className="agent-result"><header><Check/><span><strong>结果预览</strong><small>仅展示工具真实返回或明确缺失状态</small></span></header>{task.tool_calls.length?<><AgentKeyFindings calls={task.tool_calls}/>{task.tool_calls.map((call)=><AgentResult key={`result-${call.tool_id}`} toolId={call.tool_id} output={call.output} error={call.error}/>)}</>:<p className="agent-muted">当前目标只涉及工作台配置，没有读取金融数据。</p>}</section>
      {task.workspace_patch&&task.status!=="awaiting_input"&&<section className="agent-patch"><header><Sparkles/><span><strong>工作台修改预览</strong><small>确认前不会改变页面</small></span></header><h2>{task.workspace_patch.summary}</h2>{task.workspace_before&&task.workspace_patch.preview&&<WorkspaceVisualDiff before={task.workspace_before} after={task.workspace_patch.preview}/>}<div className="agent-patch-modules">{task.workspace_patch.affectedModules.map((m)=><span key={m}>{moduleNames[m]??m}</span>)}</div>{task.theme_schema&&<div className="agent-theme-preview"><span style={{background:task.theme_schema.colors.accent}}/><div><small>主题预览</small><strong>{task.theme_schema.name} · {task.theme_schema.mode==="dark"?"深色":"浅色"}</strong><p>{task.theme_schema.density} 密度 · {task.theme_schema.motion} 动效{task.theme_schema.accessibility.reduced_motion?" · 减少动态":""}</p></div></div>}<ul>{task.workspace_patch.changes.map((c)=><li key={c}><Check/>{c}</li>)}</ul>{task.workspace_patch.questions.map((q)=><p key={q}><CircleAlert/>{q}</p>)}</section>}
      {task.tool_proposal&&<section className="agent-proposal"><header><Wrench/><span><strong>当前能力缺口</strong><small>不会生成或执行未知代码</small></span></header><h2>{task.tool_proposal.name}</h2><p>{task.tool_proposal.purpose}</p><div><b>需要审核</b>{task.tool_proposal.risks.join(" · ")}</div></section>}
      <section className="agent-actions"><div><strong>{task.status==="awaiting_input"?"等待你补充 1—3 项信息":task.requires_confirmation?"修改已预览，等待确认":task.status==="completed"?"任务已完成":"任务已停在安全边界内"}</strong><span>{task.reliability?.message??"系统不会执行真实交易。"} · 信号{task.reliability?.allow_signal?"允许":"阻断"} · 交易禁止</span></div><div>{task.requires_confirmation&&task.status!=="awaiting_input"&&<Button onClick={()=>void action("confirm")} disabled={busy}><Check/>确认并应用</Button>}{task.status!=="cancelled"&&task.status!=="completed"&&<Button variant="outline" onClick={()=>void action("cancel")} disabled={busy}><Square/>取消任务</Button>}{task.status==="failed"&&<Button variant="outline" onClick={()=>void action("retry")} disabled={busy}><RefreshCw/>仅重试失败步骤</Button>}<Button variant="outline" onClick={exportTask}><Download/>导出执行记录</Button><Button variant="ghost" onClick={()=>void undo()} disabled={busy}><RotateCcw/>撤销工作台修改</Button></div></section>
    </div>}
    <section className="agent-history"><header><Clock3/><span><strong>任务历史</strong><small>保留目标、计划、工具状态和确认结果</small></span></header>{history.slice(0,8).map((item)=><button key={item.task_id} onClick={()=>setTask(item)}><span><strong>{item.goal}</strong><small>{new Date(item.created_at).toLocaleString("zh-CN")} · {item.provider}/{item.model}</small></span><Badge variant="outline">{statusLabel[item.status]??item.status}</Badge></button>)}</section>
    <footer className="agent-disclaimer">本工具仅用于信息整理、模拟分析和风险提示，不构成投资建议、收益承诺或买卖指令。</footer>
  </div>
}

function WorkspaceVisualDiff({before,after}:{before:MiniWorkspace;after:MiniWorkspace}){
  const beforeTypes=new Set(before.modules.filter((item)=>item.visible).map((item)=>item.type));
  const afterTypes=new Set(after.modules.filter((item)=>item.visible).map((item)=>item.type));
  const render=(workspace:MiniWorkspace,side:"before"|"after")=><div className="agent-workspace-mini" data-side={side}>
    <header><span>{side==="before"?"当前":"修改后"}</span><strong>{workspace.name}</strong></header>
    <div className="agent-workspace-mini-grid">{workspace.modules.filter((item)=>item.visible).sort((a,b)=>a.order-b.order).map((item)=>{
      const changed=side==="after"?!beforeTypes.has(item.type):!afterTypes.has(item.type);
      return <article key={`${side}-${item.type}`} data-change={changed?(side==="after"?"added":"removed"):"kept"} data-width={item.width}><span>{moduleNames[item.type]??item.type}</span>{changed&&<small>{side==="after"?"新增":"将隐藏"}</small>}</article>;
    })}</div>
    <div className="agent-workflow-mini">{workspace.workflow.map((step,index)=><span key={`${side}-${step}`}>{index>0&&<i>→</i>}{workflowLabel(step)}</span>)}</div>
  </div>;
  return <div className="agent-workspace-diff">{render(before,"before")}<div className="agent-diff-arrow">→</div>{render(after,"after")}</div>;
}
function workflowLabel(value:string){return({learn:"学习",simulate:"模拟",research:"研究",check_social_claim:"核验内容",review_risk:"检查风险",pretrade_check:"交易前检查",confirm_next_step:"自行确认",review_trade:"复盘",generate_report:"生成报告",weekly_review:"定期复核",check_etf_overlap:"检查重合"} as Record<string,string>)[value]??value}

function AgentEmpty(){return <section className="agent-empty"><Sparkles/><h2>一个目标，可以组合多个能力</h2><p>例如先读取持仓，再检查 ETF 重复暴露，最后预览一个新的风险工作台。没有工具时，我会明确提出能力草案。</p><div><span>计划可见</span><span>来源可查</span><span>修改需确认</span><span>全程可撤销</span></div></section>}
function stageLabel(value:string){return({beginner:"投资新手",learner:"学习阶段",experienced:"有经验",professional:"专业用户",unknown:"待确认"} as Record<string,string>)[value]??value}
function riskLabel(value:string){return({low:"低风险",medium:"需确认",high:"高风险",restricted:"禁止执行"} as Record<string,string>)[value]??value}
function formatMoney(value:unknown){return new Intl.NumberFormat("zh-CN",{style:"currency",currency:"CNY",maximumFractionDigits:0}).format(Number(value??0))}
function formatPct(value:unknown){return `${(Number(value??0)*100).toFixed(1)}%`}
function formatPctPoints(value:unknown){const number=Number(value);return Number.isFinite(number)?`${number>0?"+":""}${number.toFixed(2)}%`:"暂无"}
function formatTime(value:unknown){if(!value)return"时间待核对";const date=new Date(String(value));return Number.isNaN(date.getTime())?String(value):date.toLocaleString("zh-CN",{timeZone:"Asia/Shanghai",hour12:false})}
function summarizeOutput(output:unknown,error?:string){
  if(error)return error;if(!output)return"暂无输出";const row=output as Record<string,unknown>;
  if(row.data_status==="missing")return String(row.message??"暂无数据");
  if(row.type==="portfolio_risk"){
    const largest=row.largest_position as {name?:string;weight?:number}|null;
    const sector=row.largest_sector as {industry?:string;weight?:number}|null;
    return `${largest?.name??"暂无持仓"} ${formatPct(largest?.weight)} · 最大行业 ${sector?.industry??"待核对"} ${formatPct(sector?.weight)}`;
  }
  if(row.type==="market_snapshot")return `${row.code} ${row.current_price??"暂无"} · 当日 ${formatPctPoints(row.day_change_pct)} · ${row.period_days}日 ${formatPctPoints(row.period_change_pct)}`;
  if(row.type==="financial_snapshot"||row.type==="financial_anomaly"){const checks=(row.checks??[]) as unknown[];return `${row.code} · 报告期 ${row.report_date??"暂无"} · ${checks.length} 项核对结果`;}
  if(row.type==="announcement_snapshot"){const items=(row.items??[]) as unknown[];return `${row.code} · ${items.length} 条近期公告 · ${String((row.assessment as {status?:string}|undefined)?.status??"待核对")}`;}
  if(row.message)return String(row.message);
  if(row.portfolio_value!==undefined)return`组合 ${formatMoney(row.portfolio_value)} · ${row.position_count} 项持仓`;
  if(row.type==="social_trend_analysis")return"当前没有足够样本，未生成平台热度";
  return"工具已返回结构化结果，可在任务记录中追溯。";
}
function AgentResult({toolId,output,error}:{toolId:string;output:unknown;error?:string}){
  const row=(output??{}) as Record<string,unknown>;
  if(row.type==="market_snapshot")return <article className="agent-research-result"><div className="agent-result-title"><strong>价格与成交</strong><span>{String(row.source??"公开行情")} · {formatTime(row.data_timestamp)}</span></div><div className="agent-risk-metrics"><div><small>最新收盘</small><b>{String(row.current_price??"暂无")}</b><span>{String(row.code)}</span></div><div><small>当日变化</small><b>{formatPctPoints(row.day_change_pct)}</b><span>相对上一交易日</span></div><div><small>{String(row.period_days)}日变化</small><b>{formatPctPoints(row.period_change_pct)}</b><span>历史区间，不代表未来</span></div></div></article>;
  if(row.type==="financial_snapshot"||row.type==="financial_anomaly"){
    const checks=(row.checks??[]) as Array<{id?:string;title?:string;state?:string;finding?:string;evidence?:string;why_it_matters?:string}>;
    return <article className="agent-research-result"><div className="agent-result-title"><strong>{row.type==="financial_anomaly"?"财务异常核对":"财务变化"}</strong><span>报告期 {String(row.report_date??"暂无")} · {String(row.source??"公开财务报表")}</span></div>{checks.length?<ul className="agent-check-list">{checks.map((item,index)=><li key={`${item.id}-${index}`}><b data-state={item.state}>{item.title??"核对项"}</b><span>{item.finding??"暂无结论"} · {item.evidence??"暂无证据"}</span><small>{item.why_it_matters}</small></li>)}</ul>:<p>当前规则没有发现需要单独列出的异常；这不等于财务没有风险。</p>}<small className="agent-result-note">{String(row.disclaimer??"")}</small></article>;
  }
  if(row.type==="announcement_snapshot"){
    const items=(row.items??[]) as Array<{title?:string;published_at?:string;source?:string;url?:string;relation?:string}>;
    return <article className="agent-research-result"><div className="agent-result-title"><strong>近期公告</strong><span>{String((row.assessment as {status?:string}|undefined)?.status??"待核对")} · {formatTime(row.data_timestamp)}</span></div>{items.length?<ul className="agent-announcement-list">{items.map((item,index)=><li key={`${item.url}-${index}`}><span><b>{item.title??"公司公告"}</b><small>{String(item.published_at??"").slice(0,10)} · {item.source??row.source}</small></span>{item.url?<a href={item.url} target="_blank" rel="noreferrer">打开原文</a>:null}</li>)}</ul>:<p>当前来源没有返回近期公告，不能据此推断没有事件。</p>}<small className="agent-result-note">{String(row.disclaimer??"")}</small></article>;
  }
  if(row.type!=="portfolio_risk")return <article><strong>{toolId}</strong><p>{summarizeOutput(output,error)}</p></article>;
  const largest=row.largest_position as {name?:string;code?:string;value?:number;weight?:number}|null;
  const sector=row.largest_sector as {industry?:string;weight?:number}|null;
  const checks=(row.rule_checks??[]) as Array<{id:string;label:string;actual:number;limit:number;status:string}>;
  const items=(row.review_items??[]) as string[];
  return <article className="agent-risk-result"><div className="agent-result-title"><strong>组合风险核对</strong><span>{row.position_count} 项持仓 · {formatMoney(row.portfolio_value)}</span></div><div className="agent-risk-metrics"><div><small>最大持仓</small><b>{largest?.name??"暂无"}</b><span>{formatPct(largest?.weight)} · {formatMoney(largest?.value)}</span></div><div><small>最大行业</small><b>{sector?.industry??"暂无可计算标签"}</b><span>{sector?formatPct(sector.weight):"请先补充行业"}</span></div><div><small>规则状态</small><b>{checks.filter((item)=>item.status==="exceeded").length} 项超限</b><span>{row.missing_industry_count?`${row.missing_industry_count} 项行业待补充`:"行业标签完整"}</span></div></div><ul>{items.map((item)=><li key={item}>{item}</li>)}</ul><small className="agent-result-note">{String(row.disclaimer??"")}</small></article>;
}
function AgentKeyFindings({calls}:{calls:Task["tool_calls"]}){
  const findings:string[]=[];
  for(const call of calls){
    const row=(call.output??{}) as Record<string,unknown>;
    if(row.type==="market_snapshot")findings.push(`近${row.period_days}个交易日价格变化 ${formatPctPoints(row.period_change_pct)}；价格变化本身不能解释原因。`);
    if(row.type==="financial_snapshot"||row.type==="financial_anomaly"){
      const checks=(row.checks??[]) as Array<{state?:string;title?:string;finding?:string;evidence?:string}>;
      for(const item of checks.filter((check)=>check.state==="attention"||check.state==="watch").slice(0,2))findings.push(`${item.title}：${item.finding}（${item.evidence}）。`);
    }
    if(row.type==="announcement_snapshot"){
      const items=(row.items??[]) as Array<{title?:string}>;
      if(items[0])findings.push(`最近公告包括“${items[0].title}”；需要打开原文核对披露范围，而不是只读标题。`);
    }
    if(row.type==="portfolio_risk")findings.push(...((row.review_items??[]) as string[]).slice(0,3));
  }
  if(!findings.length)return null;
  return <aside className="agent-key-findings"><span>先看这 {Math.min(findings.length,4)} 项</span><ol>{findings.slice(0,4).map((item)=><li key={item}>{item}</li>)}</ol></aside>;
}
