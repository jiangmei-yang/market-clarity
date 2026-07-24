"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BriefcaseBusiness, Check,
  ChevronDown, CircleAlert, FileSearch, Gauge,
  MessageSquareWarning, Plus, Save, Settings2, ShieldCheck,
  Sparkles, Undo2, RotateCcw, X, Palette, Eye, EyeOff,
  Cpu, KeyRound, PlugZap, Trash2, Maximize2, Minimize2, Search,
} from "lucide-react";
import { AppNavigation } from "./app-navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_PROFILE, DEFAULT_THEME, MODULE_LABELS, THEME_LABELS, analyzeSocialContent, createWorkspace,
  parseProfile, precheckTrade, previewWorkspaceChange,
  type InvestorProfile, type InvestmentRule, type ProfileDraft,
  type ModuleType, type PrecheckResult, type SocialAnalysis, type Workspace, type WorkspaceTheme,
} from "../lib/personal-workbench";
import type { AIProviderProfile } from "../lib/ai-provider-catalog";
import { normalizeDashboardWorkspace } from "../lib/dashboard-system";
import { planHomeWorkspaceLayout, type HomeSectionPlan } from "../lib/home-workspace-layout";
import { DashboardEditor } from "./dashboard-editor";
import { pick, useI18n } from "../i18n";

type Surface = "home" | "profile" | "opportunity" | "workspace" | "portfolio" | "ai-settings";
type Holding = { name: string; value: number; industry?: string };
type MarketOverview = { status:"loading"|"healthy"|"degraded"|"stale"|"unavailable"; source?:string; fetched_at?:string; message?:string; items:Array<{code:string;name:string;value:number;change:number;updated_at?:string}> };
type StockPoint = { open?:number; high?:number; low?:number; close:number; date:string; volume:number };
type StockSearchItem = { code:string; name:string; industry?:string };
type StockFocus = { status:"loading"|"live"|"partial"|"cached"|"unavailable"; name?:string; provider?:string; dataTimestamp?:string; price?:number; change?:number; points:StockPoint[]; benchmark?:StockPoint[]; event?:{date:string;title:string;source:string;url?:string}; message?:string };
type Snapshot = {
  rules?: unknown; holdings?: Record<string, Holding>; decisionRecords?: Array<{ stock?: { name?: string }; result?: string; reviewedAt?: string; durationSeconds?: number; feedback?: { satisfaction?: number; riskUnderstood?: boolean; repeatIntent?: boolean; paidIntent?: boolean } }>;
  investorProfile?: InvestorProfile; investmentRules?: InvestmentRule[]; workspaces?: Workspace[]; activeWorkspaceId?: string;
  opportunityChecks?: Array<{ checkedAt: string; text: string; level: string; score: number }>;
  workspaceVersions?: Array<{ configId: string; workspace: Workspace; createdAt: string }>;
  workspaceAudit?: Array<{ commandId: string; intent: string; proposedChanges: string[]; status: "applied" | "cancelled"; createdAt: string; confirmedAt?: string }>;
  aiProviders?: AIProviderProfile[];
  [key: string]: unknown;
};

const DISCLAIMER = "本工具仅用于投资信息、持仓分析和交易复盘参考，不构成任何投资建议、收益承诺或买卖建议。";
const percent = (value: number) => `${(value * 100).toFixed(value * 100 % 1 ? 1 : 0)}%`;
const currency = (value: number) => new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 }).format(value);
const workspaceDisplayName = (name: string, isEnglish: boolean) => {
  if (!isEnglish) return name;
  const knownNames: Record<string, string> = {
    "长期投资工作台": "Long-term investing",
    "长期基本面": "Long-term fundamentals",
    "新手工作台": "Beginner workspace",
    "ETF 工作台": "ETF workspace",
    "交易复盘工作台": "Trade review",
    "风险控制工作台": "Risk control",
  };
  return knownNames[name] ?? name;
};
const aiProviderDisplayName = (name: string | undefined, isEnglish: boolean) => {
  if (!name) return pick(isEnglish, "未连接", "Not connected");
  if (!isEnglish) return name;
  return name.startsWith("我的 ") ? `My ${name.slice(3)}` : name === "本地规则模式" ? "Local rule mode" : name;
};
const moduleDisplayName = (type:ModuleType,title:string|undefined,isEnglish:boolean) => {
  if (!isEnglish) return title ?? MODULE_LABELS[type];
  const labels:Partial<Record<ModuleType,string>> = {
    portfolio_overview:"Portfolio overview",portfolio_risk:"Portfolio risk",watchlist:"Watchlist",etf_overlap:"ETF overlap",sector_exposure:"Sector exposure",
    financial_quality:"Financial quality",fundamental_verification:"Fundamental verification",valuation:"Valuation",technical_chart:"Technical chart",
    technical_indicators:"Technical indicators",event_timeline:"Event timeline",social_topics:"Social topics",social_heat:"Topic momentum",
    social_sentiment:"Sentiment distribution",social_risk:"Social-content risk",opportunity_check:"Opportunity check",trade_review:"Trade review",
    weekly_digest:"Weekly digest",recent_alerts:"Recent alerts",ai_summary:"AI summary",investment_goal:"Investment goal",risk_tolerance:"Risk boundaries",
    etf_basics:"ETF basics",simulation_portfolio:"Paper portfolio",term_explainer:"Term explainer",pretrade_checklist:"Pre-trade checklist",
    quant_strategy:"Quant strategy",quant_backtest:"Historical simulation",quant_signals:"Research signals",quant_schedule:"Research schedule",quant_records:"Run history",
  };
  return !title || title === MODULE_LABELS[type] ? labels[type] ?? type.replaceAll("_"," ") : title;
};
const knownStockEnglish=(code:string,name:string,industry?:string)=>{
  const names:Record<string,string>={"600519":"Kweichow Moutai","600183":"Shengyi Technology","300750":"CATL","600036":"China Merchants Bank"};
  const sectors:Record<string,string>={消费:"Consumer",电子:"Electronics",新能源:"New energy",银行:"Banking"};
  return {name:names[code]??name,industry:industry?(sectors[industry]??industry):industry};
};
const normalizeWorkspace = (workspace: Workspace): Workspace => normalizeDashboardWorkspace({
  ...workspace, description: workspace.description ?? "按自己的研究流程调整",
  explanationLevel: workspace.explanationLevel ?? "beginner", preferredAssets: workspace.preferredAssets ?? [], preferredSectors: workspace.preferredSectors ?? [],
  alertFrequency: workspace.alertFrequency === ("realtime" as Workspace["alertFrequency"]) ? "event_based" : workspace.alertFrequency,
  theme: workspace.theme ?? DEFAULT_THEME,
  workflow: workspace.workflow ?? ["research", "review_risk", "confirm_next_step"],
  modules: workspace.modules.map((module) => ({ ...module, type: (module.type as string) === "technical_trend" ? "technical_chart" : module.type })),
});

export function PersonalWorkbench({ surface, authenticatedUser, initialAIProviders = [] }: { surface: Surface; authenticatedUser: string; initialAIProviders?: AIProviderProfile[] }) {
  const { isEnglish } = useI18n();
  const [snapshot, setSnapshot] = useState<Snapshot>({});
  const [aiProviders,setAIProviders] = useState<AIProviderProfile[]>(initialAIProviders);
  const [aiPrivacyMode,setAIPrivacyMode]=useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "local">("loading");
  const profile = snapshot.investorProfile;
  const workspaces = snapshot.workspaces?.length ? snapshot.workspaces.map(normalizeWorkspace) : [createWorkspace("长期基本面")];
  const activeWorkspace = workspaces.find((item) => item.id === snapshot.activeWorkspaceId) ?? workspaces[0];

  useEffect(() => {
    let active = true;
    const loadSnapshot = () => fetch("/api/me/snapshot", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("unavailable");
      const payload = await response.json() as { status: string; snapshot?: Snapshot };
      if (!active) return;
      const next = payload.snapshot ?? {};
      if (!next.workspaces) next.workspaces = workspaces;
      setSnapshot(next); setStatus("ready");
    }).catch(() => { if (active) setStatus("local"); });
    void loadSnapshot();
    window.addEventListener("anxin:snapshot-updated", loadSnapshot);
    return () => { active = false; window.removeEventListener("anxin:snapshot-updated", loadSnapshot); };
    // The default workspace is a bootstrap value, not a changing dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(()=>{let active=true;fetch("/api/ai/providers",{cache:"no-store"}).then(async(response)=>{if(!response.ok)throw new Error("unavailable");return response.json() as Promise<{providers?:AIProviderProfile[];privacy_mode?:boolean}>;}).then((payload)=>{if(active&&payload.providers){setAIProviders(payload.providers);setAIPrivacyMode(Boolean(payload.privacy_mode));}}).catch(()=>undefined);return()=>{active=false};},[]);

  const persist = useCallback(async (patch: Partial<Snapshot>) => {
    const next = { ...snapshot, ...patch };
    setSnapshot(next); setStatus("saving");
    try {
      const response = await fetch("/api/me/snapshot", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
      if (!response.ok) throw new Error("save failed");
      setStatus("ready");
    } catch { setStatus("local"); }
  }, [snapshot]);

  return (
    <div className="personal-shell" data-theme={activeWorkspace.theme.themeId} data-font-scale={activeWorkspace.theme.fontScale} data-radius={activeWorkspace.theme.radius} data-motion={activeWorkspace.theme.motion}>
      <a className="skip-link" href="#main-content">{pick(isEnglish, "跳到主要内容", "Skip to main content")}</a>
      <AppNavigation activePath={surface === "home" ? "/" : `/${surface}`} userName={authenticatedUser} syncLabel={status === "saving" ? pick(isEnglish, "正在保存", "Saving") : status === "ready" ? pick(isEnglish, "已同步", "Synced") : status === "loading" ? pick(isEnglish, "正在载入", "Loading") : pick(isEnglish, "仅本机暂存", "Saved on this device")} />

      <main className="personal-main" id="main-content">
        <header className="personal-topbar" data-guide="page-header">
          <div><span>{pick(isEnglish, "当前工作台", "Current workspace")}</span><select aria-label={pick(isEnglish, "切换工作台", "Switch workspace")} value={activeWorkspace.id} onChange={(event) => persist({ activeWorkspaceId: event.target.value, workspaceAudit: [...(snapshot.workspaceAudit ?? []), { commandId: `switch-${Date.now()}`, intent: "switch_workspace", proposedChanges: [`switch:${event.target.value}`], status: "applied" as const, createdAt: new Date().toISOString(), confirmedAt: new Date().toISOString() }].slice(-200) })}>{workspaces.map((item) => <option key={item.id} value={item.id}>{workspaceDisplayName(item.name, isEnglish)}</option>)}</select><span className="personal-theme-label"><Palette />{isEnglish ? activeWorkspace.theme.themeId.replaceAll("_", " ") : THEME_LABELS[activeWorkspace.theme.themeId]}</span></div>
          <div className="personal-top-actions">
            <Link href="/workspace"><Settings2 />{pick(isEnglish, "编辑工作台", "Edit workspace")}</Link>
            <Link href="/ai-settings"><Sparkles />{pick(isEnglish, "模型设置", "AI models")}<Badge variant="outline">{aiProviders.find((item)=>item.isDefault)?.providerId === "mock" ? pick(isEnglish, "规则可用", "Rules available") : aiProviderDisplayName(aiProviders.find((item)=>item.isDefault)?.displayName, isEnglish)}</Badge></Link>
          </div>
        </header>
        {surface === "home" && <HomeSurface snapshot={snapshot} profile={profile} workspace={activeWorkspace} aiProviders={aiProviders} />}
        {surface === "profile" && <ProfileSurface profile={profile} rules={snapshot.investmentRules ?? []} onSave={(draft) => persist({ investorProfile: { ...draft.profile, confirmedAt: new Date().toISOString() }, investmentRules: draft.rules })} />}
        {surface === "opportunity" && <OpportunitySurface profile={profile ?? DEFAULT_PROFILE} holdings={snapshot.holdings ?? {}} onSave={(entry) => persist({ opportunityChecks: [entry, ...(snapshot.opportunityChecks ?? [])].slice(0, 20) })} />}
        {surface === "workspace" && <WorkspaceSurface key={activeWorkspace.id} workspace={activeWorkspace} workspaces={workspaces} />}
        {surface === "portfolio" && <PortfolioSurface holdings={snapshot.holdings ?? {}} profile={profile ?? DEFAULT_PROFILE} />}
        {surface === "ai-settings" && <AISettingsSurface key={aiProviders.map((item)=>`${item.providerId}:${item.isDefault}`).join("|")} initialProviders={aiProviders} initialPrivacyMode={aiPrivacyMode} onProvidersChange={setAIProviders} onPrivacyModeChange={setAIPrivacyMode} />}
        <footer className="personal-disclaimer">{pick(isEnglish, DISCLAIMER, "For investment research, portfolio analysis and trade review only. This is not investment advice, a return promise or a buy/sell recommendation.")}</footer>
      </main>

      <nav className="personal-mobile-nav" aria-label={pick(isEnglish, "移动端导航", "Mobile navigation")}><Link href="/">{pick(isEnglish, "工作台", "Workspace")}</Link><Link href="/opportunity">{pick(isEnglish, "机会检查", "Claim check")}</Link><Link href="/agent">{pick(isEnglish, "任务助手", "Task agent")}</Link><Link href="/profile">{pick(isEnglish, "我的规则", "My rules")}</Link></nav>
    </div>
  );
}

function HomeSurface({ snapshot, profile, workspace }: { snapshot: Snapshot; profile?: InvestorProfile; workspace: Workspace; aiProviders:AIProviderProfile[] }) {
  const { isEnglish } = useI18n();
  const holdings = snapshot.holdings ?? {};
  const total = Object.values(holdings).reduce((sum, item) => sum + Number(item.value || 0), 0);
  const largestEntry = Object.entries(holdings).sort(([, a], [, b]) => b.value - a.value)[0];
  const largest = largestEntry?.[1];
  const largestWeight = largest && total ? largest.value / total : 0;
  const preferredStock: StockSearchItem = largestEntry
    ? { code: largestEntry[0], name: largest.name || largestEntry[0], industry: largest.industry }
    : DEFAULT_HOME_STOCK;
  const layout = planHomeWorkspaceLayout(normalizeDashboardWorkspace(workspace).modules);
  const workspaceSections = layout.sections.filter((section) => section.kind === "workspace");
  return <div className={`personal-content density-${workspace.density}`}>
    <HomeMarketPulse />
    <HomeDecisionBrief snapshot={snapshot} profile={profile} total={total} largest={largest} largestWeight={largestWeight} />
    <section className="home-workspace-heading">
      <div><span>{pick(isEnglish, "当前视图", "Current view")}</span><h1>{workspaceDisplayName(workspace.name, isEnglish)}</h1><p>{pick(isEnglish, "模块顺序、宽度和图表类型来自你的工作台配置。", "Module order, width and visualizations follow your workspace configuration.")}</p></div>
      <Link href="/workspace"><Settings2 />{pick(isEnglish, "调整工作台", "Customize")}</Link>
    </section>
    <div className="home-workspace-canvas" data-workspace-id={workspace.id}>
      {workspaceSections.map((section) => <HomeWorkspaceModule key={section.sectionId} section={section} snapshot={snapshot} profile={profile} holdings={holdings} total={total} preferredStock={preferredStock} largest={largest} largestWeight={largestWeight} />)}
    </div>
    {!workspaceSections.length && <section className="home-workspace-empty"><strong>{pick(isEnglish, "这个工作台还没有显示模块", "This workspace has no visible modules")}</strong><p>{pick(isEnglish, "添加组合、研究或风险模块后，内容会直接出现在这里。", "Add portfolio, research or risk modules and they will appear here.")}</p><Link href="/workspace">{pick(isEnglish, "添加模块", "Add modules")}<ArrowRight /></Link></section>}
    <section className="personal-action-row compact home-secondary-actions" aria-labelledby="today-task" data-guide="home-actions">
      <div><span>{pick(isEnglish, "下一步", "Next step")}</span><h2 id="today-task">{pick(isEnglish, "继续研究或进入决策审查", "Continue research or review a decision")}</h2></div>
      <div className="personal-entry-grid">
        <Link href={`/analysis?view=research&code=${preferredStock.code}`} className="primary"><FileSearch /><span><strong>{pick(isEnglish, "研究当前标的", "Research current stock")}</strong><small>{preferredStock.name} · {pick(isEnglish, "行情、公告、财务", "prices, filings and financials")}</small></span><ArrowRight /></Link>
        <Link href="/opportunity"><MessageSquareWarning /><span><strong>{pick(isEnglish, "核实一条消息", "Check a claim")}</strong><small>{pick(isEnglish, "先分清事实和说法", "Separate evidence from inference")}</small></span><ArrowRight /></Link>
        <Link href="/analysis?view=newDecision"><ShieldCheck /><span><strong>{pick(isEnglish, "检查一笔计划", "Review a plan")}</strong><small>{pick(isEnglish, "结合仓位和个人规则", "Use holdings and personal rules")}</small></span><ArrowRight /></Link>
      </div>
    </section>
  </div>;
}

const PORTFOLIO_MODULES = new Set<ModuleType>(["portfolio_overview", "watchlist"]);
const RISK_MODULES = new Set<ModuleType>(["portfolio_risk", "drawdown_watch", "liquidity_watch", "rule_deviation", "pretrade_checklist"]);
const EXPOSURE_MODULES = new Set<ModuleType>(["sector_exposure", "portfolio_overlap", "etf_overlap"]);
const FINANCIAL_MODULES = new Set<ModuleType>(["financial_quality", "fundamental_verification"]);
const REVIEW_MODULES = new Set<ModuleType>(["weekly_digest", "recent_alerts", "trade_review", "social_risk", "social_topics", "social_heat", "social_sentiment", "opportunity_check", "ai_summary"]);
const LEARNING_MODULES = new Set<ModuleType>(["investment_goal", "risk_tolerance", "etf_basics", "simulation_portfolio", "term_explainer", "learning_card"]);

function HomeWorkspaceModule({ section, snapshot, profile, holdings, total, preferredStock, largest, largestWeight }: { section: HomeSectionPlan; snapshot: Snapshot; profile?: InvestorProfile; holdings: Record<string, Holding>; total: number; preferredStock: StockSearchItem; largest?: Holding; largestWeight: number }) {
  const { isEnglish } = useI18n();
  const type = section.moduleType;
  if (!type) return null;
  const className = `home-workspace-module visual-${section.visualization ?? "list"}`;
  const body = type === "technical_chart"
    ? <HomeStockFocus initialStock={preferredStock} context={total ? "largest_holding" : "default"} holdings={holdings} total={total} />
    : PORTFOLIO_MODULES.has(type)
      ? <HomePortfolioMatrix holdings={holdings} total={total} />
      : FINANCIAL_MODULES.has(type)
        ? <HomeFinancialQuality stock={preferredStock} />
        : RISK_MODULES.has(type)
          ? <HomeRiskModule type={type} profile={profile} holdings={holdings} total={total} largest={largest} largestWeight={largestWeight} />
          : EXPOSURE_MODULES.has(type)
            ? <HomeExposureModule type={type} holdings={holdings} total={total} />
            : REVIEW_MODULES.has(type)
              ? <HomeReviewQueue type={type} snapshot={snapshot} profile={profile} largest={largest} largestWeight={largestWeight} />
              : LEARNING_MODULES.has(type)
                ? <HomeGuidedModule type={type} />
                : type.startsWith("quant_")
                  ? <HomeQuantModule type={type} snapshot={snapshot} />
                  : <HomeResearchIndicator type={type} stock={preferredStock} />;
  return <section className={className} data-module={type} data-width={section.width} style={{ gridColumn: `span ${section.grid.w}` }}>
    <header className="home-module-header"><div><span>{moduleDisplayName(type,section.title,isEnglish)}</span><small>{pick(isEnglish, `视图：${section.visualization ?? "列表"}`, `View: ${section.visualization ?? "list"}`)}</small></div><Link href={homeModuleRoute(type, preferredStock.code)}>{pick(isEnglish, "展开", "Open")}<ArrowRight /></Link></header>
    {body}
  </section>;
}

function homeModuleRoute(type: ModuleType, code: string) {
  if (type.startsWith("quant_")) return "/quant";
  if (type.includes("etf")) return "/etf-tool";
  if (RISK_MODULES.has(type) || EXPOSURE_MODULES.has(type) || PORTFOLIO_MODULES.has(type)) return "/portfolio";
  if (REVIEW_MODULES.has(type)) return type.includes("social") || type === "opportunity_check" ? "/opportunity" : "/analysis?view=history";
  if (LEARNING_MODULES.has(type)) return type === "risk_tolerance" || type === "investment_goal" ? "/profile" : "/demo";
  return `/analysis?view=research&code=${code}`;
}

type PortfolioMarketRow = { code: string; name: string; industry?: string; value: number; weight: number; example: boolean; price?: number; day?: number; period?: number; volumeRatio?: number; status: "loading" | "live" | "cached" | "unavailable" };
const DEFAULT_WATCHLIST: Record<string, Holding> = {
  "600519": { name: "贵州茅台", value: 0, industry: "消费" },
  "600183": { name: "生益科技", value: 0, industry: "电子" },
  "300750": { name: "宁德时代", value: 0, industry: "新能源" },
  "600036": { name: "招商银行", value: 0, industry: "银行" },
};

function HomePortfolioMatrix({ holdings, total }: { holdings: Record<string, Holding>; total: number }) {
  const { isEnglish, locale } = useI18n();
  const { actualEntries, sampleEntries, source } = useMemo(() => {
    const actual = Object.entries(holdings).slice(0, 8);
    const samples = Object.entries(DEFAULT_WATCHLIST).filter(([code]) => !holdings[code]).slice(0, Math.max(0, 4 - actual.length));
    return { actualEntries: actual, sampleEntries: samples, source: [...actual.map(([code, item]) => [code, item, false] as const), ...samples.map(([code, item]) => [code, item, true] as const)] };
  }, [holdings]);
  const hasExamples = sampleEntries.length > 0;
  const [rows, setRows] = useState<PortfolioMarketRow[]>(() => source.map(([code, item, example]) => ({ code, ...item, example, weight: !example && total ? item.value / total : 0, status: "loading" })));
  useEffect(() => {
    let active = true;
    const seeds = source;
    setRows(seeds.map(([code, item, example]) => ({ code, ...item, example, weight: !example && total ? item.value / total : 0, status: "loading" })));
    void Promise.all(seeds.map(async ([code, item, example]) => {
      try {
        const response = await fetch(`/api/information/${code}`, { cache: "no-store" });
        const payload = await response.json() as { status?: StockFocus["status"]; quote?: { stock_name?: string; current_price?: number; change_percent?: number }; history?: { data?: Array<{ close?: number; volume?: number }> } };
        const points = payload.history?.data ?? [];
        const recent = points.slice(-20);
        const first = Number(recent[0]?.close);
        const last = Number(recent.at(-1)?.close);
        const averageVolume = recent.slice(0, -1).reduce((sum, point) => sum + Number(point.volume || 0), 0) / Math.max(1, recent.length - 1);
        const localized=isEnglish?knownStockEnglish(code,payload.quote?.stock_name || item.name,item.industry):{name:payload.quote?.stock_name || item.name,industry:item.industry};
        return { code, name: localized.name, industry: localized.industry, value: item.value, example, weight: !example && total ? item.value / total : 0, price: Number(payload.quote?.current_price) || last || undefined, day: Number(payload.quote?.change_percent) || 0, period: first && last ? (last / first - 1) * 100 : undefined, volumeRatio: averageVolume ? Number(recent.at(-1)?.volume || 0) / averageVolume : undefined, status: response.ok ? (payload.status === "cached" ? "cached" : "live") : "unavailable" } satisfies PortfolioMarketRow;
      } catch {
        return { code, ...item, example, weight: !example && total ? item.value / total : 0, status: "unavailable" } satisfies PortfolioMarketRow;
      }
    })).then((next) => { if (active) setRows(next); });
    return () => { active = false; };
  }, [holdings, source, total, isEnglish]);
  return <div className="home-portfolio-matrix">
    <div className="home-matrix-context"><span>{actualEntries.length ? pick(isEnglish, `${actualEntries.length} 个持仓${hasExamples ? ` + ${sampleEntries.length} 个示例观察` : ""}`, `${actualEntries.length} holdings${hasExamples ? ` + ${sampleEntries.length} examples` : ""}`) : pick(isEnglish, "示例观察列表 · 实时读取公开行情", "Example watchlist · public market data")}</span><small>{pick(isEnglish, "点击标的进入完整研究；示例不会进入组合风险计算。", "Open an asset for full research. Examples never enter portfolio risk calculations.")}</small></div>
    <div className="home-matrix-table" role="table">
      <div role="row" className="head"><span>{pick(isEnglish, "标的", "Asset")}</span><span>{pick(isEnglish, "最新", "Last")}</span><span>{pick(isEnglish, "今日", "Today")}</span><span>{pick(isEnglish, "近20日", "20D")}</span><span>{pick(isEnglish, "量能", "Volume")}</span><span>{pick(isEnglish, "组合", "Weight")}</span></div>
      {rows.map((row) => <Link role="row" href={`/analysis?view=research&code=${row.code}`} key={row.code}>
        <span><strong>{row.name}</strong><small>{row.code} · {row.industry || "—"}{row.example ? ` · ${pick(isEnglish, "示例", "example")}` : ""}</small></span>
        <span>{row.status === "loading" ? "…" : row.price ? row.price.toLocaleString(locale, { maximumFractionDigits: 2 }) : "—"}<small>{row.status === "cached" ? pick(isEnglish, "缓存", "cached") : row.status === "unavailable" ? pick(isEnglish, "无数据", "unavailable") : ""}</small></span>
        <span className={(row.day ?? 0) > 0 ? "up" : (row.day ?? 0) < 0 ? "down" : ""}>{row.day === undefined ? "—" : `${row.day > 0 ? "+" : ""}${row.day.toFixed(2)}%`}</span>
        <span className={(row.period ?? 0) > 0 ? "up" : (row.period ?? 0) < 0 ? "down" : ""}>{row.period === undefined ? "—" : `${row.period > 0 ? "+" : ""}${row.period.toFixed(1)}%`}</span>
        <span>{row.volumeRatio === undefined ? "—" : `${row.volumeRatio.toFixed(1)}×`}</span>
        <span>{row.example ? "—" : percent(row.weight)}</span>
      </Link>)}
    </div>
  </div>;
}

type FinancialSnapshot = { status: "loading" | "ready" | "unavailable"; reportDate?: string; source?: string; headline?: { revenue_yoy?: number | null; profit_yoy?: number | null; operating_cash_flow?: number | null; cash_conversion?: number | null; debt_ratio?: number | null }; checks?: Array<{ key?: string; label: string; state: string; finding: string; evidence: string }> };

function HomeFinancialQuality({ stock }: { stock: StockSearchItem }) {
  const { isEnglish, locale } = useI18n();
  const [data, setData] = useState<FinancialSnapshot>({ status: "loading" });
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 9_000);
    setData({ status: "loading" });
    fetch(`/api/financial/${stock.code}`, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const payload = await response.json() as { report_date?: string; headline?: FinancialSnapshot["headline"]; checks?: FinancialSnapshot["checks"]; data_status?: { source?: string } };
      if (!response.ok) throw new Error("unavailable");
      if (active) setData({ status: "ready", reportDate: payload.report_date, source: payload.data_status?.source, headline: payload.headline, checks: payload.checks });
    }).catch(() => { if (active) setData({ status: "unavailable" }); }).finally(() => window.clearTimeout(timer));
    return () => { active = false; window.clearTimeout(timer); controller.abort(); };
  }, [stock.code]);
  const metric = (value?: number | null, suffix = "%") => value === null || value === undefined ? "—" : `${value > 0 && suffix === "%" ? "+" : ""}${value.toLocaleString(locale, { maximumFractionDigits: 1 })}${suffix}`;
  const checks = (data.checks ?? []).slice(0, 3);
  return <div className="home-financial-quality">
    <div className="home-financial-context"><strong>{stock.name} <small>{stock.code}</small></strong><span>{data.status === "loading" ? pick(isEnglish, "正在读取公开财报", "Loading public filings") : data.status === "ready" ? `${data.source ?? pick(isEnglish, "公开财报", "Public filings")} · ${data.reportDate ?? "—"}` : pick(isEnglish, "本次未取得财报，不使用样例替代", "Financial data unavailable; no sample substituted")}</span></div>
    <div className="home-financial-metrics">
      <article><span>{pick(isEnglish, "营收同比", "Revenue YoY")}</span><strong>{metric(data.headline?.revenue_yoy)}</strong></article>
      <article><span>{pick(isEnglish, "净利润同比", "Profit YoY")}</span><strong>{metric(data.headline?.profit_yoy)}</strong></article>
      <article><span>{pick(isEnglish, "现金/利润", "Cash / profit")}</span><strong>{metric(data.headline?.cash_conversion, "×")}</strong></article>
      <article><span>{pick(isEnglish, "资产负债率", "Debt ratio")}</span><strong>{metric(data.headline?.debt_ratio)}</strong></article>
    </div>
    {checks.length > 0 && <div className="home-financial-checks">{checks.map((check) => <article key={check.key ?? check.label} data-state={check.state}><span>{check.label}</span><strong>{check.finding}</strong><small>{check.evidence}</small></article>)}</div>}
  </div>;
}

