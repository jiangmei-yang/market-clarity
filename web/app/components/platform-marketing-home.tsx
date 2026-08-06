"use client";

import Link from "next/link";
import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ArrowRight, BarChart3, Check, CircleGauge, Database, FlaskConical, Layers3, MessageSquareText, ShieldCheck, Sparkles } from "lucide-react";
import { PlatformSiteNav } from "./platform-site-nav";

if(typeof window!=="undefined")gsap.registerPlugin(ScrollTrigger);

export function PlatformMarketingHome(){
  const root=useRef<HTMLDivElement>(null);
  useGSAP(()=>{
    if(window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;
    gsap.from("[data-hero-copy] > *",{y:24,opacity:0,duration:.8,stagger:.09,ease:"power3.out"});
    gsap.from("[data-product-frame]",{y:40,scale:.94,opacity:0,duration:1,ease:"power3.out",delay:.18});
    gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach(item=>gsap.from(item,{scrollTrigger:{trigger:item,start:"top 84%"},y:34,opacity:0,duration:.75,ease:"power3.out"}));
    const chapters=gsap.utils.toArray<HTMLElement>("[data-chapter]");
    if(window.matchMedia("(min-width: 980px)").matches&&chapters.length){
      gsap.to("[data-story-track]",{yPercent:-48,ease:"none",scrollTrigger:{trigger:"[data-story]",start:"top top",end:"+=1150",scrub:.8,pin:true,anticipatePin:1}});
    }
  },{scope:root});
  return <div ref={root} className="platform-site">
    <PlatformSiteNav active="home"/>
    <main>
      <section className="platform-hero">
        <div className="platform-hero-copy" data-hero-copy>
          <h1>把投资想法，变成能反复验证的方法。</h1>
          <p>用大白话组织研究、生成可确认规则，再按统一成本与样本标准比较。无需代码，也不会替你下单。</p>
          <div className="platform-hero-actions"><Link href="/workspace">打开 AI 工作台 <ArrowRight/></Link><Link href="/quant/factors">进入策略研究室</Link></div>
          <small><ShieldCheck/>只做研究与决策验证 · 不荐股 · 不连接券商</small>
        </div>
        <div className="platform-product-stage" data-product-frame aria-label="Market Clarity 产品界面示意">
          <div className="platform-window-bar"><i/><i/><i/><span>AI 策略研究室</span><b>研究模式</b></div>
          <div className="platform-prompt"><Sparkles/><span><small>研究指令</small><strong>找一个历史回撤更小、调整不要太频繁的方法。</strong></span><button type="button" disabled aria-label="产品预览中的发送按钮，不可操作"><ArrowRight/></button></div>
          <div className="platform-preview-grid">
            <div className="platform-rule-stack"><span>系统听懂的是</span>{[["股票范围","跨行业 A 股样本"],["历史特征","趋势 + 低波动"],["调整节奏","每月一次"]].map(([label,value])=><article key={label}><Check/><div><small>{label}</small><strong>{value}</strong></div></article>)}</div>
            <div className="platform-chart-card"><header><span>候选 vs 传统参照</span><small>同样本 · 同成本</small></header><svg viewBox="0 0 560 260" role="img" aria-label="候选方法和传统参照的历史净值示意图"><g className="chart-grid"><path d="M44 30V220M44 220H540M44 170H540M44 120H540M44 70H540"/></g><path className="chart-reference" d="M44 202C100 188 120 180 168 183S244 148 282 154S350 132 392 138S466 105 540 114"/><path className="chart-candidate" d="M44 202C90 194 126 165 168 174S238 128 282 139S348 98 392 112S466 68 540 77"/><g className="chart-labels"><text x="44" y="242">研究区</text><text x="244" y="242">验证区</text><text x="436" y="242">锁定检查</text></g></svg><footer><span><i className="candidate"/>候选方法</span><span><i/>传统动量</span></footer></div>
          </div>
          <div className="platform-run-strip"><span><strong>1000</strong><small>组已扫描</small></span><ArrowRight/><span><strong>2</strong><small>个最后检查</small></span><ArrowRight/><span><strong>逐个展示</strong><small>不取平均值</small></span></div>
        </div>
      </section>

      <section className="platform-proof" aria-label="产品原则"><span>一句话开始</span><span>规则先确认</span><span>统一历史比较</span><span>保存为研究方法</span></section>

      <section className="platform-bento" data-reveal>
        <header><h2>一个平台，覆盖从问题到方法的完整过程。</h2><p>首页不再只属于某个模块。每条路径都回到同一个工作台和同一套研究边界。</p></header>
        <div className="platform-bento-grid">
          <Link href="/workspace" className="platform-bento-card workspace-card"><span><MessageSquareText/>AI 工作台</span><h3>先说你要完成什么，系统帮你组织工具和步骤。</h3><p>适合还不知道该从哪个页面开始的用户。所有会产生持久影响的修改都会先预览、再确认。</p><div className="workspace-mini"><i/><i/><i/><b>研究当前标的</b><b>核实一条消息</b><b>创建策略研究</b></div><em>进入工作台 <ArrowRight/></em></Link>
          <Link href="/quant/factors" className="platform-bento-card lab-card"><span><FlaskConical/>策略研究室</span><h3>把大白话变成可解释策略。</h3><p>批量比较有限候选，统一检验成本、稳定性和最后一段历史。</p><div className="mini-funnel"><b>想法</b><i/><b>规则</b><i/><b>结果</b></div><em>开始研究 <ArrowRight/></em></Link>
          <Link href="/analysis?view=research" className="platform-bento-card evidence-card"><span><Database/>研究与证据</span><h3>把价格、正式披露和数据状态放在一起看。</h3><p>没有找到证据不会被写成已经证伪；演示、缓存和真实数据保持可见区分。</p><div><BarChart3/><Layers3/><CircleGauge/></div><em>查看研究工具 <ArrowRight/></em></Link>
        </div>
      </section>

      <section className="platform-story" data-story>
        <div className="platform-story-copy"><span>策略研究室</span><h2>不是让 AI 猜答案，而是让过程更容易看懂。</h2><p>AI 负责理解、组合和解释；收益、回撤、成本、换手和稳定性始终由确定性引擎计算。</p><Link href="/quant/factors">亲自跑一次 <ArrowRight/></Link></div>
        <div className="platform-story-viewport"><div className="platform-story-track" data-story-track>{[
          {title:"说出想法或目标",body:"“走势强，但波动不要太大”已经足够开始。",index:"01",Icon:MessageSquareText},
          {title:"确认系统理解",body:"股票范围、历史特征、选择方式和调整节奏都可见。",index:"02",Icon:Layers3},
          {title:"统一比较和淘汰",body:"传统方法和受控候选使用相同样本、日期、成本与调仓规则。",index:"03",Icon:BarChart3},
          {title:"保存为研究方法",body:"保存规则、版本、数据截止和已知限制，而不是一条买卖信号。",index:"04",Icon:ShieldCheck},
        ].map(({title,body,index,Icon})=><article key={index} data-chapter><span>{index}</span><Icon/><h3>{title}</h3><p>{body}</p></article>)}</div></div>
      </section>

      <section className="platform-pricing-teaser" data-reveal><div><h2>先免费验证价值，再决定是否加入研究版测试。</h2><p>当前 MVP 不接支付。¥19/月仅为课程中的行为定价实验，加入候补不会扣费。</p></div><Link href="/pricing">查看定价说明 <ArrowRight/></Link></section>
    </main>
    <footer className="platform-footer"><div><strong>Market Clarity</strong><span>研究清楚，再做决定。</span></div><nav><Link href="/workspace">AI 工作台</Link><Link href="/quant/factors">策略研究室</Link><Link href="/pricing">定价</Link></nav><p>历史研究不代表未来表现。本平台不提供个股推荐或交易执行。</p></footer>
  </div>;
}
