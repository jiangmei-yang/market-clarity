"use client";

import Link from "next/link";
import { ArrowRight, BookOpenCheck, Bot, CheckCircle2, Clock3, Database, ExternalLink, FileQuestion, GitBranch, LoaderCircle, Search, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Status = "available" | "beta" | "planned" | "disabled" | "unavailable";
type Capability = { capability_id:string; name:string; category:string; description:string; status:Status; route:string|null; outputs:string[]; limitations:string[]; last_updated:string; version:string };
type IndexState = { status?:string; indexed_count?:number; available_count?:number; beta_count?:number; unavailable_count?:number; last_success_at?:string };
type Answer = { answer:string; sources:Array<Pick<Capability,"capability_id"|"name"|"category"|"status"|"route"|"version"|"last_updated"> & {why_relevant:string}>; note:string };

const STATUS:Record<Status,string>={available:"已上线",beta:"测试中",planned:"计划中",disabled:"已停用",unavailable:"当前不可用"};
const CATEGORY:Record<string,string>={page:"页面",tool:"工具",module:"模块",workflow:"流程",provider:"模型",data_source:"数据源",engine:"研究引擎"};
const QUESTIONS=["目前已经完成了哪些核心功能？","没有 API Key 时还能使用什么？","为什么它不只是 ChatGPT 加股票数据？","哪些能力仍在测试中？"];
const FEATURED=["workflow_decision_layer","tool_analyze_social_content","tool_run_pretrade_check","tool_get_portfolio_risk","page_etf","page_trade","page_quant","workflow_no_key_fallback","workflow_pitch_demo"];

const fmt=(value?:string)=>value?new Intl.DateTimeFormat("zh-CN",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(value)):"暂无";

export function CapabilityGuide(){
  const [items,setItems]=useState<Capability[]>([]);const [index,setIndex]=useState<IndexState>({});const [loading,setLoading]=useState(true);const [query,setQuery]=useState(QUESTIONS[0]);const [asking,setAsking]=useState(false);const [answer,setAnswer]=useState<Answer|null>(null);const [error,setError]=useState("");
  useEffect(()=>{fetch("/capabilities").then(async response=>{if(!response.ok)throw new Error("能力清单读取失败");return response.json()}).then(data=>{setItems(data.items??[]);setIndex(data.index??{})}).catch(reason=>setError(reason instanceof Error?reason.message:"能力清单读取失败")).finally(()=>setLoading(false));},[]);
  const featured=useMemo(()=>FEATURED.map(id=>items.find(item=>item.capability_id===id)).filter((item):item is Capability=>Boolean(item)),[items]);
  const visible=featured.length?featured:items.filter(item=>item.category!=="api").slice(0,9);
  async function ask(event?:FormEvent){event?.preventDefault();if(!query.trim())return;setAsking(true);setError("");try{const response=await fetch("/product-guide/ask",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({query})});const data=await response.json();if(!response.ok)throw new Error(data.error??"暂时无法查询");setAnswer(data);}catch(reason){setError(reason instanceof Error?reason.message:"暂时无法查询");}finally{setAsking(false)}}
  return <div className="capability-guide">
    <section className="capability-overview" data-guide="capability-overview">
      <div className="capability-positioning"><span>产品定位</span><h2>把“看见信息”变成“知道下一步该核对什么”</h2><p>安心看股不替用户选股票。它把行情、公告与社交说法放进同一条可追溯流程，再结合个人持仓和规则，帮助用户在行动前发现遗漏。</p><div><Link href="/demo">90 秒演示<ArrowRight /></Link><Link href="/opportunity" className="secondary">检查一条消息</Link></div></div>
      <div className="capability-live"><header><span><i />能力索引</span><strong>{index.status==="healthy"?"同步正常":"正在核对"}</strong></header><div><article><strong>{index.indexed_count??"—"}</strong><span>已注册能力</span></article><article><strong>{items.filter(item=>item.status==="available").length||"—"}</strong><span>当前可用</span></article><article><strong>{items.filter(item=>item.status==="beta").length||"—"}</strong><span>测试中</span></article></div><footer><Database />最近同步 {fmt(index.last_success_at)}</footer></div>
    </section>

    <section className="capability-flow" id="capability-flow"><header><span>核心闭环</span><strong>Information → Decision</strong></header>{[
      [Database,"读取公开信息","行情、公告、财务与用户提供内容"],[Search,"拆分证据","区分事实、推断和未核实说法"],[ShieldCheck,"计算个人影响","持仓集中度、损失情景和规则冲突"],[GitBranch,"保留决定","用户确认、修改或稍后复核"]
    ].map(([Icon,title,detail],i)=><article key={String(title)}><span>{i+1}</span><Icon /><div><strong>{title as string}</strong><small>{detail as string}</small></div></article>)}</section>

    <section className="capability-section" id="capability-matrix" data-guide="capability-matrix"><header><div><span>当前交付</span><h3>能力不是一张静态路线图</h3><p>下列状态来自平台注册中心。新增、变更或停用能力后，知识索引会随版本更新。</p></div><Link href="/workspace">查看模块化工作台<ExternalLink /></Link></header>
      {loading?<div className="capability-loading"><LoaderCircle />正在读取能力注册中心…</div>:<div className="capability-grid">{visible.map(item=><article key={item.capability_id}><header><span className={`capability-status ${item.status}`}>{STATUS[item.status]}</span><small>{CATEGORY[item.category]??item.category}</small></header><h4>{item.name}</h4><p>{item.description}</p><footer><span>v{item.version}</span>{item.route?<Link href={item.route}>打开<ArrowRight /></Link>:<span>{fmt(item.last_updated)}</span>}</footer></article>)}</div>}
    </section>

    <section className="capability-rag" id="capability-ask" data-guide="capability-ask"><div className="capability-rag-copy"><span><Sparkles />能力知识库</span><h3>查询平台能做什么</h3><p>回答会附上功能状态、使用入口、版本和更新时间。即使未连接外部模型，也可以查询平台注册的真实能力。</p><div>{QUESTIONS.map(item=><button key={item} onClick={()=>setQuery(item)}>{item}</button>)}</div></div><div className="capability-rag-console"><form onSubmit={ask}><label htmlFor="capability-question">问一个关于产品的问题</label><div><input id="capability-question" value={query} onChange={event=>setQuery(event.target.value)} placeholder="例如：没有 API Key 时可以使用哪些功能？"/><button disabled={asking}>{asking?<LoaderCircle />:<Bot />}{asking?"检索中":"查询"}</button></div></form>{answer?<div className="capability-answer"><header><BookOpenCheck /><strong>基于当前能力索引</strong></header><p>{answer.answer}</p><div className="capability-sources">{answer.sources.slice(0,5).map(source=><article key={source.capability_id}><span className={`capability-status ${source.status}`}>{STATUS[source.status]}</span><div><strong>{source.name}</strong><small>{CATEGORY[source.category]??source.category} · v{source.version} · {fmt(source.last_updated)}</small></div>{source.route&&<Link href={source.route} aria-label={`打开${source.name}`}><ExternalLink /></Link>}</article>)}</div><footer>{answer.note}</footer></div>:<div className="capability-answer-empty"><FileQuestion /><span>查询后，这里会显示回答与可点击来源。</span></div>}</div></section>

    <section className="capability-pitch"><article><span><CheckCircle2 />当前可靠能力</span><ul><li>研究、个人持仓和行动前检查可以连成一条流程</li><li>风险金额与交易归因由规则计算，不由模型编造</li><li>没有外部 API Key 时仍保留规则版核心路径</li><li>所有工作台修改先预览、确认并保留版本</li></ul></article><article><span><Clock3 />持续完善范围</span><ul><li>扩大真实数据源的稳定性与覆盖范围</li><li>完善持续复核、提醒与长期记录体验</li><li>验证不同使用频率下最有价值的提醒方式</li><li>继续统一英文体验与跨页面交互细节</li></ul></article><aside><TriangleAlert /><div><strong>能力状态不等于投资结论</strong><p>“已上线”只表示功能可以使用，不代表相关数据能够预测收益，也不构成买卖建议。</p></div></aside></section>
    {error&&<p className="capability-error">{error}</p>}
  </div>
}