function HomeRiskModule({ type, profile, holdings, total, largest, largestWeight }: { type: ModuleType; profile?: InvestorProfile; holdings: Record<string, Holding>; total: number; largest?: Holding; largestWeight: number }) {
  const { isEnglish } = useI18n();
  const limit = profile?.maxSingleWeight ?? .3;
  const over = largestWeight > limit;
  const downside = total * .2;
  return <div className="home-risk-module">
    <div className="home-risk-gauge"><span style={{ "--risk-fill": `${Math.min(100, largestWeight / Math.max(.01, limit) * 100)}%` } as React.CSSProperties}/><strong>{total ? percent(largestWeight) : "—"}</strong><small>{pick(isEnglish, "最大单一持仓", "Largest position")}</small></div>
    <div className="home-risk-facts">
      <article data-state={over ? "attention" : "steady"}><span>{pick(isEnglish, "个人上限", "Personal limit")}</span><strong>{profile ? percent(limit) : pick(isEnglish, "未设置", "Not set")}</strong><small>{over ? pick(isEnglish, `${largest?.name ?? "最大持仓"}已超过边界`, `${largest?.name ?? "Largest position"} exceeds the limit`) : pick(isEnglish, "当前未触发单一持仓规则", "No single-position rule is triggered")}</small></article>
      <article><span>{pick(isEnglish, "组合下跌 20% 情景", "Portfolio -20% scenario")}</span><strong>{total ? currency(downside) : "—"}</strong><small>{pick(isEnglish, "只做金额换算，不预测会发生", "A money conversion, not a forecast")}</small></article>
      <article><span>{pick(isEnglish, type === "liquidity_watch" ? "流动性数据" : type === "drawdown_watch" ? "回撤数据" : "数据基础", type === "liquidity_watch" ? "Liquidity data" : type === "drawdown_watch" ? "Drawdown data" : "Data basis")}</span><strong>{total ? pick(isEnglish, "持仓已记录", "Holdings recorded") : pick(isEnglish, "等待持仓", "Waiting for holdings")}</strong><small>{pick(isEnglish, "缺少价格序列时不会生成假回撤或流动性结论", "No drawdown or liquidity conclusion is fabricated without price history")}</small></article>
    </div>
  </div>;
}

function HomeExposureModule({ type, holdings, total }: { type: ModuleType; holdings: Record<string, Holding>; total: number }) {
  const { isEnglish } = useI18n();
  const sectors = Object.values(holdings).reduce<Record<string, number>>((result, item) => {
    const key = item.industry || pick(isEnglish, "行业待补充", "Sector missing");
    result[key] = (result[key] ?? 0) + Number(item.value || 0);
    return result;
  }, {});
  const rows = Object.entries(sectors).sort(([, a], [, b]) => b - a).slice(0, 6);
  return <div className="home-exposure-module">
    {rows.length ? rows.map(([name, value]) => <article key={name}><span><strong>{name}</strong><b>{percent(total ? value / total : 0)}</b></span><i><b style={{ width: `${total ? value / total * 100 : 0}%` }}/></i></article>) : <div className="home-inline-empty"><strong>{pick(isEnglish, "还没有可计算的行业暴露", "No sector exposure to calculate")}</strong><span>{pick(isEnglish, "添加持仓和行业后，这里会按实际金额汇总。", "Add holdings and sectors to calculate this from actual values.")}</span></div>}
    {type === "etf_overlap" && <small>{pick(isEnglish, "ETF 重复暴露需要基金定期披露数据；进入 ETF 诊断后计算。", "ETF overlap requires fund disclosure data; open ETF diagnosis to calculate it.")}</small>}
  </div>;
}

function HomeReviewQueue({ type, snapshot, profile, largest, largestWeight }: { type: ModuleType; snapshot: Snapshot; profile?: InvestorProfile; largest?: Holding; largestWeight: number }) {
  const { isEnglish, locale } = useI18n();
  const items: Array<{ title: string; detail: string; time?: string; href: string; state: "attention" | "quiet" }> = [];
  if (profile && largest && largestWeight > profile.maxSingleWeight) items.push({ title: pick(isEnglish, `${largest.name} 持仓占比超过个人上限`, `${largest.name} exceeds your position limit`), detail: `${percent(largestWeight)} / ${percent(profile.maxSingleWeight)}`, href: "/portfolio", state: "attention" });
  const claim = snapshot.opportunityChecks?.[0];
  if (claim) items.push({ title: pick(isEnglish, `最近核实：${claim.level}风险`, `Latest claim check: ${claim.level} risk`), detail: claim.text.slice(0, 60), time: claim.checkedAt, href: "/opportunity", state: claim.level === "高" ? "attention" : "quiet" });
  const decision = snapshot.decisionRecords?.[0];
  if (decision) items.push({ title: pick(isEnglish, `最近审查：${decision.result ?? "已完成"}`, `Latest review: ${decision.result ?? "completed"}`), detail: decision.stock?.name ?? pick(isEnglish, "未记录标的", "Asset not recorded"), time: decision.reviewedAt, href: "/analysis?view=history", state: "quiet" });
  return <div className="home-review-queue">
    {items.length ? items.slice(0, 4).map((item, index) => <Link href={item.href} key={`${item.title}-${index}`} data-state={item.state}><i/><span><strong>{item.title}</strong><small>{item.detail}{item.time ? ` · ${new Date(item.time).toLocaleDateString(locale, { month: "short", day: "numeric" })}` : ""}</small></span><ArrowRight /></Link>) : <div className="home-inline-empty"><strong>{pick(isEnglish, type.includes("social") ? "还没有核实过社交内容" : "还没有已记录的待复核事项", type.includes("social") ? "No social content has been checked" : "No recorded reviews yet")}</strong><span>{pick(isEnglish, "这不代表没有风险，只表示当前账户没有可汇总记录。", "This does not mean no risk; there are no recorded items to summarize.")}</span></div>}
  </div>;
}

function HomeGuidedModule({ type }: { type: ModuleType }) {
  const { isEnglish } = useI18n();
  const content: Partial<Record<ModuleType, [string, string, string]>> = {
    investment_goal: ["写下你为什么投资", "目标决定需要关注的时间、风险和复核频率。", "/profile"],
    risk_tolerance: ["先设提醒边界", "把最大单一持仓与可接受亏损写成可检查规则。", "/profile"],
    etf_basics: ["先看 ETF 底层持有什么", "名称相似不等于分散，先检查成分和重复暴露。", "/etf-tool"],
    simulation_portfolio: ["先模拟，再判断流程是否适合你", "模拟结果不进入真实交易，也不承诺收益。", "/quant"],
    term_explainer: ["遇到术语时再解释", "从集中度、回撤和波动率开始，不必一次学完。", "/guide"],
    learning_card: ["用一条真实问题开始", "研究一只标的，再把证据带入决策审查。", "/analysis?view=research"],
  };
  const [title, detail, href] = content[type] ?? ["建立自己的检查流程", "从研究、模拟和风险复核开始。", "/demo"];
  return <div className="home-guided-module"><span>01</span><div><strong>{pick(isEnglish, title, title)}</strong><p>{pick(isEnglish, detail, detail)}</p><Link href={href}>{pick(isEnglish, "开始", "Start")}<ArrowRight /></Link></div></div>;
}

function HomeQuantModule({ type, snapshot }: { type: ModuleType; snapshot: Snapshot }) {
  const { isEnglish } = useI18n();
  const strategies = Array.isArray(snapshot.quantStrategies) ? snapshot.quantStrategies.length : 0;
  const backtests = Array.isArray(snapshot.quantBacktests) ? snapshot.quantBacktests.length : 0;
  const signals = Array.isArray(snapshot.quantSignals) ? snapshot.quantSignals.length : 0;
  return <div className="home-quant-module"><article><span>{pick(isEnglish, "已保存策略", "Saved strategies")}</span><strong>{strategies}</strong></article><article><span>{pick(isEnglish, "历史验证", "Backtests")}</span><strong>{backtests}</strong></article><article><span>{pick(isEnglish, "规则触发记录", "Rule triggers")}</span><strong>{signals}</strong></article><small>{pick(isEnglish, `${MODULE_LABELS[type]}只用于研究、提醒和模拟，不自动交易。`, `${MODULE_LABELS[type]} is for research, alerts and simulation only; it never trades automatically.`)}</small></div>;
}

function HomeResearchIndicator({ type, stock }: { type: ModuleType; stock: StockSearchItem }) {
  const { isEnglish } = useI18n();
  const labels: Partial<Record<ModuleType, [string, string]>> = {
    valuation: ["估值历史尚未接入首页摘要", "进入研究页查看当前可取得的估值与同行口径。"],
    valuation_verification: ["估值需要历史或同行参照", "单独一个 PE/PB 数字不能构成结论。"],
    technical_signals: ["技术指标不单独产生买卖方向", "打开图表后可切换均线、成交量和基准对比。"],
    volume_verification: ["成交量需要与自身历史比较", "查看最新成交量相对 20 日均量，而不是只看绝对值。"],
  };
  const [title, detail] = labels[type] ?? ["当前模块需要更多数据", "平台不会用演示数字填补缺失信息。"];
  return <div className="home-research-indicator"><strong>{pick(isEnglish, title, title)}</strong><p>{pick(isEnglish, detail, detail)}</p><span>{stock.name} · {stock.code}</span></div>;
}

function HomeDecisionBrief({ snapshot, profile, total, largest, largestWeight }: { snapshot: Snapshot; profile?: InvestorProfile; total: number; largest?: Holding; largestWeight: number }) {
  const { isEnglish, locale } = useI18n();
  const latestDecision = snapshot.decisionRecords?.[0];
  const latestClaim = snapshot.opportunityChecks?.[0];
  const exceedsLimit = Boolean(profile && largest && largestWeight > profile.maxSingleWeight);
  const shortDate = (value?: string) => {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(locale, { month: "short", day: "numeric" });
  };
  return <section className={`home-decision-brief${exceedsLimit ? " attention" : ""}`} aria-label={pick(isEnglish, "今日决策台", "Today’s decision desk")} data-guide="decision-brief">
    <header>
      <div><strong>{pick(isEnglish, "今日决策台", "Today’s decision desk")}</strong><span>{pick(isEnglish, "只显示你已记录的持仓、规则和检查结果", "Only your recorded holdings, rules and checks are shown")}</span></div>
      <Link href="/analysis?view=newDecision">{pick(isEnglish, "开始一次检查", "Start a review")}<ArrowRight/></Link>
    </header>
    <div className="home-decision-facts">
      <article className={exceedsLimit ? "attention" : ""}>
        <span>{pick(isEnglish, "最大持仓", "Largest exposure")}</span>
        <strong>{largest ? `${largest.name} · ${percent(largestWeight)}` : pick(isEnglish, "尚未记录持仓", "No holdings recorded")}</strong>
        <small>{profile ? pick(isEnglish, `个人上限 ${percent(profile.maxSingleWeight)}`, `Personal limit ${percent(profile.maxSingleWeight)}`) : pick(isEnglish, "尚未设置个人仓位边界", "No personal position limit set")}</small>
        <Link href={total ? "/portfolio" : "/profile"}>{total ? pick(isEnglish, "查看组合", "View portfolio") : pick(isEnglish, "添加持仓与边界", "Add holdings and limits")}<ArrowRight/></Link>
      </article>
      <article>
        <span>{pick(isEnglish, "最近一次审查", "Latest review")}</span>
        <strong>{latestDecision?.result || pick(isEnglish, "尚无审查记录", "No review recorded")}</strong>
        <small>{latestDecision ? [latestDecision.stock?.name, shortDate(latestDecision.reviewedAt)].filter(Boolean).join(" · ") : pick(isEnglish, "完成一次检查后会显示结果", "Your latest result will appear here")}</small>
        <Link href="/analysis?view=history">{pick(isEnglish, "查看审查记录", "View review history")}<ArrowRight/></Link>
      </article>
      <article>
        <span>{pick(isEnglish, "消息核实", "Claim checks")}</span>
        <strong>{latestClaim ? `${latestClaim.level} · ${latestClaim.score}/100` : pick(isEnglish, "尚无核实记录", "No claim checked")}</strong>
        <small>{latestClaim ? `${latestClaim.text.slice(0, 32)}${latestClaim.text.length > 32 ? "…" : ""}${shortDate(latestClaim.checkedAt) ? ` · ${shortDate(latestClaim.checkedAt)}` : ""}` : pick(isEnglish, "粘贴消息或社交内容核对来源", "Check a message or social post against sources")}</small>
        <Link href="/opportunity">{pick(isEnglish, "核实一条消息", "Check a claim")}<ArrowRight/></Link>
      </article>
    </div>
    <footer><CircleAlert/>{pick(isEnglish, "没有提醒不等于没有风险；这里只汇总已经记录和计算的结果。", "No alert does not mean no risk. This view only summarizes recorded and calculated results.")}</footer>
  </section>;
}

