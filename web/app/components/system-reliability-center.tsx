"use client";

import {useEffect,useState} from "react";
import {Activity,ChevronDown,RefreshCw,ShieldCheck,TriangleAlert,X} from "lucide-react";
import type {ReliabilityState} from "@/app/lib/failure-control";
import {pick,useI18n} from "../i18n";

type HealthPayload={status:ReliabilityState;checked_at:string;current_model:{provider:string;model:string;reliability:ReliabilityState};capabilities:Array<{id:string;name:string;reliability:ReliabilityState}>};
const label:Record<ReliabilityState["status"],string>={healthy:"正常",degraded:"降级",stale:"已过期",unavailable:"不可用",blocked:"已阻断",failed:"失败",cancelled:"已取消",retrying:"重试中"};

export function SystemReliabilityCenter(){
  const {isEnglish,locale}=useI18n();
  const englishLabel:Record<ReliabilityState["status"],string>={healthy:"Healthy",degraded:"Degraded",stale:"Stale",unavailable:"Unavailable",blocked:"Blocked",failed:"Failed",cancelled:"Cancelled",retrying:"Retrying"};
  const [data,setData]=useState<HealthPayload>();const [open,setOpen]=useState(false);const [loading,setLoading]=useState(false);
  const load=async()=>{setLoading(true);try{const response=await fetch("/api/system/health",{cache:"no-store"});if(response.ok)setData(await response.json() as HealthPayload);}finally{setLoading(false);}};
  useEffect(()=>{let active=true;void fetch("/api/system/health",{cache:"no-store"}).then(response=>response.ok?response.json() as Promise<HealthPayload>:undefined).then(payload=>{if(active&&payload)setData(payload)});return()=>{active=false};},[]);const status=data?.status.status;
  return <aside className={`system-reliability ${open?"open":""}`} aria-label={pick(isEnglish,"系统运行状态","System health")}><button className={`system-reliability-trigger ${status??"checking"}`} onClick={()=>setOpen(value=>!value)} aria-expanded={open}>{status===undefined?<Activity/>:status==="healthy"?<ShieldCheck/>:<TriangleAlert/>}<span>{pick(isEnglish,"系统状态","System")}</span><b>{status?(isEnglish?englishLabel[status]:label[status]):pick(isEnglish,"检查中","Checking")}</b><ChevronDown/></button>{open&&<section><header><div><Activity/><span><b>{pick(isEnglish,"运行与降级状态","Runtime and degradation")}</b><small>{data?`${pick(isEnglish,"检查于","Checked")} ${new Date(data.checked_at).toLocaleTimeString(locale)}`:pick(isEnglish,"正在读取，不代表故障","Loading; this does not indicate a failure")}</small></span></div><button aria-label={pick(isEnglish,"关闭状态详情","Close status details")} onClick={()=>setOpen(false)}><X/></button></header><div className="system-capability-list">{data?.capabilities.map(item=><article key={item.id}><i className={item.reliability.status}/><span><b>{item.name}</b><small>{item.reliability.message}</small></span><em>{isEnglish?englishLabel[item.reliability.status]:label[item.reliability.status]}</em></article>)}</div><div className="system-safety"><span>{pick(isEnglish,"当前模型","Current model")}</span><b>{data?`${data.current_model.provider} · ${data.current_model.model}`:pick(isEnglish,"读取中","Loading")}</b><span>{pick(isEnglish,"研究信号","Research signals")}</span><b>{data?.status.allow_signal?pick(isEnglish,"允许","Allowed"):pick(isEnglish,"按数据状态决定","Depends on data status")}</b><span>{pick(isEnglish,"真实交易","Live trading")}</span><b>{pick(isEnglish,"始终禁止","Always disabled")}</b></div><footer><button onClick={()=>void load()} disabled={loading}><RefreshCw className={loading?"spin":""}/>{pick(isEnglish,"重新检查","Check again")}</button><small>{pick(isEnglish,"具体行情、新闻和社媒的新鲜度在使用时单独显示。","Freshness for market, news and social data is shown where each source is used.")}</small></footer></section>}</aside>;
}
