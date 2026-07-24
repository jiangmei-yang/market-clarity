"use client";

import Link from "next/link";
import {pick,useI18n} from "../i18n";

type ToolFrameProps = {
  title: string;
  description: string;
  path: "/etf-tool" | "/trade-tool";
};

export function ToolFrame({ title, description, path }: ToolFrameProps) {
  const{isEnglish}=useI18n();
  const backend = (process.env.ANXIN_API_URL || "http://127.0.0.1:8001").replace(/\/$/, "");
  const source = `${backend}${path}`;

  return (
    <main className="integrated-tool-page">
      <header className="integrated-tool-header">
        <div>
          <Link href="/">← {pick(isEnglish,"返回安心看股","Back to Market Clarity")}</Link>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <span>{pick(isEnglish,"分析与复盘工具 · 不构成投资建议","Analysis and review tool · not investment advice")}</span>
      </header>
      <section className="integrated-tool-frame-shell">
        <iframe title={title} src={source} allow="clipboard-write" />
        <noscript>{pick(isEnglish,"请启用 JavaScript 后使用该工具。","Enable JavaScript to use this tool.")}</noscript>
      </section>
      <footer className="integrated-tool-footer">
        {pick(isEnglish,"本工具仅用于持仓分析和交易复盘参考，不构成投资建议、收益承诺或买卖建议。","This tool is for portfolio analysis and trade review only. It is not investment advice, a return promise or a trading recommendation.")}
      </footer>
    </main>
  );
}