const DEFAULT_HOME_STOCK:StockSearchItem={code:"600519",name:"贵州茅台",industry:"消费"};

function HomeStockFocus({ initialStock, context, holdings, total }: { initialStock: StockSearchItem; context: "largest_holding" | "default"; holdings: Record<string, Holding>; total: number }){
  const { isEnglish, locale } = useI18n();
  const [stock,setStock]=useState<StockFocus>({status:"loading",points:[]});
  const [selectedStock,setSelectedStock]=useState<StockSearchItem>(initialStock);
  const [selectionSource,setSelectionSource]=useState<"largest_holding"|"default"|"saved">(context);
  const [stockQuery,setStockQuery]=useState("");
  const [stockResults,setStockResults]=useState<StockSearchItem[]>([]);
  const [stockSearchStatus,setStockSearchStatus]=useState<"idle"|"loading"|"ready"|"empty"|"error">("idle");
  const [reloadToken,setReloadToken]=useState(0);
  const [rangeDays,setRangeDays]=useState<20|60|120>(60);const [windowEndOffset,setWindowEndOffset]=useState(0);const [chartMode,setChartMode]=useState<"candlestick"|"line">("candlestick");const [chartSize,setChartSize]=useState<"compact"|"standard"|"large">("standard");const [researchView,setResearchView]=useState<"market"|"relative"|"risk"|"event">("market");const [showMa5,setShowMa5]=useState(true);const [showMa20,setShowMa20]=useState(true);const [showBenchmark,setShowBenchmark]=useState(true);const [showVolume,setShowVolume]=useState(true);const [hoverIndex,setHoverIndex]=useState<number|null>(null);const [lockedIndex,setLockedIndex]=useState<number|null>(null);const [chartFullscreen,setChartFullscreen]=useState(false);const [brushRange,setBrushRange]=useState<{start:number;end:number}|null>(null);const [dragStartIndex,setDragStartIndex]=useState<number|null>(null);const [dragCurrentIndex,setDragCurrentIndex]=useState<number|null>(null);const dragMoved=useRef(false);
  useEffect(()=>setSelectionSource((current)=>current==="saved"?current:context),[context]);
  useEffect(()=>{try{const saved=window.localStorage.getItem("market-clarity:home-stock");if(!saved)return;const parsed=JSON.parse(saved) as StockSearchItem;if(/^\d{6}$/.test(parsed.code)&&parsed.name){setSelectedStock(parsed);setSelectionSource("saved");}}catch{/* Invalid local preference is ignored. */}},[]);
  useEffect(()=>{const query=stockQuery.trim();if(query.length<2){setStockResults([]);setStockSearchStatus("idle");return;}const controller=new AbortController();setStockSearchStatus("loading");const timer=window.setTimeout(()=>{fetch(`/api/stocks/search?q=${encodeURIComponent(query)}&limit=6`,{cache:"no-store",signal:controller.signal}).then(async(response)=>{const payload=await response.json() as {items?:Array<{code?:string;name?:string;industry?:string}>};if(!response.ok)throw new Error("search unavailable");const items=(payload.items??[]).map(item=>({code:String(item.code??""),name:String(item.name??item.code??""),industry:item.industry})).filter(item=>/^\d{6}$/.test(item.code));if(/^\d{6}$/.test(query)&&!items.some(item=>item.code===query))items.unshift({code:query,name:query,industry:pick(isEnglish,"名称随行情载入","Name loads with market data")});setStockResults(items);setStockSearchStatus(items.length?"ready":"empty");}).catch(error=>{if((error as Error).name!=="AbortError")setStockSearchStatus("error")});},280);return()=>{window.clearTimeout(timer);controller.abort()};},[stockQuery,isEnglish]);
  const chooseStock=(item:StockSearchItem)=>{setSelectedStock(item);setSelectionSource("saved");setStockQuery("");setStockResults([]);setStockSearchStatus("idle");setWindowEndOffset(0);setBrushRange(null);setHoverIndex(null);setLockedIndex(null);try{window.localStorage.setItem("market-clarity:home-stock",JSON.stringify(item));}catch{/* Preference persistence is optional. */}};
  useEffect(()=>{if(!chartFullscreen)return;const close=(event:KeyboardEvent)=>{if(event.key==="Escape")setChartFullscreen(false)};document.body.classList.add("chart-overlay-open");window.addEventListener("keydown",close);return()=>{document.body.classList.remove("chart-overlay-open");window.removeEventListener("keydown",close)};},[chartFullscreen]);
  useEffect(()=>{setStock({status:"loading",name:selectedStock.name,points:[]});const controller=new AbortController();const timer=window.setTimeout(()=>controller.abort(),8_500);const code=selectedStock.code;Promise.allSettled([fetch(`/api/information/${code}`,{cache:"no-store",signal:controller.signal}),fetch(`/api/evidence/${code}?reason=${encodeURIComponent("首页股票观察")}`,{cache:"no-store",signal:controller.signal}),fetch("/api/market/benchmark",{cache:"no-store",signal:controller.signal})]).then(async([informationResult,evidenceResult,benchmarkResult])=>{if(informationResult.status!=="fulfilled")throw new Error("行情暂时不可用");const response=informationResult.value;const payload=await response.json() as {status?:StockFocus["status"];provider?:string;data_timestamp?:string;message?:string;quote?:{stock_name?:string;current_price?:number;change_percent?:number};history?:{data?:Array<{open?:number;high?:number;low?:number;close?:number;date?:string;volume?:number}>}};let event:StockFocus["event"];if(evidenceResult.status==="fulfilled"&&evidenceResult.value.ok){const evidence=await evidenceResult.value.json() as {feed?:{items?:Array<{published_at?:string;date?:string;title?:string;source?:string;url?:string}>}};const item=evidence.feed?.items?.[0];if(item?.title)event={date:String(item.published_at??item.date??""),title:item.title,source:item.source??"公开资料",url:item.url};}let benchmark:StockPoint[]=[];if(benchmarkResult.status==="fulfilled"&&benchmarkResult.value.ok){const benchmarkPayload=await benchmarkResult.value.json() as {data?:Array<{date?:string;close?:number}>};benchmark=(benchmarkPayload.data??[]).map((item)=>({close:Number(item.close),date:String(item.date??""),volume:0})).filter((item)=>item.date&&Number.isFinite(item.close)).slice(-260);}setStock({status:response.ok?(payload.status??"partial"):"unavailable",name:payload.quote?.stock_name||selectedStock.name,provider:payload.provider,dataTimestamp:payload.data_timestamp,price:Number(payload.quote?.current_price)||undefined,change:Number(payload.quote?.change_percent)||0,points:(payload.history?.data??[]).map((item)=>({open:Number(item.open)||undefined,high:Number(item.high)||undefined,low:Number(item.low)||undefined,close:Number(item.close),date:String(item.date??""),volume:Number(item.volume)||0})).filter((item)=>Number.isFinite(item.close)).slice(-120),benchmark,event,message:payload.message});}).catch(()=>setStock({status:"unavailable",name:selectedStock.name,points:[],message:"行情暂时不可用"})).finally(()=>window.clearTimeout(timer));return()=>{window.clearTimeout(timer);controller.abort()};},[reloadToken,selectedStock]);
  const maxWindowOffset=Math.max(0,stock.points.length-rangeDays);const safeWindowOffset=Math.min(windowEndOffset,maxWindowOffset);const windowEnd=stock.points.length-safeWindowOffset;const windowStart=Math.max(0,windowEnd-rangeDays);const basePoints=stock.points.slice(windowStart,windowEnd);const safeBrush=brushRange&&brushRange.start<basePoints.length?{start:Math.max(0,brushRange.start),end:Math.min(basePoints.length-1,brushRange.end)}:null;const points=safeBrush?basePoints.slice(safeBrush.start,safeBrush.end+1):basePoints;const values=points.map((item)=>item.close);
  const benchmarkByDate=new Map((stock.benchmark??[]).map((item)=>[item.date.slice(0,10),item.close]));
  const benchmarkRaw=points.map((item)=>benchmarkByDate.get(item.date.slice(0,10))??null);
  const benchmarkBase=benchmarkRaw.find((value):value is number=>typeof value==="number");
  const stockBase=points[0]?.close;
  const benchmarkComparable=benchmarkRaw.map((value)=>value!==null&&benchmarkBase&&stockBase?stockBase*(value/benchmarkBase):null);
  const priceValues=[...points.flatMap((item)=>[item.low??item.close,item.high??item.close]),...(showBenchmark?benchmarkComparable.filter((value):value is number=>value!==null):[])];
  const min=Math.min(...priceValues),max=Math.max(...priceValues);const range=max-min||1;const width=760;const height=chartSize==="compact"?236:chartSize==="large"?388:304;const left=54,right=18,top=20;const volumeSpace=showVolume?(chartSize==="compact"?54:68):22;const priceBottom=height-volumeSpace-24,volumeTop=priceBottom+18,volumeBottom=height-22;const x=(index:number)=>left+index/Math.max(1,points.length-1)*(width-left-right);const y=(value:number)=>top+(max-value)/range*(priceBottom-top);const coordinates=points.length>1?points.map((point,index)=>`${x(index)},${y(point.close)}`).join(" "):"";const maxVolume=Math.max(...points.map((item)=>item.volume),1);const highIndex=points.reduce((best,point,index)=>(point.high??point.close)>(points[best].high??points[best].close)?index:best,0),lowIndex=points.reduce((best,point,index)=>(point.low??point.close)<(points[best].low??points[best].close)?index:best,0);const periodChange=points.length>1?(points.at(-1)!.close/points[0].close-1)*100:0;const benchmarkLast=[...benchmarkRaw].reverse().find((value):value is number=>typeof value==="number");const benchmarkPeriodChange=benchmarkBase&&benchmarkLast?(benchmarkLast/benchmarkBase-1)*100:null;const relativePerformance=benchmarkPeriodChange===null?null:periodChange-benchmarkPeriodChange;const volatility=points.length>2?Math.sqrt(points.slice(1).reduce((sum,point,index)=>{const daily=point.close/points[index].close-1;return sum+daily*daily;},0)/(points.length-1))*Math.sqrt(252)*100:0;const yTicks=[max,(max+min)/2,min];const xTicks=points.length?[points[0],points[Math.floor(points.length/2)],points.at(-1)!]:[];
  const movingAverage=(period:number)=>points.map((_,index)=>index<period-1?null:points.slice(index-period+1,index+1).reduce((sum,point)=>sum+point.close,0)/period);
  const ma5=movingAverage(5),ma20=movingAverage(20);
  const lineFor=(series:Array<number|null>)=>series.map((value,index)=>value===null?"":`${x(index)},${y(value)}`).filter(Boolean).join(" ");
  const latest=points.at(-1);const latestMa20=ma20.at(-1);const ma20Gap=latest&&latestMa20?(latest.close/latestMa20-1)*100:0;
  const recentVolumes=points.slice(-20).map((point)=>point.volume).filter((value)=>value>0);const averageVolume=recentVolumes.length?recentVolumes.reduce((sum,value)=>sum+value,0)/recentVolumes.length:0;const volumeRatio=latest&&averageVolume?latest.volume/averageVolume:0;
  const drawdownFromHigh=latest&&max?(latest.close/max-1)*100:0;
  const eventTime=stock.event?.date?new Date(stock.event.date).getTime():NaN;const eventInRange=points.length&&Number.isFinite(eventTime)&&eventTime>=new Date(points[0].date).getTime()&&eventTime<=new Date(points.at(-1)!.date).getTime();
  const eventIndex=eventInRange?points.reduce((best,point,index)=>Math.abs(new Date(point.date).getTime()-eventTime)<Math.abs(new Date(points[best].date).getTime()-eventTime)?index:best,0):-1;
  const eventMove=eventIndex>=0&&points[eventIndex]?.close&&latest?(latest.close/points[eventIndex].close-1)*100:null;
  const activeIndex=hoverIndex??lockedIndex;const hovered=activeIndex===null?null:points[activeIndex];const hoveredMa5=activeIndex===null?null:ma5[activeIndex];const hoveredMa20=activeIndex===null?null:ma20[activeIndex];const hoveredPrevious=activeIndex===null||activeIndex===0?null:points[activeIndex-1];const hoveredChange=hovered&&hoveredPrevious?(hovered.close/hoveredPrevious.close-1)*100:null;const hoveredAmplitude=hovered&&hovered.low&&hovered.high?(hovered.high/hovered.low-1)*100:null;const hoveredBenchmark=activeIndex===null?null:benchmarkRaw[activeIndex];const priorBenchmark=activeIndex===null||activeIndex===0?null:benchmarkRaw[activeIndex-1];const hoveredBenchmarkChange=hoveredBenchmark&&priorBenchmark?(hoveredBenchmark/priorBenchmark-1)*100:null;const hoveredBenchmarkPeriod=hoveredBenchmark&&benchmarkBase?(hoveredBenchmark/benchmarkBase-1)*100:null;const candleWidth=Math.max(2,Math.min(8,(width-left-right)/Math.max(1,points.length)*.62));
  const indexAtEvent=(event:ReactMouseEvent<SVGSVGElement>)=>{const bounds=event.currentTarget.getBoundingClientRect();const viewX=(event.clientX-bounds.left)/bounds.width*width;const index=Math.round((viewX-left)/(width-left-right)*Math.max(1,points.length-1));return Math.max(0,Math.min(points.length-1,index));};
  const moveHover=(event:ReactMouseEvent<SVGSVGElement>)=>{const index=indexAtEvent(event);if(dragStartIndex!==null){setDragCurrentIndex(index);if(Math.abs(index-dragStartIndex)>1)dragMoved.current=true;return;}setHoverIndex(index);};
  const finishBrush=(event:ReactMouseEvent<SVGSVGElement>)=>{if(dragStartIndex===null)return;const end=indexAtEvent(event);if(Math.abs(end-dragStartIndex)>=3){const localStart=Math.min(dragStartIndex,end),localEnd=Math.max(dragStartIndex,end);const offset=safeBrush?.start??0;setBrushRange({start:offset+localStart,end:offset+localEnd});setHoverIndex(null);setLockedIndex(null);}setDragStartIndex(null);setDragCurrentIndex(null);};
  const moveHoverByKey=(direction:number)=>{const next=Math.max(0,Math.min(points.length-1,(activeIndex??points.length-1)+direction));setLockedIndex(next);setHoverIndex(null);};
  const shiftWindow=(direction:"earlier"|"later")=>{setWindowEndOffset((current)=>direction==="earlier"?Math.min(maxWindowOffset,current+5):Math.max(0,current-5));setBrushRange(null);setHoverIndex(null);setLockedIndex(null);};
  const applyResearchView=(view:typeof researchView)=>{
    setResearchView(view);setWindowEndOffset(0);setBrushRange(null);setHoverIndex(null);setLockedIndex(null);
    if(view==="market"){setRangeDays(60);setChartMode("candlestick");setShowMa5(true);setShowMa20(true);setShowBenchmark(false);setShowVolume(true);}
    if(view==="relative"){setRangeDays(60);setChartMode("line");setShowMa5(false);setShowMa20(false);setShowBenchmark(true);setShowVolume(false);}
    if(view==="risk"){setRangeDays(120);setChartMode("line");setShowMa5(false);setShowMa20(true);setShowBenchmark(false);setShowVolume(false);}
    if(view==="event"){setRangeDays(120);setChartMode("line");setShowMa5(false);setShowMa20(false);setShowBenchmark(false);setShowVolume(true);}
  };
  const updated=stock.dataTimestamp?new Date(stock.dataTimestamp).toLocaleDateString(locale,{month:"numeric",day:"numeric"}):"";
  const displayedName=stock.name||(selectedStock.code===DEFAULT_HOME_STOCK.code?pick(isEnglish,"贵州茅台","Kweichow Moutai"):selectedStock.name);
  const industryLabel=(item:StockSearchItem)=>item.industry&&!/(数据不足|行业待载入|industry pending)/i.test(item.industry)?item.industry:pick(isEnglish,"A 股","A-share");
  const recordedAssets = Object.entries(holdings).map(([code,item])=>({code,name:item.name||code,industry:item.industry,value:Number(item.value||0),isExample:false})).sort((a,b)=>b.value-a.value);
  const exampleAssets = [
    {code:"600519",name:pick(isEnglish,"贵州茅台","Kweichow Moutai"),industry:pick(isEnglish,"消费","Consumer")},
    {code:"600183",name:pick(isEnglish,"生益科技","Shengyi Technology"),industry:pick(isEnglish,"电子","Electronics")},
    {code:"300750",name:pick(isEnglish,"宁德时代","CATL"),industry:pick(isEnglish,"新能源","New energy")},
    {code:"600036",name:pick(isEnglish,"招商银行","China Merchants Bank"),industry:pick(isEnglish,"银行","Banking")},
  ].filter(item=>!recordedAssets.some(recorded=>recorded.code===item.code)).map(item=>({...item,value:0,isExample:true}));
  const switcherAssets = recordedAssets.length>=2 ? recordedAssets.slice(0,6) : [...recordedAssets,...exampleAssets].slice(0,4);
  const submitStockSearch=()=>{const exact=stockResults.find(item=>item.code===stockQuery.trim());const candidate=exact??stockResults[0]??(/^\d{6}$/.test(stockQuery.trim())?{code:stockQuery.trim(),name:stockQuery.trim()}:undefined);if(candidate)chooseStock(candidate);};
  return <section className={`home-stock-focus chart-size-${chartSize}${chartFullscreen?" chart-fullscreen":""}`} aria-label={pick(isEnglish, "股票观察", "Stock watch")} data-guide="stock-focus">
    <header>
      <div><span>{selectionSource==="largest_holding"?pick(isEnglish, "最大持仓观察", "Largest holding"):selectionSource==="saved"?pick(isEnglish, "已保存观察", "Saved watch"):pick(isEnglish, "默认观察", "Default watch")}</span><strong>{displayedName} <small>{selectedStock.code} · {selectedStock.code===DEFAULT_HOME_STOCK.code&&isEnglish?"Consumer":industryLabel(selectedStock)}</small></strong></div>
      <form className="home-stock-search" role="search" onSubmit={(event)=>{event.preventDefault();submitStockSearch()}}>
        <Search/>
        <input value={stockQuery} onChange={(event)=>setStockQuery(event.target.value)} placeholder={pick(isEnglish,"输入股票名称或 6 位代码","Search name or 6-digit code")} aria-label={pick(isEnglish,"切换首页观察股票","Change the stock shown on the workspace")}/>
        {stockQuery&&<button type="button" onClick={()=>{setStockQuery("");setStockResults([]);setStockSearchStatus("idle")}} aria-label={pick(isEnglish,"清空搜索","Clear search")}><X/></button>}
        <button type="submit" disabled={!stockResults.length&&!/^\d{6}$/.test(stockQuery.trim())}>{pick(isEnglish,"查看","View")}</button>
      </form>
      <div className="home-stock-price">{stock.price?<><b>{stock.price.toFixed(2)}</b><em className={(stock.change??0)>0?"up":(stock.change??0)<0?"down":"flat"}>{(stock.change??0)>0?"+":""}{(stock.change??0).toFixed(2)}%</em></>:<b>{stock.status==="loading"?pick(isEnglish, "读取中", "Loading"):pick(isEnglish, "暂无行情", "No quote")}</b>}</div>
    </header>
    {stockQuery.trim().length>=2&&<div className="home-stock-search-results" role="region" aria-live="polite" aria-label={pick(isEnglish,"股票搜索结果","Stock search results")}>
      {stockSearchStatus==="loading"&&<span>{pick(isEnglish,"正在查找…","Searching…")}</span>}
      {stockResults.map(item=><button key={item.code} onClick={()=>chooseStock(item)}><strong>{item.name}</strong><small>{item.code} · {industryLabel(item)}</small><ArrowRight/></button>)}
      {stockSearchStatus==="empty"&&<span>{pick(isEnglish,"没有找到匹配标的，请检查名称或代码。","No matching asset. Check the name or code.")}</span>}
      {stockSearchStatus==="error"&&<span>{pick(isEnglish,"名称搜索暂不可用；仍可直接输入 6 位代码。","Name search is unavailable; a 6-digit code still works.")}</span>}
    </div>}
    <div className="home-stock-summary"><div><span>{pick(isEnglish, `${rangeDays} 日收益`, `${rangeDays}-day return`)}</span><strong className={periodChange>0?"up":periodChange<0?"down":"flat"}>{periodChange>0?"+":""}{periodChange.toFixed(1)}%</strong></div><div><span>{pick(isEnglish, "相对沪深 300", "Vs CSI 300")}</span><strong className={(relativePerformance??0)>0?"up":(relativePerformance??0)<0?"down":"flat"}>{relativePerformance===null?"—":`${relativePerformance>0?"+":""}${relativePerformance.toFixed(1)}%`}</strong></div><div><span>{pick(isEnglish, `距 ${rangeDays} 日高点`, `From ${rangeDays}-day high`)}</span><strong className={drawdownFromHigh<0?"down":"flat"}>{drawdownFromHigh.toFixed(1)}%</strong></div><div><span>{pick(isEnglish, "相对 20 日均线", "Vs 20-day average")}</span><strong>{latestMa20?`${ma20Gap>0?"+":""}${ma20Gap.toFixed(1)}%`:"—"}</strong></div><div><span>{pick(isEnglish, "成交活跃度", "Volume activity")}</span><strong>{volumeRatio?`${volumeRatio.toFixed(1)}× ${pick(isEnglish, "20日均量", "20d average")}`:"—"}</strong></div></div>
    <section className="home-holding-switcher" aria-label={pick(isEnglish,"持仓与示例观察","Holdings and example watchlist")}>
      <header><div><strong>{pick(isEnglish,"组合观察","Portfolio watch")}</strong><span>{recordedAssets.length>=2?pick(isEnglish,`${recordedAssets.length} 个已记录持仓`,`${recordedAssets.length} recorded holdings`):pick(isEnglish,"示例标的不计入持仓与风险计算","Examples do not affect portfolio or risk calculations")}</span></div><Link href="/portfolio">{pick(isEnglish,"管理持仓","Manage holdings")}<ArrowRight/></Link></header>
      <div>{switcherAssets.map(item=><button key={item.code} className={selectedStock.code===item.code?"active":undefined} onClick={()=>chooseStock({code:item.code,name:item.name,industry:item.industry})}><span><strong>{item.name}</strong><small>{item.code} · {item.industry||pick(isEnglish,"行业待补充","Sector pending")}</small></span>{item.isExample?<em>{pick(isEnglish,"示例","Example")}</em>:<b>{total?percent(item.value/total):"—"}</b>}</button>)}</div>
    </section>
    <nav className="home-research-presets" aria-label={pick(isEnglish,"研究视图","Research views")}>
      <strong>{pick(isEnglish,"研究视图","Research views")}</strong>
      <button className={researchView==="market"?"active":undefined} onClick={()=>applyResearchView("market")}>{pick(isEnglish,"行情与量价","Price & volume")}</button>
      <button className={researchView==="relative"?"active":undefined} onClick={()=>applyResearchView("relative")}>{pick(isEnglish,"相对指数","Relative strength")}</button>
      <button className={researchView==="risk"?"active":undefined} onClick={()=>applyResearchView("risk")}>{pick(isEnglish,"风险区间","Risk window")}</button>
      <button className={researchView==="event"?"active":undefined} onClick={()=>applyResearchView("event")}>{pick(isEnglish,"事件核验","Event check")}</button>
      <Link href={`/quant?asset=${selectedStock.code}`}>{pick(isEnglish,"策略验证","Strategy test")}<ArrowRight/></Link>
    </nav>
    <div className="home-stock-body">
      <div className="home-stock-chart">
        <div className="home-chart-toolbar">
          <div className="home-chart-mode" aria-label={pick(isEnglish, "图表类型", "Chart type")}>
            <button className={chartMode==="candlestick"?"active":""} onClick={()=>setChartMode("candlestick")}>{pick(isEnglish, "K 线", "Candles")}</button>
            <button className={chartMode==="line"?"active":""} onClick={()=>setChartMode("line")}>{pick(isEnglish, "走势", "Line")}</button>
          </div>
          <div className="home-chart-legend">
            <button aria-pressed={showMa5} className={showMa5?"active":""} onClick={()=>setShowMa5(value=>!value)}><i className="ma5"/>MA5</button>
            <button aria-pressed={showMa20} className={showMa20?"active":""} onClick={()=>setShowMa20(value=>!value)}><i className="ma20"/>MA20</button>
            <button aria-pressed={showBenchmark} className={showBenchmark?"active":""} onClick={()=>setShowBenchmark(value=>!value)}><i className="benchmark"/>{pick(isEnglish, "沪深300", "CSI 300")}</button>
            <button aria-pressed={showVolume} className={showVolume?"active":""} onClick={()=>setShowVolume(value=>!value)}><i className="volume"/>{pick(isEnglish, "成交量", "Volume")}</button>
          </div>
          <div className="home-chart-controls" aria-label={pick(isEnglish, "图表范围和尺寸", "Chart range and size")}>
            {eventIndex>=0&&<button className="home-event-jump" onClick={()=>{setLockedIndex(eventIndex);setHoverIndex(null)}}>{pick(isEnglish, "定位公告", "Jump to filing")}</button>}
            {([20,60,120] as const).map(days=><button key={days} className={rangeDays===days?"active":""} onClick={()=>{setRangeDays(days);setWindowEndOffset(0);setBrushRange(null);setHoverIndex(null);setLockedIndex(null)}}>{days}D</button>)}
            {brushRange&&<button className="home-brush-reset" onClick={()=>{setBrushRange(null);setHoverIndex(null);setLockedIndex(null)}}>{pick(isEnglish, "重置缩放", "Reset zoom")}</button>}
            <select value={chartSize} onChange={(event)=>setChartSize(event.target.value as typeof chartSize)} aria-label={pick(isEnglish, "图表大小", "Chart size")}>
              <option value="compact">{pick(isEnglish, "紧凑", "Compact")}</option>
              <option value="standard">{pick(isEnglish, "标准", "Standard")}</option>
              <option value="large">{pick(isEnglish, "放大", "Large")}</option>
            </select>
            <button className="chart-fullscreen-toggle" onClick={()=>setChartFullscreen(value=>!value)} aria-label={chartFullscreen?pick(isEnglish, "退出全屏图表", "Exit full-screen chart"):pick(isEnglish, "全屏查看图表", "Open full-screen chart")} title={chartFullscreen?pick(isEnglish, "退出全屏（Esc）", "Exit full screen (Esc)"):pick(isEnglish, "全屏查看", "Full screen")}>
              {chartFullscreen?<Minimize2/>:<Maximize2/>}
            </button>
          </div>
        </div>
        {coordinates?<>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            tabIndex={0}
            onMouseDown={(event)=>{const index=indexAtEvent(event);dragMoved.current=false;setDragStartIndex(index);setDragCurrentIndex(index)}}
            onMouseMove={moveHover}
            onMouseUp={finishBrush}
            onMouseLeave={()=>{setHoverIndex(null);if(dragStartIndex!==null){setDragStartIndex(null);setDragCurrentIndex(null);dragMoved.current=false}}}
            onClick={()=>{if(dragMoved.current){dragMoved.current=false;return;}if(hoverIndex!==null)setLockedIndex(current=>current===hoverIndex?null:hoverIndex)}}
            onKeyDown={event=>{
              if(event.key==="ArrowLeft"){event.preventDefault();moveHoverByKey(-1)}
              if(event.key==="ArrowRight"){event.preventDefault();moveHoverByKey(1)}
              if(event.key==="Escape"){setLockedIndex(null)}
            }}
            aria-label={pick(isEnglish, `近 ${rangeDays} 个交易日价格、均线、成交量与事件走势图；悬停查看，横向拖动框选放大，点击固定，左右方向键移动`, `Price, moving averages, volume and events over the last ${rangeDays} trading days; hover to inspect, drag-select to zoom, click to pin, or use arrow keys`)}
          >
            <defs><linearGradient id="home-price-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".15"/><stop offset="1" stopColor="currentColor" stopOpacity="0"/></linearGradient></defs>
            {dragStartIndex!==null&&dragCurrentIndex!==null&&<rect className="chart-brush-selection" x={Math.min(x(dragStartIndex),x(dragCurrentIndex))} y={top} width={Math.abs(x(dragCurrentIndex)-x(dragStartIndex))} height={volumeBottom-top}/>}
            {yTicks.map((tick)=><g key={tick}><line className="chart-grid" x1={left} x2={width-right} y1={y(tick)} y2={y(tick)}/><text className="chart-axis-label" x={left-8} y={y(tick)+4} textAnchor="end">{tick.toFixed(0)}</text></g>)}
            {chartMode==="line"
              ? <><polygon className="chart-area" points={`${left},${priceBottom} ${coordinates} ${width-right},${priceBottom}`}/><polyline className="chart-line" points={coordinates}/></>
              : points.map((point,index)=>{
                const open=point.open??point.close,high=point.high??Math.max(open,point.close),low=point.low??Math.min(open,point.close);
                const direction=point.close>open?"up":point.close<open?"down":"flat";
                return <g className={`chart-candle ${direction}`} key={`${point.date}-candle`}><line x1={x(index)} x2={x(index)} y1={y(high)} y2={y(low)}/><rect x={x(index)-candleWidth/2} y={Math.min(y(open),y(point.close))} width={candleWidth} height={Math.max(1,Math.abs(y(open)-y(point.close)))}/></g>;
              })}
            {showMa5&&<polyline className="chart-moving-average ma5" points={lineFor(ma5)}/>}
            {showMa20&&<polyline className="chart-moving-average ma20" points={lineFor(ma20)}/>}
            {showBenchmark&&benchmarkBase&&<polyline className="chart-benchmark" points={lineFor(benchmarkComparable)}/>}
            {showVolume&&points.map((point,index)=><rect className="chart-volume" key={point.date} x={x(index)-2} y={volumeBottom-point.volume/maxVolume*(volumeBottom-volumeTop)} width="4" height={point.volume/maxVolume*(volumeBottom-volumeTop)}/>)}
            {showVolume&&<line className="chart-axis" x1={left} x2={width-right} y1={volumeBottom} y2={volumeBottom}/>}
            {xTicks.map((point,index)=><text className="chart-axis-label" key={point.date} x={x(index===0?0:index===1?Math.floor(points.length/2):points.length-1)} y={height-4} textAnchor={index===0?"start":index===2?"end":"middle"}>{point.date.slice(5)}</text>)}
            {[highIndex,lowIndex].map((index)=><g key={index}><circle className="chart-marker" cx={x(index)} cy={y(index===highIndex?(points[index].high??points[index].close):(points[index].low??points[index].close))} r="4"/><text className="chart-marker-label" x={x(index)} y={y(index===highIndex?(points[index].high??points[index].close):(points[index].low??points[index].close))+(index===highIndex?-10:17)} textAnchor="middle">{index===highIndex?pick(isEnglish, `${rangeDays}日高点`, `${rangeDays}d high`):pick(isEnglish, `${rangeDays}日低点`, `${rangeDays}d low`)}</text></g>)}
            {eventIndex>=0&&<g className="chart-event"><line x1={x(eventIndex)} x2={x(eventIndex)} y1={top} y2={priceBottom}/><circle cx={x(eventIndex)} cy={y(points[eventIndex].close)} r="4"/><text x={x(eventIndex)+6} y={top+12}>{pick(isEnglish, "公告", "Filing")}</text></g>}
            {hovered&&activeIndex!==null&&<g className="chart-crosshair"><line x1={x(activeIndex)} x2={x(activeIndex)} y1={top} y2={showVolume?volumeBottom:priceBottom}/><line x1={left} x2={width-right} y1={y(hovered.close)} y2={y(hovered.close)}/><circle cx={x(activeIndex)} cy={y(hovered.close)} r="4"/></g>}
          </svg>
          {hovered&&activeIndex!==null&&<div className={`home-chart-tooltip ${x(activeIndex)>width*.72?"align-right":""}`} style={{left:`${x(activeIndex)/width*100}%`}} role="status">
            <strong>{hovered.date}<em className={(hoveredChange??0)>0?"up":(hoveredChange??0)<0?"down":"flat"}>{hoveredChange===null?"—":`${hoveredChange>0?"+":""}${hoveredChange.toFixed(2)}%`}</em></strong>
            <span>{pick(isEnglish, "开盘", "Open")} <b>{hovered.open?.toFixed(2)??"—"}</b></span>
            <span>{pick(isEnglish, "最高", "High")} <b>{hovered.high?.toFixed(2)??"—"}</b></span>
            <span>{pick(isEnglish, "最低", "Low")} <b>{hovered.low?.toFixed(2)??"—"}</b></span>
            <span>{pick(isEnglish, "收盘", "Close")} <b>{hovered.close.toFixed(2)}</b></span>
            <span>{pick(isEnglish, "振幅", "Range")} <b>{hoveredAmplitude===null?"—":`${hoveredAmplitude.toFixed(2)}%`}</b></span>
            {showMa5&&<span>MA5 <b>{hoveredMa5?.toFixed(2)??"—"}</b></span>}
            {showMa20&&<span>MA20 <b>{hoveredMa20?.toFixed(2)??"—"}</b></span>}
            {showBenchmark&&<span>{pick(isEnglish, "沪深300 当日", "CSI 300 daily")} <b>{hoveredBenchmarkChange===null?"—":`${hoveredBenchmarkChange>0?"+":""}${hoveredBenchmarkChange.toFixed(2)}%`}</b></span>}
            {showBenchmark&&<span>{pick(isEnglish, "沪深300 区间", "CSI 300 period")} <b>{hoveredBenchmarkPeriod===null?"—":`${hoveredBenchmarkPeriod>0?"+":""}${hoveredBenchmarkPeriod.toFixed(2)}%`}</b></span>}
            <span>{pick(isEnglish, "成交量", "Volume")} <b>{hovered.volume.toLocaleString(locale)}</b></span>
            {activeIndex===eventIndex&&stock.event&&<small>{pick(isEnglish, "同日公告", "Same-day filing")}：{stock.event.title}</small>}
            {lockedIndex===activeIndex&&<small className="pinned">{pick(isEnglish, "读数已固定 · 再次点击或按 Esc 取消", "Reading pinned · click again or press Esc to clear")}</small>}
          </div>}
          <div className="home-chart-navigator">
            <span>{points[0]?.date.slice(0,10)} — {points.at(-1)?.date.slice(0,10)}</span>
            <button disabled={safeWindowOffset>=maxWindowOffset} onClick={()=>shiftWindow("earlier")} aria-label={pick(isEnglish, "向前查看五个交易日", "Move five trading days earlier")}><ArrowLeft /></button>
            <input
              type="range"
              min="0"
              max={maxWindowOffset}
              value={maxWindowOffset-safeWindowOffset}
              disabled={maxWindowOffset===0}
              onChange={(event)=>{setWindowEndOffset(maxWindowOffset-Number(event.target.value));setBrushRange(null);setHoverIndex(null);setLockedIndex(null)}}
              aria-label={pick(isEnglish, "拖动查看更早或更晚的时间窗口", "Drag to inspect earlier or later windows")}
            />
            <button disabled={safeWindowOffset===0} onClick={()=>shiftWindow("later")} aria-label={pick(isEnglish, "向后查看五个交易日", "Move five trading days later")}><ArrowRight /></button>
            <button disabled={safeWindowOffset===0&&!brushRange} onClick={()=>{setWindowEndOffset(0);setBrushRange(null);setHoverIndex(null);setLockedIndex(null)}}>{pick(isEnglish, "回到最新", "Latest")}</button>
          </div>
          <div className="home-chart-hint">{pick(isEnglish, "悬停读数 · 横向框选局部放大 · 点击固定 · 左右键逐日查看", "Hover for values · drag across the chart to zoom · click to pin · arrow keys move by day")}</div>
        </>:<div className={`home-chart-empty ${stock.status}`}>
          <CircleAlert />
          <strong>{stock.status==="loading"?pick(isEnglish, "正在读取公开行情", "Loading public market data"):pick(isEnglish, "本次行情没有返回", "Market data did not return")}</strong>
          <span>{stock.status==="loading"?pick(isEnglish, `正在读取近 ${rangeDays} 个交易日、成交量和基准`, `Loading ${rangeDays} trading days, volume and benchmark data`):pick(isEnglish, "没有使用样例曲线替代。公告和研究入口仍可继续使用。", "No sample chart was substituted. Filings and research remain available.")}</span>
          {stock.status!=="loading"&&<button onClick={()=>setReloadToken(value=>value+1)}><RotateCcw />{pick(isEnglish, "重新读取", "Retry data")}</button>}
        </div>}
      </div>
      <aside className="home-stock-insight">
        <span>{pick(isEnglish, "今日需要核对", "What needs review today")}</span>
        <div className="home-check-list">
          <article><b>{pick(isEnglish, "价格结构", "Price structure")}</b><strong>{latestMa20?pick(isEnglish, `收盘价${ma20Gap>=0?"高于":"低于"} MA20 ${Math.abs(ma20Gap).toFixed(1)}%`, `Close is ${Math.abs(ma20Gap).toFixed(1)}% ${ma20Gap>=0?"above":"below"} MA20`):pick(isEnglish, "数据不足", "Insufficient data")}</strong></article>
          <article><b>{pick(isEnglish, "成交活跃度", "Trading activity")}</b><strong>{volumeRatio?pick(isEnglish, `最新成交量为 20 日均量的 ${volumeRatio.toFixed(1)} 倍`, `Latest volume is ${volumeRatio.toFixed(1)}× the 20-day average`):pick(isEnglish, "暂无成交量对比", "No volume comparison")}</strong></article>
          <article><b>{pick(isEnglish, "最新正式信息", "Latest formal information")}</b><strong>{stock.event?.title??pick(isEnglish, "暂未取得近期公告", "No recent filing available")}</strong><small>{stock.event?`${stock.event.source}${stock.event.date?` · ${stock.event.date.slice(5,10)}`:""}`:pick(isEnglish, "不会用社交热度替代正式披露", "Social attention is not a substitute for formal disclosure")}</small>{eventMove!==null&&<small className="event-price-link">{pick(isEnglish, `公告日至当前窗口末价格 ${eventMove>=0?"+":""}${eventMove.toFixed(1)}% · 仅为时间对齐，不代表因果`, `Price from filing date to window end ${eventMove>=0?"+":""}${eventMove.toFixed(1)}% · time alignment, not causation`)}</small>}{stock.event?.url&&<a href={stock.event.url} target="_blank" rel="noreferrer">{pick(isEnglish, "原文", "Source")}<ArrowRight/></a>}</article>
        </div>
      </aside>
    </div>
    <footer><span>{stock.provider??pick(isEnglish, "公开行情", "Public market data")}{updated?` · ${pick(isEnglish, "数据至", "Data through")} ${updated}`:""} · {pick(isEnglish, `年化波动 ${volatility?volatility.toFixed(1):"—"}%`, `Annualized volatility ${volatility?volatility.toFixed(1):"—"}%`)}</span><Link href={`/analysis?view=research&code=${selectedStock.code}`}>{pick(isEnglish, "进入完整研究", "Open full research")}<ArrowRight/></Link><Link href={`/analysis?view=newDecision&code=${selectedStock.code}`}>{pick(isEnglish, "检查一笔计划", "Review a plan")}</Link></footer>
  </section>;
}

