"use client";
import {useState} from "react";
import {Bot,CheckCircle2,CircleAlert,Play,RefreshCw} from "lucide-react";
import type {AgentFunctionalEvaluationRun} from "../lib/agent-functional-evaluation";
import {formatHongKongDateTime} from "../lib/date-format";

export function AgentFunctionalEvaluationRunner({ready,provider,model,initialRun}:{ready:boolean;provider:string;model:string;initialRun?:AgentFunctionalEvaluationRun}){
  const[run,setRun]=useState(initialRun);const[busy,setBusy]=useState(false);
  const[message,setMessage]=useState(ready?"会运行新手、持仓、个股研究三类真实任务；未确认的工作台预览会自动取消。":"请先连接真实模型；本地关键词匹配不计入 Agent 分数。");
  const execute=async()=>{setBusy(true);setMessage("正在依次运行三类任务，并调用真实行情、财务与公告工具…");try{const response=await fetch("/api/evaluation/agent",{method:"POST"});const body=await response.json() as {message?:string;run?:AgentFunctionalEvaluationRun};if(!response.ok||!body.run)throw new Error(body.message||"Agent 功能评测失败");setRun(body.run);setMessage("评测完成；失败项、工具状态、来源数量和模型信息已保留。");}catch(error){setMessage(error instanceof Error?error.message:"评测失败；没有生成分数。");}finally{setBusy(false);}};
  return <section className="agent-functional-evaluation"><header><div><span>Agent 三角色功能任务</span><strong>{provider} · {model||"模型未指定"}</strong></div><button onClick={()=>void execute()} disabled={!ready||busy}>{busy?<RefreshCw className="spin"/>:<Play/>}{busy?"运行中":"运行三类任务"}</button></header><p>{message}</p>{run&&<><div className="agent-functional-summary"><Bot/><strong>{run.passed}/{run.total}</strong><span>{run.score} 分<small>{formatHongKongDateTime(run.runAt)} · {run.version}</small></span></div><div className="agent-functional-scenarios">{run.scenarios.map(scenario=><article key={scenario.id} data-status={scenario.passed?"pass":"fail"}><header>{scenario.passed?<CheckCircle2/>:<CircleAlert/>}<span><strong>{scenario.title}</strong><small>{scenario.toolCalls.length} 个工具 · {scenario.sourceCount} 个来源</small></span></header><p>{scenario.goal}</p><ul>{scenario.checks.map(item=><li key={item.id} data-status={item.passed?"pass":"fail"}><span>{item.passed?"通过":"未通过"} · {item.label}</span><small>{item.evidence}</small></li>)}</ul></article>)}</div><small className="evaluation-disclosure">{run.disclosure}</small></>}</section>;
}
