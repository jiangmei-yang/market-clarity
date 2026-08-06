import Link from "next/link";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { PlatformSiteNav } from "./platform-site-nav";

export function PlatformPricing(){
  return <div className="platform-site platform-pricing-page"><PlatformSiteNav active="pricing"/><main>
    <section className="pricing-hero"><h1>先研究清楚，再决定是否升级。</h1><p>当前课堂 MVP 不接支付。下面的 ¥19/月是早期行为定价实验，不是已经上线的订阅承诺。</p></section>
    <section className="pricing-grid" aria-label="定价方案">
      <article><header><span>个人用户</span><h2>研究体验版</h2><strong>¥0<small>/ MVP 体验期</small></strong></header><ul><li><Check/>用大白话生成可确认策略</li><li><Check/>统一传统参照与历史回测</li><li><Check/>保存、复制和重新检验研究方法</li><li><Check/>AI 不可用时自动降级为规则模式</li></ul><Link href="/quant/factors">免费开始研究 <ArrowRight/></Link></article>
	    <article className="pricing-featured"><header><span>早期付费测试</span><h2>研究版候补</h2><strong>¥19<small>/ 月 · 定价实验</small></strong></header><ul><li><Check/>包含体验版全部研究能力</li><li><Check/>每周研究与决策复核工作流</li><li><Check/>优先参与新功能测试和访谈</li><li><Check/>加入候补不扣费，可随时退出</li></ul><Link href="/quant/factors">查看 14 天测试说明 <ArrowRight/></Link></article>
    </section>
    <aside className="pricing-boundary"><ShieldCheck/><div><strong>这不是自动交易订阅</strong><p>平台不会连接券商、自动调仓或提供确定性收益承诺。价格页只验证用户是否愿意为研究与复核流程付费。</p></div></aside>
    <section className="pricing-faq"><h2>常见问题</h2><details><summary>免费版会限制回测结果吗？</summary><p>MVP 体验期使用同一确定性引擎和研究边界，不会为了付费展示不同计算结果。</p></details><details><summary>现在会扣款吗？</summary><p>不会。当前没有支付连接；只有主动加入候补才记为行为证据。</p></details><details><summary>研究版会自动交易吗？</summary><p>不会。研究版仍保持 research_only，保存的是可复用研究方法，而不是订单或买卖信号。</p></details></section>
  </main></div>;
}