function HomeMarketPulse(){
  const { isEnglish, locale } = useI18n();
  const [market,setMarket]=useState<MarketOverview>({status:"loading",items:[]});
  useEffect(()=>{const controller=new AbortController();const timer=window.setTimeout(()=>controller.abort(),8_500);fetch("/api/market/overview",{cache:"no-store",signal:controller.signal}).then(async(response)=>{const payload=await response.json() as Omit<MarketOverview,"status">&{status?:MarketOverview["status"]};setMarket({status:response.ok?(payload.status??"healthy"):"unavailable",items:Array.isArray(payload.items)?payload.items:[],source:payload.source,fetched_at:payload.fetched_at,message:payload.message});}).catch(()=>setMarket({status:"unavailable",items:[],message:"市场概览暂时不可用"})).finally(()=>window.clearTimeout(timer));return()=>{window.clearTimeout(timer);controller.abort()};},[]);
  const updated=market.fetched_at?new Date(market.fetched_at).toLocaleTimeString(locale,{hour:"2-digit",minute:"2-digit"}):"";
  const englishIndexNames:Record<string,string>={"上证指数":"Shanghai Composite","沪深300":"CSI 300","创业板指":"ChiNext"};
  return <section className={`home-market-pulse ${market.status}`} aria-label={pick(isEnglish, "市场概览", "Market overview")} data-guide="market-pulse"><header><div><strong>{pick(isEnglish, "市场概览", "Market overview")}</strong><span>{market.status==="loading"?pick(isEnglish, "正在读取公开行情", "Loading public market data"):market.items.length?`${market.source??pick(isEnglish, "公开行情", "Public market data")}${updated?` · ${updated}`:""}`:pick(isEnglish,market.message??"市场概览暂不可用","Market overview is temporarily unavailable")}</span></div><Link href="/analysis?view=research">{pick(isEnglish, "打开股票研究", "Open stock research")}<ArrowRight/></Link></header><div>{market.status==="loading"?Array.from({length:3}).map((_,index)=><i key={index}/>):market.items.length?market.items.map((item)=><article key={item.code}><span>{isEnglish?(englishIndexNames[item.name]??item.name):item.name}</span><strong>{item.value.toLocaleString(locale,{minimumFractionDigits:2,maximumFractionDigits:2})}</strong><em className={item.change>0?"up":item.change<0?"down":"flat"}>{item.change>0?"+":""}{item.change.toFixed(2)}%</em></article>):<p>{pick(isEnglish, "仍可继续使用已保存研究、规则检查和历史资料。", "Saved research, rule checks and historical records remain available.")}</p>}</div><small>{pick(isEnglish, "指数变化只表示市场状态，不代表买卖方向。", "Index changes describe market conditions, not a buy or sell direction.")}</small></section>;
}

