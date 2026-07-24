"use client";

import { Eye, ShieldCheck } from "lucide-react";
import type { DashboardWorkspace } from "@/app/lib/personal-workbench";
import { MODULE_LABELS } from "@/app/lib/personal-workbench";
import { CloneSharedWorkspaceButton } from "./clone-shared-workspace-button";
import { pick, useI18n } from "@/app/i18n";

const MODULE_LABELS_EN:Partial<Record<keyof typeof MODULE_LABELS,string>> = {
  portfolio_overview:"Portfolio overview", portfolio_risk:"Portfolio risk", holdings_table:"Holdings table",
  allocation_chart:"Allocation", concentration_gauge:"Concentration", industry_exposure:"Sector exposure",
  drawdown_chart:"Drawdown", volatility_matrix:"Volatility matrix", etf_overlap:"ETF overlap",
  etf_holdings:"ETF holdings", etf_risk:"ETF risk", financial_quality:"Financial quality",
  valuation:"Valuation", technical_chart:"Technical chart", event_timeline:"Event timeline",
  social_topics:"Social topics", social_sentiment:"Social sentiment", social_risk:"Social-content risk",
  trade_review:"Trade review", behavior_report:"Behavior report", decision_history:"Decision history",
  pretrade_checklist:"Pre-trade checklist", investment_goal:"Investment goal", risk_tolerance:"Risk limits",
  simulation_portfolio:"Paper portfolio", term_explainer:"Metric explainer", weekly_summary:"Weekly summary",
  quant_strategy:"Quant strategy", quant_backtest:"Backtest", quant_signals:"Research signals",
  quant_schedule:"Run schedule", quant_records:"Run history",
};

export function SharedWorkspaceView({workspace,sharedAt,token}:{workspace:DashboardWorkspace;sharedAt:string;token:string}) {
  const {isEnglish,locale}=useI18n();
  const label=(type:keyof typeof MODULE_LABELS)=>isEnglish?(MODULE_LABELS_EN[type]??String(type).replaceAll("_"," ")):MODULE_LABELS[type];
  return <main className="shared-dashboard-page">
    <header><div><span><Eye/>{pick(isEnglish,"只读工作台","Read-only workspace")}</span><h1>{workspace.name}</h1><p>{workspace.description||pick(isEnglish,"由安心看股用户分享的工作台配置。","A workspace configuration shared by a Market Clarity user.")}</p></div><CloneSharedWorkspaceButton token={token}/></header>
    <section className="shared-dashboard-meta"><span>{pick(isEnglish,"分享于 ","Shared ")}{new Date(sharedAt).toLocaleString(locale)}</span><span>{pick(isEnglish,`${workspace.modules.filter(item=>item.visible).length} 个模块`,`${workspace.modules.filter(item=>item.visible).length} modules`)}</span><span>{pick(isEnglish,`${workspace.theme.mode==="dark"?"深色":"浅色"}主题`,`${workspace.theme.mode==="dark"?"Dark":"Light"} theme`)}</span></section>
    <section className="shared-dashboard-grid">{workspace.modules.filter(item=>item.visible).sort((a,b)=>a.order-b.order).map(item=><article key={item.instanceId}><span>{label(item.type)}</span><strong>{isEnglish&&(!item.title||item.title===MODULE_LABELS[item.type])?label(item.type):item.title||label(item.type)}</strong><small>{pick(isEnglish,"数据源：","Data source: ")}{item.dataSourceId}</small><small>{pick(isEnglish,"刷新：","Refresh: ")}{item.refreshPolicy.mode==="manual"?pick(isEnglish,"手动","Manual"):item.refreshPolicy.interval??item.refreshPolicy.mode}</small></article>)}</section>
    <footer><ShieldCheck/>{pick(isEnglish,"分享内容只包含布局、模块和显示设置，不包含持仓、交易记录、API Key 或 AI 对话。","Shared content includes layout, modules and display settings only—never holdings, trade records, API keys or AI conversations.")}</footer>
  </main>;
}
