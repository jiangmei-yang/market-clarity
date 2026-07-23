"use client";

import { AppNavigation } from "./app-navigation";
import { pick, useI18n } from "../i18n";

type ProductToolShellProps = {
  active: "etf" | "trade" | "quant" | "agent" | "evaluation" | "demo" | "pilot" | "guide";
  title: string;
  description: string;
  status: string;
  children: React.ReactNode;
};

export function ProductToolShell({ active, title, description, status, children }: ProductToolShellProps) {
  const { isEnglish } = useI18n();
  const activePath = active === "etf" ? "/etf-tool" : active === "trade" ? "/trade-tool" : active === "quant" ? "/quant" : active === "agent" ? "/agent" : active === "demo" ? "/demo" : active === "guide" ? "/features" : "/";
  const english: Partial<Record<ProductToolShellProps["active"], [string, string, string]>> = {
    etf: ["ETF diagnosis", "See underlying holdings, overlap and concentration before changing your portfolio.", "Analysis only · no trade execution"],
    trade: ["Trade review", "Separate position, timing, cost and behavior effects from the outcome.", "Deterministic calculations first"],
    quant: ["Quant research", "Describe a low-frequency idea, validate the rules, then backtest or simulate.", "Research and simulation only"],
    agent: ["Task agent", "Describe the outcome. Review the plan, sources and actions that need confirmation.", "Authorized tools only"],
    demo: ["90-second product demo", "Use a clearly labelled sample snapshot to complete a pre-trade review.", "No trade execution"],
    guide: ["Product guide", "See what is available, where to find it and what each capability cannot do.", "Capability status is kept current"],
    evaluation: ["Quality evaluation", "Inspect data coverage, model behavior and product validation evidence.", "Evidence before claims"],
    pilot: ["Ongoing review pilot", "Test whether recurring decision-change and risk reviews are useful.", "Joining does not charge you"],
  };
  const copy = english[active];
  return (
    <div className="native-tool-shell">
      <a className="skip-link" href="#tool-main">{pick(isEnglish, "跳到主要内容", "Skip to main content")}</a>
      <AppNavigation activePath={activePath} />
      <header className="native-tool-header" data-guide="page-header">
        <div><h1>{isEnglish&&copy?copy[0]:title}</h1><p>{isEnglish&&copy?copy[1]:description}</p></div>
        <span className="native-data-status"><i />{isEnglish&&copy?copy[2]:status}</span>
      </header>
      <main id="tool-main" className="native-tool-main">{children}</main>
    </div>
  );
}