function RiskInbox({ profile, largest, largestWeight }: { profile?: InvestorProfile; largest?: Holding; largestWeight: number }) {
  const { isEnglish } = useI18n();
  const over = profile && largestWeight > profile.maxSingleWeight;
  return <div className="personal-risk-inbox"><div className={over ? "attention" : "quiet"}><span>{over ? pick(isEnglish, "需要处理", "Needs review") : pick(isEnglish, "等待数据", "Waiting for data")}</span><strong>{over ? `${largest?.name ?? pick(isEnglish, "最大持仓", "Largest holding")} · ${percent(largestWeight)}` : pick(isEnglish, "尚无超限提醒", "No limit alert")}</strong><p>{over ? (isEnglish?`Above your personal limit of ${percent(profile.maxSingleWeight)}. This is a position-size issue, not a trade conclusion.`:`高于你的个人上限 ${percent(profile.maxSingleWeight)}，这是仓位问题，不是买卖结论。`) : pick(isEnglish, "当持仓、社交说法或交易计划触发个人规则时，会出现在这里。", "Holdings, social claims and trade plans that cross your rules will appear here.")}</p></div><Link href={over ? "/portfolio" : "/opportunity"}>{over ? pick(isEnglish, "查看组合影响", "View portfolio impact") : pick(isEnglish, "检查一条信息", "Check a claim")}<ArrowRight /></Link></div>;
}

function PortfolioOverviewMini({ total, holdings }: { total: number; holdings: Record<string, Holding> }) {
  const { isEnglish, locale } = useI18n();
  const rows = Object.entries(holdings).map(([code, holding]) => ({ code, ...holding, weight: total ? holding.value / total : 0 })).sort((a, b) => b.value - a.value).slice(0, 3);
  const formattedTotal = new Intl.NumberFormat(locale, { style: "currency", currency: "CNY", maximumFractionDigits: 0 }).format(total);
  return <div className="personal-holding-summary"><div className="personal-holding-total"><span>{pick(isEnglish, "当前记录金额", "Recorded amount")}</span><strong>{formattedTotal}</strong><small>{Object.keys(holdings).length} {pick(isEnglish, "个标的", "assets")}</small></div><div className="personal-holding-list">{rows.map((row) => <div key={row.code}><span><strong>{row.name}</strong><small>{row.code} · {row.industry || pick(isEnglish, "行业待补充", "Sector not provided")}</small></span><b>{percent(row.weight)}</b></div>)}</div></div>;
}

function updateProfileLimit(draft: ProfileDraft, key: "maxSingleWeight" | "maxSectorWeight", rawValue: number): ProfileDraft {
  const value = Math.min(1, Math.max(.01, Number.isFinite(rawValue) ? rawValue : .01));
  const field = key === "maxSingleWeight" ? "single_asset_weight" : "sector_weight";
  const label = key === "maxSingleWeight" ? "单一资产" : "单一行业";
  return { ...draft, profile: { ...draft.profile, [key]: value }, rules: draft.rules.map((rule) => rule.field === field ? { ...rule, value, explanation: `${label}占比不超过 ${percent(value)}` } : rule) };
}

function ProfileSurface({ profile, rules, onSave }: { profile?: InvestorProfile; rules: InvestmentRule[]; onSave: (draft: ProfileDraft) => Promise<void> }) {
  const { isEnglish } = useI18n();
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<ProfileDraft>(); const [message, setMessage] = useState("");
  const strongTemplate=pick(isEnglish,"我希望系统强提醒：单一资产不超过20%，单一行业不超过35%，亏损后隔一天再看，每次都填写失效条件。","Use strong reminders: keep any single asset under 20% and any single sector under 35%. After a loss, wait one day before reviewing again and always record an invalidation condition.");
  const standardTemplate=pick(isEnglish,"我希望使用标准提醒：单一资产不超过30%，单一行业不超过50%，大额操作时重新检查，并填写基本理由。","Use standard reminders: keep any single asset under 30% and any single sector under 50%. Recheck large transactions and record the basic rationale.");
  const example=pick(isEnglish,"我主要配置 ETF，单一 ETF 不超过 35%，单一行业不超过 45%，每周检查一次。","I mainly use ETFs. Keep any single ETF under 35% and any single sector under 45%. Review once a week.");
  const ruleExplanation=(rule:InvestmentRule)=>{
    if(!isEnglish)return rule.explanation;
    if(rule.field==="single_asset_weight")return `Keep a single asset at or below ${percent(Number(rule.value))}`;
    if(rule.field==="sector_weight")return `Keep a single sector at or below ${percent(Number(rule.value))}`;
    if(rule.field==="chasing")return "Recheck the evidence after a sustained rise or when fear of missing out appears";
    if(rule.field==="trade_reason")return "Record a reason for every planned transaction";
    if(rule.field==="exit_condition")return "Record an exit or invalidation condition for every planned transaction";
    return rule.explanation;
  };
  const categoryLabel=(category:string)=>isEnglish?({portfolio:"Portfolio",behavior:"Behavior"}[category]??category):category;
  const assumption=(value:string)=>isEnglish?(value.includes("单一资产")?"A provisional 30% single-asset limit was used":value.includes("单一行业")?"A provisional 50% single-sector limit was used":value):value;
  const question=(value:string)=>isEnglish?(value.includes("单一资产")?"At what single-asset weight would you like a reminder?":value.includes("现金流")?"Which should be checked first: cash flow, profit growth or valuation?":value):value;
  const parse = () => { if (text.trim().length < 8) { setMessage(pick(isEnglish,"请至少写清一项仓位边界、关注重点或不想发生的行为。","Describe at least one position limit, research priority or behavior you want to avoid.")); return; } try { setDraft(parseProfile(text)); setMessage(""); } catch (error) { setMessage(isEnglish?"We could not turn that description into candidate rules.":error instanceof Error ? error.message : "无法解析"); } };
  return <div className="personal-content narrow"><section className="personal-page-heading"><span>{pick(isEnglish,"个人规则","Personal rules")}</span><h1>{pick(isEnglish,"先写下你的边界，再让系统检查","Set your boundaries before the system checks them")}</h1><p>{pick(isEnglish,"系统只把原话整理成候选规则。你确认之前，它不会影响任何检查结果。","Your description is only converted into candidate rules. Nothing affects a check until you confirm it.")}</p></section>
    {profile && <div className="personal-current-rule"><Check /><div><strong>{pick(isEnglish,`当前规则已生效 · ${rules.filter((item) => item.enabled).length} 条`,`${rules.filter((item) => item.enabled).length} active rules`)}</strong><span>{pick(isEnglish,`单一资产 ${percent(profile.maxSingleWeight)} · 行业 ${percent(profile.maxSectorWeight)} · ${profile.avoidChasing ? "避免追涨" : "未启用追涨提醒"}`,`Single asset ${percent(profile.maxSingleWeight)} · sector ${percent(profile.maxSectorWeight)} · ${profile.avoidChasing ? "chasing reminder on" : "chasing reminder off"}`)}</span></div></div>}
    <section className="personal-form-panel"><div className="profile-start-options"><span>{pick(isEnglish,"先选一个起点","Choose a starting point")}</span><div><button onClick={()=>{setText(strongTemplate);setDraft(undefined)}}>{pick(isEnglish,"强提醒","Strong reminders")}</button><button onClick={()=>{setText(standardTemplate);setDraft(undefined)}}>{pick(isEnglish,"标准提醒","Standard reminders")}</button><button onClick={()=>{setText("");setDraft(undefined)}}>{pick(isEnglish,"自己描述","Describe my own")}</button></div><small>{pick(isEnglish,"模板只是交互起点，不是投资配置建议。","Templates are starting points for the interface, not portfolio advice.")}</small></div><label><span>{pick(isEnglish,"用一句话补充或修改","Add or change the rules in one sentence")}</span><Textarea value={text} onChange={(event) => { setText(event.target.value); setMessage(""); }} rows={4} placeholder={pick(isEnglish,"例如：我主要配置 ETF，不追连续上涨，每周检查一次。","For example: I mainly use ETFs, avoid chasing sustained rises and review weekly.")} /></label><div className="personal-form-actions"><Button variant="outline" onClick={() => { setText(example); setDraft(undefined); setMessage(""); }}>{pick(isEnglish,"查看示例","Use an example")}</Button><Button onClick={parse}><Sparkles data-icon="inline-start" />{pick(isEnglish,"整理成候选规则","Create candidate rules")}</Button></div>{message && <p className="personal-error" role="alert">{message}</p>}</section>
    {draft && <section className="personal-confirm-panel"><header><div><span>{pick(isEnglish,"确认前预览","Review before confirming")}</span><h2>{pick(isEnglish,"系统从原话中整理出这些规则","Candidate rules extracted from your description")}</h2></div><Badge variant="outline">{pick(isEnglish,"尚未生效","Not active")}</Badge></header><div className="profile-limit-editor"><label><span>{pick(isEnglish,"单一资产上限","Single-asset limit")}</span><Input aria-label={pick(isEnglish,"单一资产上限百分比","Single-asset limit percentage")} type="number" min="1" max="100" value={Math.round(draft.profile.maxSingleWeight * 100)} onChange={(event) => setDraft(updateProfileLimit(draft, "maxSingleWeight", Number(event.target.value) / 100))} /></label><label><span>{pick(isEnglish,"单一行业上限","Single-sector limit")}</span><Input aria-label={pick(isEnglish,"单一行业上限百分比","Single-sector limit percentage")} type="number" min="1" max="100" value={Math.round(draft.profile.maxSectorWeight * 100)} onChange={(event) => setDraft(updateProfileLimit(draft, "maxSectorWeight", Number(event.target.value) / 100))} /></label></div><div className="personal-rule-table">{draft.rules.map((rule) => <label key={rule.id}><input type="checkbox" checked={rule.enabled} onChange={() => setDraft({ ...draft, rules: draft.rules.map((item) => item.id === rule.id ? { ...item, enabled: !item.enabled } : item) })} /><span><strong>{ruleExplanation(rule)}</strong><small>{categoryLabel(rule.category)} · {rule.priority === "high" ? pick(isEnglish,"重要","Important") : pick(isEnglish,"一般","Standard")}</small></span></label>)}</div>{draft.assumptions.length > 0 && <Alert><CircleAlert /><AlertTitle>{pick(isEnglish,"系统采用了默认理解","Default assumptions used")}</AlertTitle><AlertDescription>{assumption(draft.assumptions[0])}{pick(isEnglish,"；其余内容以后可以逐项修改。",". You can adjust the remaining items later.")}</AlertDescription></Alert>}{draft.questions.length > 0 && <div className="personal-questions"><strong>{pick(isEnglish,"这次只确认一个问题","Confirm one question for now")}</strong><p>{question(draft.questions[0])}</p><small>{pick(isEnglish,"其他未确认项会保留为“待完善”，不会替你决定。","Other unresolved items stay marked as incomplete; the system will not decide them for you.")}</small></div>}<footer><Button variant="outline" onClick={() => setDraft(undefined)}><X data-icon="inline-start" />{pick(isEnglish,"返回修改","Back to edit")}</Button><Button onClick={() => onSave(draft)}><Check data-icon="inline-start" />{pick(isEnglish,"确认并启用","Confirm and enable")}</Button></footer></section>}
  </div>;
}

const OPPORTUNITY_REASON_LABELS: Record<string, string> = {
  "基本面": "Fundamentals",
  "估值": "Valuation",
  "事件": "Event",
  "技术": "Technical signal",
  "资产配置": "Portfolio allocation",
  "他人推荐": "Someone else's recommendation",
  "还不确定": "Not sure yet",
};

const OPPORTUNITY_PERIOD_LABELS: Record<string, string> = {
  "几天到几周": "Days to weeks",
  "1—6 个月": "1–6 months",
  "半年以上": "More than 6 months",
  "还不确定": "Not sure yet",
};

const SOCIAL_SIGNAL_EN: Record<string, { category: string; fallbackExcerpt?: string; detail: string }> = {
  "时间压力": {
    category: "Time pressure",
    detail: "Urgent wording reduces the time available for verification. It cannot replace disclosures, financial reports or market data.",
  },
  "情绪化表达": {
    category: "Emotional wording",
    detail: "Emotional language describes how the message is framed; it does not establish asset quality or future performance.",
  },
  "权威暗示": {
    category: "Appeal to authority",
    detail: "A claimed identity or connection does not verify the information. Check the original source.",
  },
  "收益展示": {
    category: "Return showcase",
    detail: "The message highlights successful outcomes without showing losing cases, the time period or costs.",
  },
  "证据不足": {
    category: "Insufficient evidence",
    fallbackExcerpt: "No verifiable source provided",
    detail: "No disclosure, financial report or verifiable data was found in the text. Treat the claim as unverified.",
  },
  "风险缺失": {
    category: "Missing risk context",
    fallbackExcerpt: "Uncertainty is not discussed",
    detail: "The message does not state what would invalidate the claim, the possible drawdown or an adverse scenario.",
  },
};

function opportunitySignalCopy(signal: SocialAnalysis["signals"][number], isEnglish: boolean) {
  if (!isEnglish) return signal;
  const translated = SOCIAL_SIGNAL_EN[signal.category];
  if (!translated) return signal;
  const generatedExcerpt = signal.excerpt === "未提供可点击来源" || signal.excerpt === "未说明不确定性";
  return {
    ...signal,
    category: translated.category,
    excerpt: generatedExcerpt ? translated.fallbackExcerpt ?? signal.excerpt : signal.excerpt,
    detail: translated.detail,
  };
}

function precheckItemCopy(item: PrecheckResult["checks"][number], isEnglish: boolean) {
  if (!isEnglish) return item;
  const weightMatch = item.fact.match(/计划后 ([\d.]+)%，个人上限 ([\d.]+)%/);
  const recentChangeMatch = item.fact.match(/提供的近期涨幅为 ([\d.]+)%/);
  const similarAssetsMatch = item.fact.match(/已有相似资产：(.+)/);
  const socialScoreMatch = item.fact.match(/可观察跟风风险 (\d+)\/100/);
  const copies: Record<string, { title: string; fact: string; explanation: string }> = {
    "交易理由": {
      title: "Trade rationale",
      fact: "No verifiable rationale was provided",
      explanation: "Without a stated rationale, you cannot later check whether the original thesis has changed.",
    },
    "持有期限": {
      title: "Holding period",
      fact: "No expected holding period was provided",
      explanation: "Different time horizons require different evidence checks.",
    },
    "退出条件": {
      title: "Invalidation condition",
      fact: "No condition was provided for when the thesis may be wrong",
      explanation: "Without an invalidation condition, a later review can become a post-hoc explanation.",
    },
    "单一持仓": {
      title: "Single-position exposure",
      fact: weightMatch ? `After plan: ${weightMatch[1]}% · your limit: ${weightMatch[2]}%` : item.fact,
      explanation: "This is a concentration issue. It does not mean the asset itself is necessarily unsuitable.",
    },
    "行业集中": {
      title: "Sector concentration",
      fact: weightMatch ? `After plan: ${weightMatch[1]}% · your limit: ${weightMatch[2]}%` : item.fact,
      explanation: "Assets in the same sector may react to similar drivers at the same time.",
    },
    "近期涨幅": {
      title: "Recent price move",
      fact: recentChangeMatch ? `Recent change provided: ${recentChangeMatch[1]}%` : item.fact,
      explanation: "A recent rise does not establish the next direction. Recheck the underlying evidence.",
    },
    "重复暴露": {
      title: "Overlapping exposure",
      fact: similarAssetsMatch ? `Related asset already held: ${similarAssetsMatch[1]}` : item.fact,
      explanation: "Assets with different names may still be exposed to the same theme.",
    },
    "社交内容触发": {
      title: "Social-content signal",
      fact: socialScoreMatch ? `Observable herding-risk score: ${socialScoreMatch[1]}/100` : item.fact,
      explanation: "This reflects wording and evidence characteristics only; it does not judge the author's intent.",
    },
  };
  return { ...item, ...(copies[item.title] ?? {}) };
}

