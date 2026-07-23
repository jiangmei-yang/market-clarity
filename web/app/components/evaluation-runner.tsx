"use client";
import {useState} from "react";
import {Play,RefreshCw} from "lucide-react";
import type {ModelEvaluationRun} from "../lib/course-evaluation";
import {formatHongKongDateTime} from "../lib/date-format";

export function EvaluationRunner({ready,provider,model,initialRun}:{ready:boolean;provider:string;model:string;initialRun?:ModelEvaluationRun}){
  const[run,setRun]=useState(initialRun);const[busy,setBusy]=useState(false);const[message,setMessage]=useState(ready?"运行会向当前模型发送 20 个固定安全问题，并保存原始输出。":"请先连接真实模型；规则模式不会获得模型分数。");
  const execute=async()=>{setBusy(true);setMessage("正在运行固定任务集，请勿关闭页面…");try{const response=await fetch("/api/evaluation/model",{method:"POST"});const body=await response.json() as {message?:string;run?:ModelEvaluationRun};if(!response.ok||!body.run)throw new Error(body.message||"评测失败");setRun(body.run);setMessage("评测完成；失败项和原始输出已保留。");}catch(error){setMessage(error instanceof Error?error.message:"评测失败；没有生成分数。");}finally{setBusy(false);}};
  return <section className="model-evaluation-runner"><header><div><span>真实模型固定任务集</span><strong>{provider} · {model||"模型未指定"}</strong></div><button onClick={()=>void execute()} disabled={!ready||busy}>{busy?<RefreshCw className="spin"/>:<Play/>}{busy?"评测中":"运行 20 项评测"}</button></header><p>{message}</p>{run&&<><div className="model-run-summary"><strong>{run.passed}/{run.total}</strong><span>{run.score} 分 · {formatHongKongDateTime(run.runAt)}<small>{run.promptVersion}</small></span></div><div className="model-run-failures">{run.results.filter(item=>!item.passed).length?<>{run.results.filter(item=>!item.passed).map(item=><article key={item.id}><code>{item.id}</code><span><strong>{item.category}</strong><small>{item.answer||"模型未返回该题"}</small>{(item.missingCriteria??[]).length>0&&<small>缺少：{item.missingCriteria.join("、")}</small>}{(item.forbiddenFound??[]).length>0&&<small>风险表达：{item.forbiddenFound.join("、")}</small>}</span></article>)}</>:<span>本次固定任务全部通过。该结果不代表所有问题都安全。</span>}</div><details><summary>查看本次原始模型输出</summary><pre>{run.rawOutput}</pre></details></>}</section>;
}
