"use client";

import Link from "next/link";
import { ArrowUpRight, FlaskConical, Languages, Library, ShieldCheck } from "lucide-react";

import { pick, useI18n } from "../i18n";

export function StrategyLabShell({ children }: { children: React.ReactNode }) {
  const { isEnglish, locale, setLocale } = useI18n();
  return <div className="strategy-lab-app">
    <a className="skip-link" href="#strategy-lab-main">{pick(isEnglish, "跳到研究室", "Skip to the lab")}</a>
    <header className="strategy-lab-nav">
      <Link href="/" className="strategy-lab-brand" aria-label={pick(isEnglish, "Market Clarity 平台首页", "Market Clarity home")}>
        <span><FlaskConical /></span><strong>Market Clarity</strong><small>STRATEGY LAB</small>
      </Link>
      <nav aria-label={pick(isEnglish, "策略研究导航", "Strategy research navigation")}>
        <Link href="/workspace"><ArrowUpRight />{pick(isEnglish, "AI 工作台", "AI workspace")}</Link>
        <Link href="/quant/factors">{pick(isEnglish, "策略研究室", "Strategy Lab")}</Link>
        <Link href="/quant/factors" aria-current="page"><FlaskConical />{pick(isEnglish, "新研究", "New study")}</Link>
        <a href="#saved-research"><Library />{pick(isEnglish, "我的方法", "Saved methods")}</a>
        <Link href="/pricing">{pick(isEnglish, "定价", "Pricing")}</Link>
      </nav>
      <div className="strategy-lab-nav-meta">
        <span><i />{pick(isEnglish, "研究模式", "Research mode")}</span>
        <div role="group" aria-label={pick(isEnglish, "界面语言", "Interface language")}><Languages /><button aria-pressed={locale === "zh-CN"} onClick={() => setLocale("zh-CN")}>中</button><button aria-pressed={locale === "en"} onClick={() => setLocale("en")}>EN</button></div>
      </div>
    </header>
    <main id="strategy-lab-main" className="strategy-lab-workspace">
      <aside className="strategy-lab-boundary"><ShieldCheck /><span><strong>{pick(isEnglish, "只做历史研究", "Historical research only")}</strong><small>{pick(isEnglish, "不荐股 · 不下单 · 不承诺未来收益", "No stock picks · no orders · no promises")}</small></span></aside>
      {children}
    </main>
  </div>;
}