function OpportunitySurface({ profile, holdings, onSave }: { profile: InvestorProfile; holdings: Record<string, Holding>; onSave: (entry: { checkedAt: string; text: string; level: string; score: number }) => Promise<void> }) {
  const { isEnglish } = useI18n();
  const [text, setText] = useState("");
  const [sourceMode, setSourceMode] = useState<"text" | "image" | "url">("text");
  const [sourceUrl, setSourceUrl] = useState(""); const [imageName, setImageName] = useState("");
  const [code, setCode] = useState(""); const [amount, setAmount] = useState<number | "">(""); const [analysis, setAnalysis] = useState<SocialAnalysis>(); const [error, setError] = useState("");
  const [reasonCategory, setReasonCategory] = useState("他人推荐");
  const [holdingPeriod, setHoldingPeriod] = useState(""); const [exitCondition, setExitCondition] = useState(""); const [result, setResult] = useState<PrecheckResult>(); const [reviewStep,setReviewStep]=useState(1);
  const total = Object.values(holdings).reduce((sum, item) => sum + Number(item.value || 0), 0); const current = holdings[code]?.value ?? 0;
  const analyze = () => {
    if (text.trim().length < 8) { setError(pick(isEnglish, "请粘贴至少一句完整说法，保留其中的承诺、紧迫或来源描述。", "Paste at least one complete claim, including any promises, urgency or source description.")); return; }
    setError(""); const next = analyzeSocialContent(text); setAnalysis(next); setResult(undefined); setReviewStep(1);
    void onSave({ checkedAt: new Date().toISOString(), text: text.slice(0, 180), level: next.level, score: next.scores.following });
  };
  const precheck = () => { if(!/^\d{6}$/.test(code)){setError(pick(isEnglish, "请输入 6 位股票或 ETF 代码。", "Enter a 6-digit stock or ETF code."));setReviewStep(2);return;}if(Number(amount)<=0){setError(pick(isEnglish, "请输入计划金额，才能计算计划后的仓位。", "Enter a planned amount to calculate the post-plan exposure."));setReviewStep(2);return;}setError("");setResult(precheckTrade({ amount: Number(amount), portfolioValue: total || 200000, currentAssetValue: current, currentSectorValue: current, reason: `${reasonCategory}：${text}`, holdingPeriod, exitCondition, recentChange: 0, source: reasonCategory === "他人推荐" ? "social" : "self", similarAssets: current ? [holdings[code]?.name ?? code] : [] }, profile)); };
  const example = pick(isEnglish, "最近半导体新闻很多，朋友说公司有大订单，现在不上车就晚了。", "Semiconductor news is everywhere. A friend says the company won a large order, and that it will be too late if I do not get in now.");
  return <div className="personal-content opportunity"><section className="personal-page-heading"><span>{pick(isEnglish, "机会检查", "Claim check")}</span><h1>{pick(isEnglish, "先拆开这条说法，再看它是否符合你的规则", "Separate the claim from the evidence before applying your rules")}</h1><p>{pick(isEnglish, "粘贴社交平台文字、链接中的核心说法或截图文字。系统描述可观察特征，不判断作者动机。", "Paste text from a social post, the key claim from a link, or text from a screenshot. The check identifies observable patterns without judging the author's intent.")}</p></section>
    <section className="opportunity-input"><div className="opportunity-step-label"><b>1</b><span><strong>{pick(isEnglish, "先检查原话", "Check the original wording")}</strong><small>{pick(isEnglish, "此时不需要股票代码或计划金额", "No stock code or planned amount is needed yet")}</small></span></div><div className="opportunity-source-tabs"><button className={sourceMode === "text" ? "active" : undefined} onClick={() => setSourceMode("text")}>{pick(isEnglish, "粘贴文字", "Paste text")}</button><button className={sourceMode === "image" ? "active" : undefined} onClick={() => setSourceMode("image")}>{pick(isEnglish, "上传截图", "Upload screenshot")}</button><button className={sourceMode === "url" ? "active" : undefined} onClick={() => setSourceMode("url")}>{pick(isEnglish, "粘贴链接", "Paste link")}</button></div>{sourceMode === "image" && <label className="opportunity-upload"><input type="file" accept="image/*" onChange={(event) => setImageName(event.target.files?.[0]?.name ?? "")} /><span>{imageName || pick(isEnglish, "选择一张截图", "Choose a screenshot")}</span><small>{pick(isEnglish, "当前版本不上传图片；请把需要检查的文字粘贴到下方。", "This version does not upload the image. Paste the text you want to check below.")}</small></label>}{sourceMode === "url" && <label className="opportunity-url"><span>{pick(isEnglish, "内容链接", "Content link")}</span><Input type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://…" /><small>{pick(isEnglish, "当前只记录来源地址，不自动抓取需要登录的平台内容。", "The link is recorded as a source reference. Content behind a login is not fetched automatically.")}</small></label>}<Textarea value={text} onChange={(event) => { setText(event.target.value); setError(""); }} rows={5} placeholder={pick(isEnglish, "粘贴你看到的原话", "Paste the exact wording you saw")} />{error && !analysis && <p className="personal-error" role="alert">{error}</p>}<div className="opportunity-submit-row"><Button variant="outline" onClick={() => { setText(example); setError(""); setAnalysis(undefined); setResult(undefined); }}>{pick(isEnglish, "填入示例", "Use example")}</Button><Button onClick={analyze}><Gauge data-icon="inline-start" />{pick(isEnglish, "先检查内容", "Check content")}</Button></div><small>{pick(isEnglish, "先看语言和证据特征；只有你继续做交易计划检查时，才会询问代码和金额。", "This first pass checks wording and evidence. Code and amount are requested only if you continue to the trade-plan check.")}</small></section>
    {analysis && <><section className="opportunity-verdict"><div><span>{pick(isEnglish, "先看结论", "What needs attention")}</span><h2>{analysis.signals.length ? pick(isEnglish, `这条说法有 ${analysis.signals.length} 处需要先核对`, `${analysis.signals.length} ${analysis.signals.length === 1 ? "item needs" : "items need"} verification`) : pick(isEnglish, "没有发现明显催促话术", "No obvious urgency language found")}</h2><p>{analysis.scores.evidence < 50 ? pick(isEnglish, "目前没有足够来源确认其中的具体主张。", "The text does not include enough source information to verify its specific claims.") : pick(isEnglish, "已看到部分可核对信息，仍需打开原始来源。", "Some verifiable information is present, but the original source still needs to be opened.")}</p></div><aside><span>{pick(isEnglish, "与你的决定有什么关系", "What this means for your decision")}</span><strong>{analysis.scores.evidence < 50 ? pick(isEnglish, "不能把这条说法单独作为行动依据", "Do not treat this claim alone as a basis for action") : pick(isEnglish, "先确认来源，再结合价格与仓位", "Verify the source, then consider price and exposure")}</strong></aside></section><section className="social-findings"><header><span>{pick(isEnglish, "为什么需要核对", "Why these items need verification")}</span><Badge variant="outline">{pick(isEnglish, "原文证据", "Evidence from the text")}</Badge></header>{analysis.signals.map((rawSignal) => { const signal = opportunitySignalCopy(rawSignal, isEnglish); return <article key={`${rawSignal.category}-${rawSignal.excerpt}`}><span>{signal.category}</span><q>{signal.excerpt}</q><p>{signal.detail}</p></article>; })}<div className="social-unknown"><strong>{pick(isEnglish, "还缺什么", "What is still missing")}</strong><p>{pick(isEnglish, "公告或财报原文、信息发布日期，以及什么情况会推翻这项判断。", "The original disclosure or financial report, the publication date, and a condition that would invalidate the claim.")}</p></div></section>
      <section className="precheck-form progressive-check"><header><span>{pick(isEnglish, "继续检查交易计划", "Continue to the trade-plan check")} · {reviewStep}/3</span><p>{reviewStep===1?pick(isEnglish, "你为什么关注它？先选最接近的一项。", "Why are you considering it? Choose the closest option."):reviewStep===2?pick(isEnglish, "再补充标的和金额，用于计算计划后的仓位。", "Add the asset and amount to calculate your post-plan exposure."):pick(isEnglish, "最后确认时间范围和判断失效条件。", "Finally, set the time horizon and an invalidation condition.")}</p></header>
        {reviewStep===1&&<><div className="reason-options" role="group" aria-label={pick(isEnglish, "关注理由", "Reason for interest")}>{Object.keys(OPPORTUNITY_REASON_LABELS).map((item) => <button key={item} className={reasonCategory === item ? "active" : undefined} onClick={() => setReasonCategory(item)}>{pick(isEnglish, item, OPPORTUNITY_REASON_LABELS[item])}</button>)}</div><Button onClick={()=>setReviewStep(2)}>{pick(isEnglish, "下一步：填写计划", "Next: enter the plan")}<ArrowRight data-icon="inline-end"/></Button></>}
        {reviewStep===2&&<><div className="precheck-step-grid"><label><span>{pick(isEnglish, "股票 / ETF 代码", "Stock / ETF code")}</span><Input value={code} placeholder={pick(isEnglish, "6 位代码", "6-digit code")} inputMode="numeric" onChange={(event)=>{setCode(event.target.value.replace(/\D/g,"").slice(0,6));setError("")}}/></label><label><span>{pick(isEnglish, "计划金额", "Planned amount")}</span><Input type="number" value={amount} min="0" step="1000" placeholder={pick(isEnglish, "例如 30000", "e.g. 30000")} onChange={(event)=>{setAmount(event.target.value===""?"":Number(event.target.value));setError("")}}/></label></div>{error&&<p className="personal-error" role="alert">{error}</p>}<div className="progressive-actions"><Button variant="outline" onClick={()=>setReviewStep(1)}>{pick(isEnglish, "上一步", "Back")}</Button><Button onClick={()=>{if(!/^\d{6}$/.test(code)){setError(pick(isEnglish, "请输入 6 位股票或 ETF 代码。", "Enter a 6-digit stock or ETF code."));return;}if(Number(amount)<=0){setError(pick(isEnglish, "请输入计划金额，才能计算计划后的仓位。", "Enter a planned amount to calculate the post-plan exposure."));return;}setError("");setReviewStep(3)}}>{pick(isEnglish, "下一步：设定边界", "Next: set boundaries")}<ArrowRight data-icon="inline-end"/></Button></div></>}
        {reviewStep===3&&<><div><span className="field-caption">{pick(isEnglish, "预计持有多久", "Expected holding period")}</span><div className="reason-options" role="group" aria-label={pick(isEnglish, "预计持有期限", "Expected holding period")}>{Object.keys(OPPORTUNITY_PERIOD_LABELS).map((item)=><button key={item} className={holdingPeriod===item?"active":undefined} onClick={()=>setHoldingPeriod(item)}>{pick(isEnglish, item, OPPORTUNITY_PERIOD_LABELS[item])}</button>)}</div></div><label className="progressive-custom-field"><span>{pick(isEnglish, "什么情况说明判断可能错了", "What would suggest the thesis may be wrong?")}</span><Input value={exitCondition} onChange={(event)=>setExitCondition(event.target.value)} placeholder={pick(isEnglish, "可以先留空，结果页会明确提示", "You may leave this blank; the result will flag it clearly")} /></label><div className="progressive-actions"><Button variant="outline" onClick={()=>setReviewStep(2)}>{pick(isEnglish, "上一步", "Back")}</Button><Button onClick={precheck}><ShieldCheck data-icon="inline-start"/>{pick(isEnglish, "查看规则与组合影响", "Review rules and portfolio impact")}</Button></div></>}
      </section></>}
    {result && <PrecheckCard result={result} isEnglish={isEnglish} />}
  </div>;
}

function PrecheckCard({ result, isEnglish }: { result: PrecheckResult; isEnglish: boolean }) {
  const questions = isEnglish
    ? ["What would indicate that this thesis may be wrong?", "If the price fell 10%, which rule that you set in advance would guide your response?"]
    : result.questions;
  return <section className="precheck-result"><header><div><span>{pick(isEnglish, "第 2—4 步 · 规则、组合、待确认风险", "Steps 2–4 · rules, portfolio and unresolved risks")}</span><h2>{result.checks.length ? pick(isEnglish, `${result.checks.length} 项需要你复核`, `${result.checks.length} ${result.checks.length === 1 ? "item needs" : "items need"} your review`) : pick(isEnglish, "未触发已启用规则", "No enabled rule was triggered")}</h2></div><Badge variant={result.canContinue ? "secondary" : "outline"}>{result.canContinue ? pick(isEnglish, "可继续记录", "Ready to record") : pick(isEnglish, "先补充信息", "More information needed")}</Badge></header><div className="precheck-numbers"><div><span>{pick(isEnglish, "计划后单一持仓", "Single-position exposure after plan")}</span><strong>{percent(result.afterSingleWeight)}</strong><small>{pick(isEnglish, "第 2 步 · 个人规则", "Step 2 · personal rule")}</small></div><div><span>{pick(isEnglish, "计划后行业占比", "Sector exposure after plan")}</span><strong>{percent(result.afterSectorWeight)}</strong><small>{pick(isEnglish, "第 3 步 · 组合影响", "Step 3 · portfolio impact")}</small></div><div><span>{pick(isEnglish, "直接规则冲突", "Direct rule conflicts")}</span><strong>{result.violations.length}</strong><small>{pick(isEnglish, "需逐项确认", "Review each item")}</small></div></div><div className="precheck-list-heading"><span>{pick(isEnglish, "第 4 步", "Step 4")}</span><strong>{pick(isEnglish, "还有哪些风险需要确认", "Risks still requiring confirmation")}</strong></div>{result.checks.map((rawItem) => { const item = precheckItemCopy(rawItem, isEnglish); return <article key={`${rawItem.title}-${rawItem.fact}`}><Badge variant="outline">{pick(isEnglish, item.severity, item.severity === "高" ? "High" : item.severity === "中" ? "Medium" : "Low")}</Badge><div><strong>{item.title}</strong><span>{item.fact}</span><p>{item.explanation}</p></div></article>; })}<div className="personal-questions"><strong>{pick(isEnglish, "决定前再回答", "Answer before deciding")}</strong>{questions.map((item) => <p key={item}>{item}</p>)}</div><footer><Button variant="outline">{pick(isEnglish, "加入观察", "Add to watchlist")}</Button><Button variant="outline">{pick(isEnglish, "保存分析", "Save analysis")}</Button><Button variant="outline">{pick(isEnglish, "记录交易理由", "Record rationale")}</Button><Button>{pick(isEnglish, "稍后再决定", "Decide later")}</Button></footer></section>;
}

function WorkspaceSurface({workspace,workspaces}:{workspace:Workspace;workspaces:Workspace[]}) { return <DashboardEditor workspace={workspace} workspaces={workspaces}/>; }

export function LegacyWorkspaceSurface({ workspace, workspaces, canUndo, onSave, onUndo, onReset, onCreate, onDelete }: { workspace: Workspace; workspaces: Workspace[]; canUndo: boolean; onSave: (workspace: Workspace, changes?: string[]) => Promise<void>; onUndo: () => Promise<void>; onReset: () => Promise<void>; onCreate: (workspace: Workspace) => Promise<void>; onDelete: () => Promise<void> }) {
  const [draft, setDraft] = useState(workspace); const [instruction, setInstruction] = useState("把财报模块放到顶部，隐藏复杂 K 线，每周提醒一次持仓风险。"); const [preview, setPreview] = useState<ReturnType<typeof previewWorkspaceChange>>();
  const move = (index: number, direction: -1 | 1) => { const modules = [...draft.modules]; const target = index + direction; if (target < 0 || target >= modules.length) return; [modules[index], modules[target]] = [modules[target], modules[index]]; modules.forEach((item, order) => { item.order = order; }); setDraft({ ...draft, modules, updatedAt: new Date().toISOString() }); };
  const setTheme = (patch: Partial<WorkspaceTheme>) => setDraft({ ...draft, theme: { ...draft.theme, ...patch } });
  const missingModules = (Object.keys(MODULE_LABELS) as Array<keyof typeof MODULE_LABELS>).filter((type) => !draft.modules.some((item) => item.type === type));
  return <div className="personal-content"><section className="personal-page-heading split"><div><span>工作台设置</span><h1>只保留与你的投资方式有关的信息</h1><p>用一句话调整模块、密度和提醒。所有变化先预览，确认后才能应用，并保留撤销记录。</p></div><div className="workspace-heading-actions"><Button variant="outline" disabled={!canUndo} onClick={onUndo}><Undo2 data-icon="inline-start" />撤销上次</Button><Button variant="outline" onClick={() => { if (window.confirm("恢复长期基本面默认布局？当前版本仍可撤销。")) void onReset(); }}><RotateCcw data-icon="inline-start" />恢复默认</Button><Button variant="outline" disabled={workspaces.length <= 1} onClick={onDelete}><X data-icon="inline-start" />删除当前</Button><Button variant="outline" onClick={() => onCreate(createWorkspace("自定义工作台"))}><Plus data-icon="inline-start" />新建</Button></div></section>
    <section className="workspace-templates"><span>从模板新建</span><div>{["长期基本面", "ETF 配置", "波段交易", "新手学习", "社交风险检查", "自定义工作台"].map((template) => <button key={template} onClick={() => onCreate(createWorkspace(template))}>{template}</button>)}</div></section>
    <section className="workspace-theme-settings"><header><div><Palette /><span>主题与阅读</span></div><small>品牌色与市场涨跌色分开</small></header><div className="theme-preset-grid">{(Object.entries(THEME_LABELS) as Array<[WorkspaceTheme["themeId"], string]>).map(([themeId, label]) => <button key={themeId} className={draft.theme.themeId === themeId ? "active" : undefined} onClick={() => setTheme({ themeId, mode: themeId === "dark_focus" ? "dark" : "light", accent: themeId === "clear_blue" ? "blue" : themeId === "high_contrast" ? "slate" : "indigo" })}><i data-swatch={themeId} /><span>{label}</span>{draft.theme.themeId === themeId && <Check />}</button>)}</div><div className="theme-control-row"><label><span>字体</span><select value={draft.theme.fontScale} onChange={(event) => setTheme({ fontScale: event.target.value as WorkspaceTheme["fontScale"] })}><option value="small">紧凑</option><option value="medium">标准</option><option value="large">大字</option></select></label><label><span>圆角</span><select value={draft.theme.radius} onChange={(event) => setTheme({ radius: event.target.value as WorkspaceTheme["radius"] })}><option value="compact">紧凑</option><option value="standard">标准</option><option value="soft">柔和</option></select></label><label><span>图表</span><select value={draft.theme.chartStyle} onChange={(event) => setTheme({ chartStyle: event.target.value as WorkspaceTheme["chartStyle"] })}><option value="line">折线</option><option value="area">面积</option></select></label><label><span>动效</span><select value={draft.theme.motion} onChange={(event) => setTheme({ motion: event.target.value as WorkspaceTheme["motion"] })}><option value="standard">标准</option><option value="reduced">减少</option></select></label></div></section>
    <section className="workspace-settings"><div className="workspace-setting-row"><label><span>名称</span><Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label><span>信息密度</span><select value={draft.density} onChange={(event) => setDraft({ ...draft, density: event.target.value as Workspace["density"] })}><option value="simple">简洁</option><option value="standard">标准</option><option value="professional">专业</option></select></label><label><span>解释难度</span><select value={draft.explanationLevel ?? "beginner"} onChange={(event) => setDraft({ ...draft, explanationLevel: event.target.value as Workspace["explanationLevel"] })}><option value="beginner">新手白话</option><option value="intermediate">进阶</option><option value="professional">专业</option></select></label><label><span>提醒频率</span><select value={draft.alertFrequency} onChange={(event) => setDraft({ ...draft, alertFrequency: event.target.value as Workspace["alertFrequency"] })}><option value="off">关闭</option><option value="daily">每日</option><option value="weekly">每周</option><option value="monthly">每月</option><option value="event_based">事件触发</option></select></label><Button onClick={() => onSave(draft, ["手动保存名称、密度、解释难度、提醒频率或模块顺序"])}><Save data-icon="inline-start" />保存</Button></div><div className="workspace-module-list">{draft.modules.map((module, index) => <article key={module.type}><label><input type="checkbox" checked={module.visible} onChange={() => setDraft({ ...draft, modules: draft.modules.map((item) => item.type === module.type ? { ...item, visible: !item.visible } : item) })} /><span><strong>{MODULE_LABELS[module.type]}</strong><small>{module.visible ? "首页显示" : "已隐藏"}</small></span></label><div><Button variant="ghost" size="icon-sm" disabled={index === 0} aria-label="上移" onClick={() => move(index, -1)}><ArrowUp /></Button><Button variant="ghost" size="icon-sm" disabled={index === draft.modules.length - 1} aria-label="下移" onClick={() => move(index, 1)}><ArrowDown /></Button></div></article>)}</div></section>
    {missingModules.length > 0 && <section className="workspace-add-module"><span>添加模块</span><div>{missingModules.map((type) => <button key={type} onClick={() => setDraft({ ...draft, modules: [...draft.modules, { type, visible: true, order: draft.modules.length, width: "half", density: draft.density }] })}><Plus />{MODULE_LABELS[type]}</button>)}</div></section>}
    <section className="workspace-language"><header><span>用一句话调整</span><Badge variant="outline">确认后才生效</Badge></header><Textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} rows={3} placeholder="例如：我主要做 ETF，隐藏复杂 K 线，每周提醒一次风险" /><div className="workspace-command-examples">{["只显示简洁结论", "给我一个适合新手的界面", "恢复默认布局"].map((item) => <button key={item} onClick={() => { setInstruction(item); setPreview(previewWorkspaceChange(draft, item)); }}>{item}</button>)}</div><Button variant="outline" onClick={() => setPreview(previewWorkspaceChange(draft, instruction))}><Sparkles data-icon="inline-start" />生成配置预览</Button>{preview && <div className="workspace-preview"><strong>{preview.changes.length ? "即将修改" : "当前命令不能应用"}</strong>{preview.changes.map((item) => <p key={item}><Check />{item}</p>)}{preview.warnings.map((item) => <p className="warning" key={item}><CircleAlert />{item}</p>)}{preview.questions.map((item) => <p className="question" key={item}>{item}</p>)}<aside><strong>不会修改</strong><span>持仓数据 · 交易记录 · 投资规则 · 账户权限 · API Key</span></aside><div><Button variant="outline" onClick={() => setPreview(undefined)}>取消</Button><Button disabled={!preview.canApply} onClick={() => { setDraft(preview.preview); void onSave(preview.preview, preview.changes); setPreview(undefined); }}><Check data-icon="inline-start" />确认应用</Button></div></div>}</section>
    <aside className="workspace-count">所有界面配置变更都需要确认，并支持撤销。当前共有 {workspaces.length} 个工作台。</aside>
  </div>;
}

