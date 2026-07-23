"use client";

import {useEffect,useState} from "react";
import {Activity,ChevronDown,RefreshCw,ShieldCheck,TriangleAlert,X} from "lucide-react";
import type {ReliabilityState} from "@/app/lib/failure-control";

type HealthPayload={status:ReliabilityState;checked_at:string;current_model:{provider:string;model:string;reliability:ReliabilityState};capabilities:Array<{id:string;name:string;reliability:ReliabilityState}>};
const label:Record<ReliabilityState["status"],string>={healthy:"正常",degraded:"降级",stale:"已过期",unavailable:"不可用",blocked:"已阻断",failed:"失败",cancelled:"已取消",retrying:"重试中"};

export function SystemReliabilityCenter(){
  const [data,setData]=useState<HealthPayload>();const [open,setOpen]=useState(false);const [loading,setLoading]=useState(false);
  const load=async()=>{setLoading(true);try{const response=await fetch("/api/system/health",{cache:"no-store"});if(response.ok)setData(await response.json() as HealthPayload);}finally{setLoading(false);}};
  useEffect(()=>{let active=true;void fetch("/api/system/health",{cache:"no-store"}).then(response=>response.ok?response.json() as Promise<HealthPayload>:undefined).then(payload=>{if(active&&payload)setData(payload)});return()=>{active=false};},[]);const status=data?.status.status;
  return <aside className={`system-reliability ${open?"open":""}`} aria-label="系统运行状态"><button className={`system-reliability-trigger ${status??"checking"}`} onClick={()=>setOpen(value=>!value)} aria-expanded={open}>{status===undefined?<Activity/>:status==="healthy"?<ShieldCheck/>:<TriangleAlert/>}<span>系统状态</span><b>{status?label[status]:"检查中"}</b><ChevronDown/></button>{open&&<section><header><div><Activity/><span><b>运行与降级状态</b><small>{data?`检查于 ${new Date(data.checked_at).toLocaleTimeString("zh-CN")}`:"正在读取，不代表故障"}</small></span></div><button aria-label="关闭状态详情" onClick={()=>setOpen(false)}><X/></button></header><div className="system-capability-list">{data?.capabilities.map(item=><article key={item.id}><i className={item.reliability.status}/><span><b>{item.name}</b><small>{item.reliability.message}</small></span><em>{label[item.reliability.status]}</em></article>)}</div><div className="system-safety"><span>当前模型</span><b>{data?`${data.current_model.provider} · ${data.current_model.model}`:"读取中"}</b><span>研究信号</span><b>{data?.status.allow_signal?"允许":"按数据状态决定"}</b><span>真实交易</span><b>始终禁止</b></div><footer><button onClick={()=>void load()} disabled={loading}><RefreshCw className={loading?"spin":""}/>重新检查</button><small>具体行情、新闻和社媒的新鲜度在使用时单独显示。</small></footer></section>}</aside>;
}