function PortfolioSurface({ holdings, profile }: { holdings: Record<string, Holding>; profile: InvestorProfile }) {
  const { isEnglish, locale } = useI18n();
  const [expandedSector, setExpandedSector] = useState<string>();
  const rows = Object.entries(holdings).map(([code, item]) => ({ code, ...item })); const total = rows.reduce((sum, item) => sum + Number(item.value || 0), 0); const largest = [...rows].sort((a, b) => b.value - a.value)[0]; const maxWeight = largest && total ? largest.value / total : 0;
  const missingSector=pick(isEnglish,"行业待核对","Sector not provided");
  const sectors = Object.entries(rows.reduce<Record<string, number>>((result, item) => { const key = item.industry ?? missingSector; result[key] = (result[key] ?? 0) + item.value; return result; }, {})).sort((a, b) => b[1] - a[1]);
  const money=(value:number)=>new Intl.NumberFormat(locale,{style:"currency",currency:"CNY",maximumFractionDigits:0}).format(value);
  const heading=<section className="personal-page-heading"><span>{pick(isEnglish,"组合检查","Portfolio check")}</span><h1>{pick(isEnglish,"先看资金暴露，再看单个标的","Start with exposure, then inspect individual assets")}</h1><p>{pick(isEnglish,"当前仅按你保存的持仓金额计算，不连接证券账户，也不补造实时市值。","Calculations use only the holdings you saved. No brokerage account is connected and no live market value is fabricated.")}</p></section>;
  if (!rows.length) return <div className="personal-content">{heading}<section className="portfolio-summary"><div><span>{pick(isEnglish,"组合金额","Portfolio value")}</span><strong>{pick(isEnglish,"暂无数据","No data")}</strong></div><div><span>{pick(isEnglish,"标的数量","Assets")}</span><strong>{pick(isEnglish,"暂无数据","No data")}</strong></div><div><span>{pick(isEnglish,"最大单一持仓","Largest position")}</span><strong>{pick(isEnglish,"暂无数据","No data")}</strong><small>{pick(isEnglish,"个人上限","Personal limit")} {percent(profile.maxSingleWeight)}</small></div></section><section className="portfolio-empty"><BriefcaseBusiness /><h2>{pick(isEnglish,"先加入一笔持仓，才能计算暴露","Add a holding to calculate exposure")}</h2><p>{pick(isEnglish,"可在股票研究页保存持仓，或导入交易 CSV 自动生成未平仓数量。","Save a holding from Stock Research, or import a trade CSV to calculate open quantities.")}</p><div><Link href="/analysis?view=research">{pick(isEnglish,"研究并加入持仓","Research and add a holding")}</Link><Link href="/trade-tool">{pick(isEnglish,"导入交易 CSV","Import trade CSV")}</Link></div></section></div>;
  return <div className="personal-content">{heading}<section className="portfolio-summary"><div><span>{pick(isEnglish,"组合金额","Portfolio value")}</span><strong>{total ? money(total) : pick(isEnglish,"暂无数据","No data")}</strong></div><div><span>{pick(isEnglish,"标的数量","Assets")}</span><strong>{rows.length || pick(isEnglish,"暂无数据","No data")}</strong></div><div><span>{pick(isEnglish,"最大单一持仓","Largest position")}</span><strong>{largest ? `${largest.name} ${percent(maxWeight)}` : pick(isEnglish,"暂无数据","No data")}</strong><small>{pick(isEnglish,"个人上限","Personal limit")} {percent(profile.maxSingleWeight)}</small></div></section><section className="exposure-explorer"><header><div><Eye /><span>{pick(isEnglish,"行业暴露可展开核对","Expand sector exposure for details")}</span></div><small>{pick(isEnglish,"点击查看构成与移除情景；不是调仓建议","Open a sector to inspect contributors and a removal scenario; this is not rebalancing advice")}</small></header>{sectors.map(([sector, value]) => { const weight = total ? value / total : 0; const contributors = rows.filter((item) => (item.industry ?? missingSector) === sector).sort((a, b) => b.value - a.value); const open = expandedSector === sector; const largestContributor = contributors[0]; const whatIf = total > (largestContributor?.value ?? 0) ? (value - (largestContributor?.value ?? 0)) / (total - (largestContributor?.value ?? 0)) : 0; return <article key={sector}><button aria-expanded={open} onClick={() => setExpandedSector(open ? undefined : sector)}><span><strong>{sector}</strong><small>{pick(isEnglish,`${contributors.length} 个标的共同贡献`,`${contributors.length} ${contributors.length===1?"asset":"assets"} contribute`)}</small></span><i><b style={{ width: `${Math.min(100, weight * 100)}%` }} /></i><strong>{percent(weight)}</strong><ChevronDown /></button>{open && <div><p>{pick(isEnglish,`主要构成：${contributors.map((item) => `${item.name} ${percent(item.value / total)}`).join("、")}`,`Main contributors: ${contributors.map((item) => `${item.name} ${percent(item.value / total)}`).join(", ")}`)}</p><p>{pick(isEnglish,`如果仅从情景中移除 ${largestContributor.name}，该行业暴露预计变为 ${percent(Math.max(0, whatIf))}。不代表必须卖出。`,`If ${largestContributor.name} were removed from this scenario, sector exposure would become ${percent(Math.max(0, whatIf))}. This does not mean it should be sold.`)}</p>{contributors.length > 1 && <Badge variant="outline">{pick(isEnglish,"可进一步核对底层重复暴露","Check for underlying overlap")}</Badge>}</div>}</article>; })}</section><section className="portfolio-list">{rows.map((item) => { const weight = total ? item.value / total : 0; return <article key={item.code}><div><strong>{item.name}</strong><span>{item.code} · {item.industry ?? missingSector}</span></div><div className="portfolio-weight"><i><b style={{ width: `${Math.min(100, weight * 100)}%` }} /></i><strong>{percent(weight)}</strong></div><span>{money(item.value)}</span></article>; })}</section></div>;
}

type ProviderDraft={providerId?:string;displayName:string;providerType:"compatible"|"openai"|"anthropic"|"ollama"|"vllm"|"llamacpp";baseUrl:string;model:string;apiMode:"chat"|"responses"|"native";apiKey:string;capabilities:AIProviderProfile["capabilities"]};
const PROVIDER_PRESETS={
  hkgai:{displayName:"我的 HKGAI",providerType:"compatible",baseUrl:"https://test-new-api.hkchat.app/v1",model:"",apiMode:"chat"},
  deepseek:{displayName:"我的 DeepSeek",providerType:"compatible",baseUrl:"https://api.deepseek.com/v1",model:"deepseek-chat",apiMode:"chat"},
  openai:{displayName:"我的 OpenAI",providerType:"openai",baseUrl:"https://api.openai.com/v1",model:"",apiMode:"chat"},
  claude:{displayName:"我的 Claude",providerType:"anthropic",baseUrl:"https://api.anthropic.com/v1",model:"",apiMode:"native"},
  ollama:{displayName:"我的 Ollama",providerType:"ollama",baseUrl:"http://127.0.0.1:11434/v1",model:"qwen3:8b",apiMode:"chat"},
  vllm:{displayName:"我的 vLLM",providerType:"vllm",baseUrl:"http://127.0.0.1:8001/v1",model:"",apiMode:"chat"},
  llamacpp:{displayName:"我的 llama.cpp",providerType:"llamacpp",baseUrl:"http://127.0.0.1:8080/v1",model:"",apiMode:"chat"},
  custom:{displayName:"自定义模型",providerType:"compatible",baseUrl:"",model:"",apiMode:"chat"},
} as const;
const DEFAULT_PROVIDER_DRAFT:ProviderDraft={...PROVIDER_PRESETS.hkgai,apiKey:"",capabilities:{conversation:true,workspaceCommand:true,preTradeCheck:true,etfAnalysis:true,portfolioRisk:true,quantRule:true,vision:false}};
const CAPABILITY_LABELS:Record<keyof AIProviderProfile["capabilities"],string>={conversation:"自由对话",workspaceCommand:"工作台配置",preTradeCheck:"交易前风险检查",etfAnalysis:"ETF 解释",portfolioRisk:"持仓解释",quantRule:"量化规则解析",vision:"图片分析"};
const CAPABILITY_LABELS_EN:Record<keyof AIProviderProfile["capabilities"],string>={conversation:"Open-ended chat",workspaceCommand:"Workspace configuration",preTradeCheck:"Pre-trade risk review",etfAnalysis:"ETF explanation",portfolioRisk:"Portfolio explanation",quantRule:"Quant rule parsing",vision:"Image analysis"};
const PROVIDER_DEFAULT_NAMES_EN:Record<string,string>={
  "我的 HKGAI":"My HKGAI","我的 DeepSeek":"My DeepSeek","我的 OpenAI":"My OpenAI","我的 Claude":"My Claude",
  "我的 Ollama":"My Ollama","我的 vLLM":"My vLLM","我的 llama.cpp":"My llama.cpp","自定义模型":"Custom model",
  "平台内置模型":"Built-in model","Ollama 本机模型":"Local Ollama","vLLM 推理服务":"vLLM inference service",
  "llama.cpp 本机模型":"Local llama.cpp","自定义兼容接口":"Custom compatible endpoint","本地规则模式":"Local rules mode",
};
const providerNameForLocale=(name:string|undefined,isEnglish:boolean)=>isEnglish&&name?PROVIDER_DEFAULT_NAMES_EN[name]??name:name??pick(isEnglish,"未连接","Not connected");
const providerModeLabel=(mode:AIProviderProfile["mode"],isEnglish:boolean)=>mode==="local"?pick(isEnglish,"本机模型","Local model"):mode==="platform"?pick(isEnglish,"平台内置模型","Built-in model"):mode==="rules"?pick(isEnglish,"确定性规则","Deterministic rules"):pick(isEnglish,"第三方 API","Third-party API");
const providerDescription=(description:string|undefined,isEnglish:boolean)=>{
  if(!description||!isEnglish)return description??"";
  const known:Record<string,string>={
    "用户无需 API Key；由平台托管的开源模型服务":"No API key required; this open-source model service is hosted by the platform",
    "第三方 API · Chat Completions":"Third-party API · Chat Completions",
    "第三方 OpenAI-compatible API":"Third-party OpenAI-compatible API",
    "第三方 Chat Completions 或 Responses API":"Third-party Chat Completions or Responses API",
    "第三方 Anthropic Messages API":"Third-party Anthropic Messages API",
    "本地部署 · 无需 API Key；不支持原生工具时使用受控 JSON 规划":"Local deployment · no API key required; uses controlled JSON planning when native tools are unavailable",
    "本地或私有服务器 · OpenAI-compatible":"Local or private server · OpenAI-compatible",
    "可选 GGUF 本地推理服务 · 默认使用 JSON 规划":"Optional local GGUF inference service · uses JSON planning by default",
    "管理员配置的兼容接口":"Administrator-configured compatible endpoint",
    "确定性工具可用；不会伪装成生成式 AI":"Deterministic tools are available; the product will not pretend they are generative AI",
    "个人本机推理连接":"Personal local inference connection","个人加密模型连接":"Personal encrypted model connection",
  };
  return known[description]??description;
};
const providerPrivacy=(label:string|undefined,isEnglish:boolean)=>{
  if(!label||!isEnglish)return label??"";
  return ({
    "模型请求仅发送到已配置的本机推理服务":"Model requests are sent only to the configured local inference service",
    "模型请求由安心看股服务器处理":"Model requests are processed by the Market Clarity server",
    "不调用生成式模型":"No generative model is called",
    "内容会发送到所选第三方模型服务":"Content is sent to the selected third-party model service",
  } as Record<string,string>)[label]??label;
};
const providerSecretLabel=(label:string|undefined,isEnglish:boolean)=>isEnglish?label==="不需要"?"Not required":label==="未配置"?"Not configured":label==="平台托管"?"Platform managed":label??"":label??"";
const providerMessage=(value:string|undefined,isEnglish:boolean,fallbackZh:string,fallbackEn:string)=>{
  const message=value??pick(isEnglish,fallbackZh,fallbackEn);
  if(!isEnglish)return message;
  const exact:Record<string,string>={
    "默认模型已切换":"Default model changed","隐私模式已更新":"Privacy mode updated","本地隐私模式已开启；不会调用外部模型":"Local privacy mode is on; external models will not be called",
    "本地隐私模式已关闭":"Local privacy mode is off","连接成功":"Connection successful","连接检查完成":"Connection check complete",
    "本地规则模式可用":"Local rules mode is available","模型尚未完成服务器端配置。":"The model has not been configured on the server.",
    "模型连接和密钥引用已删除":"The model connection and key reference were deleted","删除失败":"Delete failed",
    "请填写 API Key":"Enter an API key","请先填写 API Key，再自动获取模型":"Enter an API key before fetching models",
    "没有取得可用模型":"No available models were returned","无法获取模型列表":"Could not fetch the model list","保存失败":"Save failed",
    "模型已保存，但设为默认失败":"The model was saved, but could not be set as default","无法修改隐私模式":"Could not update privacy mode",
    "无法切换模型":"Could not switch models","连接失败，请检查配置。":"Connection failed. Check the configuration.",
  };
  if(exact[message])return exact[message];
  const fragments:Array<[string,string]>=[
    ["模型连接超时","Model connection timed out"],["API Key 无效或未授权","The API key is invalid or unauthorized"],
    ["API 配额不足或请求过于频繁","API quota is exhausted or requests are being rate-limited"],["服务暂时不可用","The service is temporarily unavailable"],
    ["模型返回空内容","The model returned an empty response"],["没有找到该模型","Model not found"],
    ["不支持该模型提供商","This model provider is not supported"],["当前提供商不支持自动获取模型","This provider does not support automatic model discovery"],
    ["模型列表","Model list"],["连接失败","Connection failed"],["请检查配置","Check the configuration"],
  ];
  return fragments.reduce((translated,[zh,en])=>translated.replaceAll(zh,en),message);
};

function AISettingsSurface({ initialProviders,initialPrivacyMode,onProvidersChange,onPrivacyModeChange }: { initialProviders: AIProviderProfile[];initialPrivacyMode:boolean;onProvidersChange:(providers:AIProviderProfile[])=>void;onPrivacyModeChange:(enabled:boolean)=>void }) {
  const {isEnglish}=useI18n();
  const [providers,setProviders]=useState<AIProviderProfile[]>(initialProviders); const [testing,setTesting]=useState<string>(); const [message,setMessage]=useState("");
  const [privacyMode,setPrivacyMode]=useState(initialPrivacyMode); const [privacySaving,setPrivacySaving]=useState(false);
  const [formOpen,setFormOpen]=useState(false); const [draft,setDraft]=useState<ProviderDraft>(DEFAULT_PROVIDER_DRAFT); const [showKey,setShowKey]=useState(false); const [saving,setSaving]=useState(false); const [discovering,setDiscovering]=useState(false); const [modelOptions,setModelOptions]=useState<string[]>([]); const [formResult,setFormResult]=useState<{success:boolean;message:string;latency?:number}>();
  const replaceProviders=(next:AIProviderProfile[])=>{setProviders(next);onProvidersChange(next);window.dispatchEvent(new CustomEvent("anxin:providers-updated"));};
  const refresh=async()=>{const response=await fetch("/api/ai/providers",{cache:"no-store"});const payload=await response.json() as {providers?:AIProviderProfile[];privacy_mode?:boolean};if(response.ok&&payload.providers){replaceProviders(payload.providers);setPrivacyMode(Boolean(payload.privacy_mode));onPrivacyModeChange(Boolean(payload.privacy_mode));}};
  const togglePrivacy=async(enabled:boolean)=>{setPrivacySaving(true);setMessage("");try{const response=await fetch("/api/ai/privacy",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({enabled})});const payload=await response.json() as {message?:string};if(!response.ok)throw new Error(providerMessage(payload.message,isEnglish,"无法修改隐私模式","Could not update privacy mode"));setPrivacyMode(enabled);setMessage(providerMessage(payload.message,isEnglish,"隐私模式已更新","Privacy mode updated"));await refresh();}catch(error){setMessage(error instanceof Error?providerMessage(error.message,isEnglish,"无法修改隐私模式","Could not update privacy mode"):pick(isEnglish,"无法修改隐私模式","Could not update privacy mode"));}finally{setPrivacySaving(false);}};
  const setDefault=async(provider:AIProviderProfile)=>{setMessage("");const response=await fetch(`/api/ai/providers/${provider.providerId}/set-default`,{method:"POST"});const payload=await response.json() as {success?:boolean;message?:string};setMessage(providerMessage(payload.message,isEnglish,response.ok?"默认模型已切换":"无法切换模型",response.ok?"Default model changed":"Could not switch models"));if(response.ok)await refresh();};
  const test=async(provider:AIProviderProfile)=>{setTesting(provider.providerId);setMessage("");try{const response=await fetch(`/api/ai/providers/${provider.providerId}/test`,{method:"POST"});const payload=await response.json() as {success?:boolean;message?:string;latency_ms?:number;fallback_available?:boolean};const base=providerMessage(payload.message,isEnglish,"连接检查完成","Connection check complete");setMessage(`${base}${payload.success&&payload.latency_ms!==undefined?` · ${payload.latency_ms} ms`:payload.fallback_available?pick(isEnglish," 可重试、切换模型或继续使用规则版结果。"," Retry, switch models, or continue with rule-based results."):""}`);}catch{setMessage(isEnglish?`${providerNameForLocale(provider.displayName,true)} is currently unavailable. Retry, switch models, or continue with rule-based results.`:`${provider.displayName} 当前连接失败。可重试、切换模型或继续使用规则版结果。`);}finally{setTesting(undefined);}};
  const selectPreset=(key:keyof typeof PROVIDER_PRESETS)=>{const preset=PROVIDER_PRESETS[key];setDraft((current)=>({...current,...preset,displayName:providerNameForLocale(preset.displayName,isEnglish),providerId:undefined,apiKey:""}));setModelOptions([]);setFormResult(undefined);};
  const edit=(provider:AIProviderProfile)=>{setDraft({providerId:provider.providerId,displayName:provider.displayName,providerType:provider.providerType==="mock"?"compatible":provider.providerType,baseUrl:provider.baseUrl,model:provider.model,apiMode:provider.apiMode,apiKey:"",capabilities:provider.capabilities});setFormOpen(true);setFormResult(undefined);window.scrollTo({top:0,behavior:"smooth"});};
  const keyless=["ollama","vllm","llamacpp"].includes(draft.providerType);
  const requestModels=async(current:ProviderDraft)=>{const response=await fetch("/api/ai/providers/discover",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(current)});const payload=await response.json() as {models?:string[];message?:string};if(!response.ok||!payload.models?.length)throw new Error(providerMessage(payload.message,isEnglish,"没有取得可用模型","No available models were returned"));return payload.models;};
  const testDraft=async()=>{setTesting("draft");setFormResult(undefined);try{let candidate=draft;if(!candidate.model.trim()){const models=await requestModels(candidate);setModelOptions(models);candidate={...candidate,model:models[0]};setDraft(candidate);}const response=await fetch("/api/ai/providers/test",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(candidate)});const payload=await response.json() as {success?:boolean;message?:string;latency_ms?:number};const result=providerMessage(payload.message,isEnglish,"连接检查完成","Connection check complete");setFormResult({success:Boolean(payload.success),message:payload.success?`${result}${pick(isEnglish,"。保存后会自动用于已启用的 AI 任务。",". Once saved, it will be used automatically for enabled AI tasks.")}`:result,latency:payload.latency_ms});}catch(error){setFormResult({success:false,message:error instanceof Error?providerMessage(error.message,isEnglish,"连接失败，请检查配置。","Connection failed. Check the configuration."):pick(isEnglish,"连接失败，请检查配置。","Connection failed. Check the configuration.")});}finally{setTesting(undefined);}};
  const discoverModels=async()=>{setDiscovering(true);setFormResult(undefined);try{const models=await requestModels(draft);setModelOptions(models);setDraft((current)=>({...current,model:models.includes(current.model)?current.model:models[0]}));setFormResult({success:true,message:isEnglish?`Found ${models.length} available models and selected ${models[0]}. Test the connection next.`:`已取得 ${models.length} 个可用模型，并选中 ${models[0]}。请再测试连接。`});}catch(error){setFormResult({success:false,message:error instanceof Error?providerMessage(error.message,isEnglish,"无法获取模型列表","Could not fetch the model list"):pick(isEnglish,"无法获取模型列表","Could not fetch the model list")});}finally{setDiscovering(false);}};
  const save=async()=>{setSaving(true);setFormResult(undefined);try{const target=draft.providerId?`/api/ai/providers/${draft.providerId}`:"/api/ai/providers";const response=await fetch(target,{method:draft.providerId?"PUT":"POST",headers:{"content-type":"application/json"},body:JSON.stringify(draft)});const payload=await response.json() as AIProviderProfile&{message?:string};if(!response.ok)throw new Error(providerMessage(payload.message,isEnglish,"保存失败","Save failed"));const defaultResponse=await fetch(`/api/ai/providers/${payload.providerId}/set-default`,{method:"POST"});const defaultPayload=await defaultResponse.json() as {message?:string};if(!defaultResponse.ok)throw new Error(providerMessage(defaultPayload.message,isEnglish,"模型已保存，但设为默认失败","The model was saved, but could not be set as default"));await refresh();setMessage(isEnglish?`${providerNameForLocale(payload.displayName,true)} was saved securely and set as default. Future AI tasks will use it automatically.`:`${payload.displayName} 已安全保存并设为默认，后续 AI 任务会自动调用。`);setFormOpen(false);setDraft({...DEFAULT_PROVIDER_DRAFT,displayName:providerNameForLocale(DEFAULT_PROVIDER_DRAFT.displayName,isEnglish)});}catch(error){setFormResult({success:false,message:error instanceof Error?providerMessage(error.message,isEnglish,"保存失败","Save failed"):pick(isEnglish,"保存失败","Save failed")});}finally{setSaving(false);}};
  const remove=async(provider:AIProviderProfile)=>{if(!window.confirm(isEnglish?`Delete “${providerNameForLocale(provider.displayName,true)}” and its encrypted key?`:`删除“${provider.displayName}”及其加密密钥？`))return;const response=await fetch(`/api/ai/providers/${provider.providerId}`,{method:"DELETE"});const payload=await response.json() as {message?:string};setMessage(response.ok?pick(isEnglish,"模型连接和密钥引用已删除","The model connection and key reference were deleted"):providerMessage(payload.message,isEnglish,"删除失败","Delete failed"));if(response.ok)await refresh();};
  const current=providers.find(item=>item.isDefault);
  const configuredProviders=providers.filter((provider)=>provider.providerId==="mock"||provider.connectionStatus==="available"||provider.editable);
  const unavailableProviders=providers.filter((provider)=>provider.providerId!=="mock"&&provider.connectionStatus!=="available"&&!provider.editable);
  return <div className="personal-content ai-settings-content">
    <section className="personal-page-heading split"><div><span>{pick(isEnglish,"模型设置","Model settings")}</span><h1>{pick(isEnglish,"先看当前可用能力，再决定是否接入模型","See what works now, then connect a model if you need one")}</h1><p>{pick(isEnglish,"规则计算、持仓诊断和回测不依赖大模型。自由问答、自然语言配置和文字解释需要可用模型。","Rule calculations, portfolio diagnostics and backtests do not require a language model. Open-ended chat, natural-language configuration and generated explanations do.")}</p></div><div className="ai-heading-actions"><Link href="/evaluation"><ShieldCheck/>{pick(isEnglish,"查看质量评测","View quality evaluation")}</Link><Button onClick={()=>{setFormOpen(true);setDraft({...DEFAULT_PROVIDER_DRAFT,displayName:providerNameForLocale(DEFAULT_PROVIDER_DRAFT.displayName,isEnglish)});setFormResult(undefined)}}><Plus data-icon="inline-start"/>{pick(isEnglish,"接入个人模型","Connect a personal model")}</Button></div></section>
    <section className="ai-default-provider"><div className="ai-default-symbol"><Cpu/></div><div><span>{pick(isEnglish,"当前使用","Currently using")}</span><h2>{providerNameForLocale(current?.displayName,isEnglish)}</h2><p>{current?.model||pick(isEnglish,"模型名称待配置","Model not configured")} · {providerModeLabel(current?.mode,isEnglish)}</p></div><div className="ai-default-state"><Badge variant={current?.connectionStatus==="available"?"secondary":"outline"}>{current?.providerId==="mock"?pick(isEnglish,"规则检查可用","Rule checks available"):current?.connectionStatus==="available"?pick(isEnglish,"已连接","Connected"):pick(isEnglish,"未配置","Not configured")}</Badge><small>{current?.providerId==="mock"?pick(isEnglish,"生成式开源模型尚未部署","No hosted generative model is currently deployed"):providerPrivacy(current?.privacyLabel,isEnglish)||(current?.secretStatus==="server_configured"?pick(isEnglish,"服务器端密钥","Server-side key"):pick(isEnglish,"状态待核对","Status needs review"))}</small></div><div className="ai-provider-actions"><Button variant="outline" onClick={()=>current&&void test(current)} disabled={!current||testing===current.providerId}>{testing===current?.providerId?pick(isEnglish,"正在测试","Testing"):pick(isEnglish,"检查状态","Check status")}</Button>{current?.editable&&<Button variant="outline" onClick={()=>edit(current)}>{pick(isEnglish,"编辑","Edit")}</Button>}</div></section>
    <section className="ai-auto-routing-note"><Sparkles/><div><strong>{pick(isEnglish,"保存一次，之后自动调用","Save once, then use automatically")}</strong><p>{pick(isEnglish,"设为默认后，自由对话、工作台配置、交易前解释、ETF 与持仓解释、量化规则解析会按已启用用途自动使用该模型；失败时保留规则结果并明确提示，不会伪装成 AI 回答。","Once set as default, the model is used automatically for the enabled tasks: chat, workspace configuration, pre-trade explanations, ETF and portfolio explanations, and quant-rule parsing. If it fails, deterministic results are preserved and the failure is shown clearly.")}</p></div></section>
    <section className="ai-privacy-mode"><div><ShieldCheck/><span><strong>{pick(isEnglish,"仅使用本机模型","Use local models only")}</strong><small>{pick(isEnglish,"开启后，持仓和交易内容不会发送到 HKGAI、DeepSeek、OpenAI、Claude 或平台云端模型。","When enabled, portfolio and trade content is not sent to HKGAI, DeepSeek, OpenAI, Claude or a platform-hosted cloud model.")}</small></span></div><label><input type="checkbox" checked={privacyMode} disabled={privacySaving} onChange={(event)=>void togglePrivacy(event.target.checked)}/><span>{privacyMode?pick(isEnglish,"已开启","On"):pick(isEnglish,"未开启","Off")}</span></label></section>
    {formOpen&&<section className="ai-connection-form" aria-label={pick(isEnglish,"接入 AI 模型","Connect an AI model")}><header><div><KeyRound/><span><strong>{draft.providerId?pick(isEnglish,"编辑个人模型","Edit personal model"):pick(isEnglish,"接入个人模型","Connect a personal model")}</strong><small>{keyless?pick(isEnglish,"本机推理无需 API Key；云端页面不能直接访问你电脑上的 localhost","Local inference does not require an API key. A deployed site cannot reach localhost on your computer."):pick(isEnglish,"Key 只在提交时发送给后端；页面不会保存或回显","The key is sent to the backend only when submitted; this page does not store or reveal it.")}</small></span></div><Button variant="ghost" size="icon" onClick={()=>setFormOpen(false)} aria-label={pick(isEnglish,"取消","Cancel")}><X/></Button></header><div className="ai-provider-presets">{Object.entries({hkgai:"HKGAI",deepseek:"DeepSeek",openai:"OpenAI",claude:"Claude",ollama:"Ollama",vllm:"vLLM",llamacpp:"llama.cpp",custom:pick(isEnglish,"自定义","Custom")}).map(([key,label])=><button type="button" key={key} onClick={()=>selectPreset(key as keyof typeof PROVIDER_PRESETS)} className={draft.displayName.toLowerCase().includes(key==="openai"?"openai":key)?"active":undefined}>{label}</button>)}</div><div className="ai-form-grid"><label><span>{pick(isEnglish,"显示名称","Display name")}</span><Input value={draft.displayName} onChange={(event)=>setDraft({...draft,displayName:event.target.value})}/></label><label><span>{pick(isEnglish,"提供商类型","Provider type")}</span><select value={draft.providerType} onChange={(event)=>setDraft({...draft,providerType:event.target.value as ProviderDraft["providerType"]})}><option value="compatible">OpenAI-compatible</option><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="ollama">Ollama</option><option value="vllm">vLLM</option><option value="llamacpp">llama.cpp</option></select></label>{!keyless&&<label className="wide"><span>API Key {draft.providerId&&<small>{pick(isEnglish,"留空则保留原 Key","Leave blank to keep the existing key")}</small>}</span><div className="ai-key-input"><Input type={showKey?"text":"password"} autoComplete="new-password" value={draft.apiKey} onChange={(event)=>setDraft({...draft,apiKey:event.target.value})} placeholder={draft.providerId?pick(isEnglish,"留空则不替换","Leave blank to keep it"):pick(isEnglish,"请输入 API Key","Enter API key")}/><button type="button" onClick={()=>setShowKey((show)=>!show)} aria-label={showKey?pick(isEnglish,"隐藏 API Key","Hide API key"):pick(isEnglish,"显示 API Key","Show API key")}>{showKey?<EyeOff/>:<Eye/>}</button></div></label>}<label className="wide"><span>Base URL</span><Input type="url" value={draft.baseUrl} onChange={(event)=>setDraft({...draft,baseUrl:event.target.value})} placeholder="https://.../v1"/><small>{keyless?pick(isEnglish,"本地开发可使用 127.0.0.1；部署后的网页需要服务器可访问的 HTTPS 推理地址。","Local development can use 127.0.0.1. A deployed site needs an HTTPS inference endpoint that the server can reach."):pick(isEnglish,"请使用服务商提供的 API Base URL","Use the API base URL supplied by the provider.")}</small></label><label><span>{pick(isEnglish,"模型名称","Model name")}</span>{modelOptions.length?<select value={draft.model} onChange={(event)=>setDraft({...draft,model:event.target.value})}>{modelOptions.map(model=><option key={model} value={model}>{model}</option>)}</select>:<Input value={draft.model} onChange={(event)=>setDraft({...draft,model:event.target.value})} placeholder={keyless?pick(isEnglish,"例如 qwen3:8b","For example, qwen3:8b"):pick(isEnglish,"先点击下方“获取可用模型”","Fetch available models below")}/>}<small>{keyless?pick(isEnglish,"填写推理服务中已经安装的模型 ID。","Enter the model ID already installed in the inference service."):pick(isEnglish,"模型 ID 必须由当前服务商提供；无需猜测。","The model ID must come from the provider; do not guess it.")}</small></label><label><span>{pick(isEnglish,"调用模式","API mode")}</span><select value={draft.apiMode} onChange={(event)=>setDraft({...draft,apiMode:event.target.value as ProviderDraft["apiMode"]})}><option value="chat">Chat Completions</option>{draft.providerType==="openai"&&<option value="responses">Responses</option>}{draft.providerType==="anthropic"&&<option value="native">Native Messages</option>}</select></label></div><fieldset className="ai-capabilities"><legend>{pick(isEnglish,"模型用途","Model uses")}</legend>{(Object.keys(CAPABILITY_LABELS) as Array<keyof AIProviderProfile["capabilities"]>).map((key)=><label key={key}><input type="checkbox" checked={draft.capabilities[key]} onChange={(event)=>setDraft({...draft,capabilities:{...draft.capabilities,[key]:event.target.checked}})}/><span>{isEnglish?CAPABILITY_LABELS_EN[key]:CAPABILITY_LABELS[key]}</span></label>)}</fieldset>{formResult&&<Alert className={formResult.success?"ai-test-success":"ai-test-error"}><PlugZap/><AlertTitle>{formResult.success?pick(isEnglish,"连接成功","Connection successful"):pick(isEnglish,"连接失败","Connection failed")}</AlertTitle><AlertDescription>{formResult.message}{formResult.success&&formResult.latency!==undefined?` · ${formResult.latency} ms`:""}</AlertDescription></Alert>}<footer><Button variant="outline" onClick={()=>void testDraft()} disabled={testing==="draft"||(!keyless&&!draft.apiKey)}>{testing==="draft"?pick(isEnglish,"正在连接","Connecting"):pick(isEnglish,"测试并识别模型","Test and identify model")}</Button><Button onClick={()=>void save()} disabled={saving||!draft.displayName||!draft.baseUrl||!draft.model||(!draft.providerId&&!draft.apiKey&&!keyless)}>{saving?pick(isEnglish,"正在安全保存","Saving securely"):pick(isEnglish,"保存并设为默认","Save and set as default")}</Button><Button variant="ghost" onClick={()=>setFormOpen(false)}>{pick(isEnglish,"取消","Cancel")}</Button></footer><aside><ShieldCheck/>{keyless?pick(isEnglish,"未检测到模型时会明确显示不可用，不会返回 Mock 冒充 AI。","If no model is detected, the service is shown as unavailable; a mock response will not be presented as AI."):pick(isEnglish,"保存后自动用于所选任务；API Key 不进入 URL、本地存储、会话记录或普通日志。","After saving, it is used automatically for selected tasks. The API key is not placed in URLs, local storage, conversation history or ordinary logs.")}</aside></section>}
    {formOpen&&<section className="ai-model-discovery"><div><strong>{pick(isEnglish,"不知道模型名称？","Do not know the model name?")}</strong><p>{keyless?pick(isEnglish,"启动本机推理服务后，可从当前地址读取已安装模型。","After starting the local inference service, installed models can be read from this address."):pick(isEnglish,"先填写 API Key；平台只用它读取当前服务商的模型列表，不会在此步骤保存。","Enter the API key first. It is used only to read the provider's model list and is not saved at this step.")}</p></div><Button variant="outline" onClick={()=>void discoverModels()} disabled={discovering||(!keyless&&!draft.apiKey)||!draft.baseUrl}>{discovering?pick(isEnglish,"正在获取","Fetching"):pick(isEnglish,"自动获取模型","Fetch models automatically")}</Button>{modelOptions.length>0&&<label><span>{pick(isEnglish,"可用模型","Available models")}</span><select value={draft.model} onChange={(event)=>setDraft({...draft,model:event.target.value})}>{modelOptions.map((model)=><option key={model} value={model}>{model}</option>)}</select></label>}</section>}
    {message&&<Alert className="ai-settings-message"><CircleAlert/><AlertTitle>{pick(isEnglish,"模型状态","Model status")}</AlertTitle><AlertDescription>{message}</AlertDescription></Alert>}
    <section className="ai-configured-heading"><div><span>{pick(isEnglish,"当前可用","Available now")}</span><small>{pick(isEnglish,"只显示已连接模型和规则工具","Connected models and rule tools only")}</small></div></section><section className="ai-provider-list">{configuredProviders.map(provider=><article key={provider.providerId}><div className="ai-provider-main"><span className={provider.connectionStatus==="available"?"connected":"disabled"}/><div><strong>{providerNameForLocale(provider.displayName,isEnglish)}{provider.isDefault&&<Badge variant="secondary">{pick(isEnglish,"当前","Current")}</Badge>}{provider.isPlatformDefault&&<Badge variant="outline">{pick(isEnglish,"平台默认","Platform default")}</Badge>}</strong><p>{providerModeLabel(provider.mode,isEnglish)} · {provider.model||pick(isEnglish,"模型待配置","Model not configured")}</p><small>{providerDescription(provider.description,isEnglish)}</small><div className="ai-capability-tags">{provider.modelCapabilities?.toolCalling&&<Badge variant="outline">{pick(isEnglish,"工具调用","Tool calling")}</Badge>}{provider.modelCapabilities?.jsonMode&&<Badge variant="outline">JSON</Badge>}{provider.modelCapabilities?.vision&&<Badge variant="outline">{pick(isEnglish,"图片","Vision")}</Badge>}{provider.modelCapabilities?.contextWindow>0&&<Badge variant="outline">{Math.round(provider.modelCapabilities.contextWindow/1024)}K {pick(isEnglish,"上下文","context")}</Badge>}</div></div></div><div className="ai-provider-secret"><span>{pick(isEnglish,"当前状态","Current status")}</span><strong>{provider.providerId==="mock"?pick(isEnglish,"规则可用","Rules available"):provider.connectionStatus==="available"?pick(isEnglish,"已连接","Connected"):pick(isEnglish,"未配置","Not configured")}</strong><small>{providerSecretLabel(provider.apiKeyMasked,isEnglish)}</small></div><div className="ai-provider-actions"><Button variant="outline" onClick={()=>void test(provider)} disabled={testing===provider.providerId}>{testing===provider.providerId?pick(isEnglish,"正在检查","Checking"):pick(isEnglish,"检查状态","Check status")}</Button><Button variant="outline" disabled={provider.isDefault||provider.connectionStatus!=="available"||(privacyMode&&!(["local","rules"] as string[]).includes(provider.mode))} onClick={()=>void setDefault(provider)}>{provider.isDefault?pick(isEnglish,"当前使用","In use"):pick(isEnglish,"使用此模型","Use this model")}</Button>{provider.editable&&<Button variant="ghost" onClick={()=>edit(provider)}>{pick(isEnglish,"编辑","Edit")}</Button>}{provider.editable&&<Button variant="ghost" size="icon-sm" onClick={()=>void remove(provider)} aria-label={isEnglish?`Delete ${providerNameForLocale(provider.displayName,true)}`:`删除 ${provider.displayName}`}><Trash2/></Button>}</div></article>)}</section>
    {unavailableProviders.length>0&&<section className="ai-connect-catalog"><div><strong>{pick(isEnglish,"更多模型选项","More model options")}</strong><p>{pick(isEnglish,"当前模型可以继续使用；如有需要，也可以连接其他 HKGAI、DeepSeek、OpenAI、Claude 或兼容接口。","Your current model remains active. You can also connect another HKGAI, DeepSeek, OpenAI, Claude or compatible endpoint when needed.")}</p><small>{pick(isEnglish,"还可接入","Also available")}: {unavailableProviders.map((provider)=>providerNameForLocale(provider.displayName,isEnglish)).join(" · ")}</small></div><Button variant="outline" onClick={()=>{setFormOpen(true);setDraft({...DEFAULT_PROVIDER_DRAFT,displayName:providerNameForLocale(DEFAULT_PROVIDER_DRAFT.displayName,isEnglish)});setFormResult(undefined);window.scrollTo({top:0,behavior:"smooth"})}}>{pick(isEnglish,"添加模型","Add a model")}</Button></section>}
    <section className="ai-provider-admin-note"><ShieldCheck/><div><strong>{pick(isEnglish,"服务器端密钥安全","Server-side key security")}</strong><p>{pick(isEnglish,"个人 Key 使用服务器主密钥加密后存入与你登录账号隔离的数据库；浏览器不会取得解密后的 Key。","Personal keys are encrypted with the server master key and stored in a database isolated to your account. The browser never receives the decrypted key.")}</p><span>{pick(isEnglish,"模型失败时保留确定性工具结果，并提供重试、切换模型或继续使用规则版结果。","When a model fails, deterministic tool results are preserved and you can retry, switch models or continue with rule-based output.")}</span></div></section>
  </div>;
}
