"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
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
  type PrecheckResult, type SocialAnalysis, type Workspace, type WorkspaceTheme,
} from "../lib/personal-workbench";
import type { AIProviderProfile } from "../lib/ai-provider-catalog";
import { normalizeDashboardWorkspace } from "../lib/dashboard-system";
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
      const response = await fetch("/api/me/snapshot", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(next) });
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
  const { isEnglish, locale } = useI18n();
  const holdings = snapshot.holdings ?? {};
  const total = Object.values(holdings).reduce((sum, item) => sum + Number(item.value || 0), 0);
  const largestEntry = Object.entries(holdings).sort(([, a], [, b]) => b.value - a.value)[0];
  const largest = largestEntry?.[1];
  const largestWeight = largest && total ? largest.value / total : 0;
  const preferredStock: StockSearchItem = largestEntry
    ? { code: largestEntry[0], name: largest.name || largestEntry[0], industry: largest.industry }
    : DEFAULT_HOME_STOCK;
  return <div className={`personal-content density-${workspace.density}`}>
    <HomeMarketPulse />
    <HomeDecisionBrief snapshot={snapshot} profile={profile} total={total} largest={largest} largestWeight={largestWeight} />
    <section className="personal-action-row compact" aria-labelledby="today-task" data-guide="home-actions">
      <div><span>{pick(isEnglish, "常用操作", "Common actions")}</span><h1 id="today-task">{pick(isEnglish, "研究、核实或检查组合", "Research, verify or review your portfolio")}</h1></div>
      <div className="personal-entry-grid">
        <Link href={`/analysis?view=research&code=${preferredStock.code}`} className="primary"><FileSearch /><span><strong>{pick(isEnglish, "研究当前标的", "Research current stock")}</strong><small>{preferredStock.name} · {pick(isEnglish, "行情、公告、财务", "prices, filings and financials")}</small></span><ArrowRight /></Link>
        <Link href="/opportunity"><MessageSquareWarning /><span><strong>{pick(isEnglish, "核实一条消息", "Check a claim")}</strong><small>{pick(isEnglish, "先分清事实和说法", "Separate evidence from inference")}</small></span><ArrowRight /></Link>
        <Link href="/portfolio"><BriefcaseBusiness /><span><strong>{pick(isEnglish, "检查我的组合", "Check my portfolio")}</strong><small>{total ? `${Object.keys(holdings).length} ${isEnglish ? "assets" : "个标的"} · ${new Intl.NumberFormat(locale, { style: "currency", currency: "CNY", maximumFractionDigits: 0 }).format(total)}` : pick(isEnglish, "添加持仓后查看暴露", "Add holdings to see exposure")}</small></span><ArrowRight /></Link>
      </div>
    </section>

    <HomeStockFocus key={preferredStock.code} initialStock={preferredStock} context={largestEntry ? "largest_holding" : "default"} holdings={holdings} total={total} />
    {total > 0 && <section className="home-portfolio-strip" aria-label={pick(isEnglish, "组合摘要", "Portfolio summary")}><PortfolioOverviewMini total={total} holdings={holdings}/><Link href="/portfolio">{pick(isEnglish, "查看集中度与行业暴露", "View concentration and sector exposure")}<ArrowRight/></Link></section>}
    {profile && largest && largestWeight > profile.maxSingleWeight && <section className="home-priority-alert"><RiskInbox profile={profile} largest={largest} largestWeight={largestWeight}/></section>}
  </div>;
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
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<ProfileDraft>(); const [message, setMessage] = useState("");
  const parse = () => { if (text.trim().length < 8) { setMessage("请至少写清一项仓位边界、关注重点或不想发生的行为。"); return; } try { setDraft(parseProfile(text)); setMessage(""); } catch (error) { setMessage(error instanceof Error ? error.message : "无法解析"); } };
  return <div className="personal-content narrow"><section className="personal-page-heading"><span>个人规则</span><h1>先写下你的边界，再让系统检查</h1><p>系统只把原话整理成候选规则。你确认之前，它不会影响任何检查结果。</p></section>
    {profile && <div className="personal-current-rule"><Check /><div><strong>当前规则已生效 · {rules.filter((item) => item.enabled).length} 条</strong><span>单一资产 {percent(profile.maxSingleWeight)} · 行业 {percent(profile.maxSectorWeight)} · {profile.avoidChasing ? "避免追涨" : "未启用追涨提醒"}</span></div></div>}
    <section className="personal-form-panel"><div className="profile-start-options"><span>先选一个起点</span><div><button onClick={()=>{setText("我希望系统强提醒：单一资产不超过20%，单一行业不超过35%，亏损后隔一天再看，每次都填写失效条件。");setDraft(undefined)}}>强提醒</button><button onClick={()=>{setText("我希望使用标准提醒：单一资产不超过30%，单一行业不超过50%，大额操作时重新检查，并填写基本理由。");setDraft(undefined)}}>标准提醒</button><button onClick={()=>{setText("");setDraft(undefined)}}>自己描述</button></div><small>模板只是交互起点，不是投资配置建议。</small></div><label><span>用一句话补充或修改</span><Textarea value={text} onChange={(event) => { setText(event.target.value); setMessage(""); }} rows={4} placeholder="例如：我主要配置 ETF，不追连续上涨，每周检查一次。" /></label><div className="personal-form-actions"><Button variant="outline" onClick={() => { setText("我主要配置 ETF，单一 ETF 不超过 35%，单一行业不超过 45%，每周检查一次。"); setDraft(undefined); setMessage(""); }}>查看示例</Button><Button onClick={parse}><Sparkles data-icon="inline-start" />整理成候选规则</Button></div>{message && <p className="personal-error" role="alert">{message}</p>}</section>
    {draft && <section className="personal-confirm-panel"><header><div><span>确认前预览</span><h2>系统从原话中整理出这些规则</h2></div><Badge variant="outline">尚未生效</Badge></header><div className="profile-limit-editor"><label><span>单一资产上限</span><Input type="number" min="1" max="100" value={Math.round(draft.profile.maxSingleWeight * 100)} onChange={(event) => setDraft(updateProfileLimit(draft, "maxSingleWeight", Number(event.target.value) / 100))} /></label><label><span>单一行业上限</span><Input type="number" min="1" max="100" value={Math.round(draft.profile.maxSectorWeight * 100)} onChange={(event) => setDraft(updateProfileLimit(draft, "maxSectorWeight", Number(event.target.value) / 100))} /></label></div><div className="personal-rule-table">{draft.rules.map((rule) => <label key={rule.id}><input type="checkbox" checked={rule.enabled} onChange={() => setDraft({ ...draft, rules: draft.rules.map((item) => item.id === rule.id ? { ...item, enabled: !item.enabled } : item) })} /><span><strong>{rule.explanation}</strong><small>{rule.category} · {rule.priority === "high" ? "重要" : "一般"}</small></span></label>)}</div>{draft.assumptions.length > 0 && <Alert><CircleAlert /><AlertTitle>系统采用了默认理解</AlertTitle><AlertDescription>{draft.assumptions[0]}；其余内容以后可以逐项修改。</AlertDescription></Alert>}{draft.questions.length > 0 && <div className="personal-questions"><strong>这次只确认一个问题</strong><p>{draft.questions[0]}</p><small>其他未确认项会保留为“待完善”，不会替你决定。</small></div>}<footer><Button variant="outline" onClick={() => setDraft(undefined)}><X data-icon="inline-start" />返回修改</Button><Button onClick={() => onSave(draft)}><Check data-icon="inline-start" />确认并启用</Button></footer></section>}
  </div>;
}

function OpportunitySurface({ profile, holdings, onSave }: { profile: InvestorProfile; holdings: Record<string, Holding>; onSave: (entry: { checkedAt: string; text: string; level: string; score: number }) => Promise<void> }) {
  const [text, setText] = useState("");
  const [sourceMode, setSourceMode] = useState<"text" | "image" | "url">("text");
  const [sourceUrl, setSourceUrl] = useState(""); const [imageName, setImageName] = useState("");
  const [code, setCode] = useState(""); const [amount, setAmount] = useState<number | "">(""); const [analysis, setAnalysis] = useState<SocialAnalysis>(); const [error, setError] = useState("");
  const [reasonCategory, setReasonCategory] = useState("他人推荐");
  const [holdingPeriod, setHoldingPeriod] = useState(""); const [exitCondition, setExitCondition] = useState(""); const [result, setResult] = useState<PrecheckResult>(); const [reviewStep,setReviewStep]=useState(1);
  const total = Object.values(holdings).reduce((sum, item) => sum + Number(item.value || 0), 0); const current = holdings[code]?.value ?? 0;
  const analyze = () => {
    if (text.trim().length < 8) { setError("请粘贴至少一句完整说法，保留其中的承诺、紧迫或来源描述。"); return; }
    setError(""); const next = analyzeSocialContent(text); setAnalysis(next); setResult(undefined); setReviewStep(1);
    void onSave({ checkedAt: new Date().toISOString(), text: text.slice(0, 180), level: next.level, score: next.scores.following });
  };
  const precheck = () => { if(!/^\d{6}$/.test(code)){setError("请输入 6 位股票或 ETF 代码。");setReviewStep(2);return;}if(Number(amount)<=0){setError("请输入计划金额，才能计算计划后的仓位。");setReviewStep(2);return;}setError("");setResult(precheckTrade({ amount: Number(amount), portfolioValue: total || 200000, currentAssetValue: current, currentSectorValue: current, reason: `${reasonCategory}：${text}`, holdingPeriod, exitCondition, recentChange: 0, source: reasonCategory === "他人推荐" ? "social" : "self", similarAssets: current ? [holdings[code]?.name ?? code] : [] }, profile)); };
  return <div className="personal-content opportunity"><section className="personal-page-heading"><span>机会检查</span><h1>先拆开这条说法，再看它是否符合你的规则</h1><p>粘贴社交平台文字、链接中的核心说法或截图文字。系统描述可观察特征，不判断作者动机。</p></section>
    <section className="opportunity-input"><div className="opportunity-step-label"><b>1</b><span><strong>先检查原话</strong><small>此时不需要股票代码或计划金额</small></span></div><div className="opportunity-source-tabs"><button className={sourceMode === "text" ? "active" : undefined} onClick={() => setSourceMode("text")}>粘贴文字</button><button className={sourceMode === "image" ? "active" : undefined} onClick={() => setSourceMode("image")}>上传截图</button><button className={sourceMode === "url" ? "active" : undefined} onClick={() => setSourceMode("url")}>粘贴链接</button></div>{sourceMode === "image" && <label className="opportunity-upload"><input type="file" accept="image/*" onChange={(event) => setImageName(event.target.files?.[0]?.name ?? "")} /><span>{imageName || "选择一张截图"}</span><small>当前版本不上传图片；请把需要检查的文字粘贴到下方。</small></label>}{sourceMode === "url" && <label className="opportunity-url"><span>内容链接</span><Input type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://…" /><small>当前只记录来源地址，不自动抓取需要登录的平台内容。</small></label>}<Textarea value={text} onChange={(event) => { setText(event.target.value); setError(""); }} rows={5} placeholder="粘贴你看到的原话" />{error && !analysis && <p className="personal-error" role="alert">{error}</p>}<div className="opportunity-submit-row"><Button variant="outline" onClick={() => { setText("最近半导体新闻很多，朋友说公司有大订单，现在不上车就晚了。"); setError(""); setAnalysis(undefined); setResult(undefined); }}>填入示例</Button><Button onClick={analyze}><Gauge data-icon="inline-start" />先检查内容</Button></div><small>先看语言和证据特征；只有你继续做交易计划检查时，才会询问代码和金额。</small></section>
    {analysis && <><section className="opportunity-verdict"><div><span>先看结论</span><h2>{analysis.signals.length ? `这条说法有 ${analysis.signals.length} 处需要先核对` : "没有发现明显催促话术"}</h2><p>{analysis.scores.evidence < 50 ? "目前没有足够来源确认其中的具体主张。" : "已看到部分可核对信息，仍需打开原始来源。"}</p></div><aside><span>与你的决定有什么关系</span><strong>{analysis.scores.evidence < 50 ? "不能把这条说法单独作为行动依据" : "先确认来源，再结合价格与仓位"}</strong></aside></section><section className="social-findings"><header><span>为什么需要核对</span><Badge variant="outline">原文证据</Badge></header>{analysis.signals.map((signal) => <article key={`${signal.category}-${signal.excerpt}`}><span>{signal.category}</span><q>{signal.excerpt}</q><p>{signal.detail}</p></article>)}<div className="social-unknown"><strong>还缺什么</strong><p>公告或财报原文、信息发布日期，以及什么情况会推翻这项判断。</p></div></section>
      <section className="precheck-form progressive-check"><header><span>继续检查交易计划 · {reviewStep}/3</span><p>{reviewStep===1?"你为什么关注它？先选最接近的一项。":reviewStep===2?"再补充标的和金额，用于计算计划后的仓位。":"最后确认时间范围和判断失效条件。"}</p></header>
        {reviewStep===1&&<><div className="reason-options" role="group" aria-label="关注理由">{["基本面", "估值", "事件", "技术", "资产配置", "他人推荐", "还不确定"].map((item) => <button key={item} className={reasonCategory === item ? "active" : undefined} onClick={() => setReasonCategory(item)}>{item}</button>)}</div><Button onClick={()=>setReviewStep(2)}>下一步：填写计划<ArrowRight data-icon="inline-end"/></Button></>}
        {reviewStep===2&&<><div className="precheck-step-grid"><label><span>股票 / ETF 代码</span><Input value={code} placeholder="6 位代码" inputMode="numeric" onChange={(event)=>{setCode(event.target.value.replace(/\D/g,"").slice(0,6));setError("")}}/></label><label><span>计划金额</span><Input type="number" value={amount} min="0" step="1000" placeholder="例如 30000" onChange={(event)=>{setAmount(event.target.value===""?"":Number(event.target.value));setError("")}}/></label></div>{error&&<p className="personal-error" role="alert">{error}</p>}<div className="progressive-actions"><Button variant="outline" onClick={()=>setReviewStep(1)}>上一步</Button><Button onClick={()=>{if(!/^\d{6}$/.test(code)){setError("请输入 6 位股票或 ETF 代码。");return;}if(Number(amount)<=0){setError("请输入计划金额，才能计算计划后的仓位。");return;}setError("");setReviewStep(3)}}>下一步：设定边界<ArrowRight data-icon="inline-end"/></Button></div></>}
        {reviewStep===3&&<><div><span className="field-caption">预计持有多久</span><div className="reason-options" role="group" aria-label="预计持有期限">{["几天到几周","1—6 个月","半年以上","还不确定"].map((item)=><button key={item} className={holdingPeriod===item?"active":undefined} onClick={()=>setHoldingPeriod(item)}>{item}</button>)}</div></div><label className="progressive-custom-field"><span>什么情况说明判断可能错了</span><Input value={exitCondition} onChange={(event)=>setExitCondition(event.target.value)} placeholder="可以先留空，结果页会明确提示" /></label><div className="progressive-actions"><Button variant="outline" onClick={()=>setReviewStep(2)}>上一步</Button><Button onClick={precheck}><ShieldCheck data-icon="inline-start"/>查看规则与组合影响</Button></div></>}
      </section></>}
    {result && <PrecheckCard result={result} />}
  </div>;
}

function PrecheckCard({ result }: { result: PrecheckResult }) { return <section className="precheck-result"><header><div><span>第 2—4 步 · 规则、组合、待确认风险</span><h2>{result.checks.length ? `${result.checks.length} 项需要你复核` : "未触发已启用规则"}</h2></div><Badge variant={result.canContinue ? "secondary" : "outline"}>{result.canContinue ? "可继续记录" : "先补充信息"}</Badge></header><div className="precheck-numbers"><div><span>计划后单一持仓</span><strong>{percent(result.afterSingleWeight)}</strong><small>第 2 步 · 个人规则</small></div><div><span>计划后行业占比</span><strong>{percent(result.afterSectorWeight)}</strong><small>第 3 步 · 组合影响</small></div><div><span>直接规则冲突</span><strong>{result.violations.length}</strong><small>需逐项确认</small></div></div><div className="precheck-list-heading"><span>第 4 步</span><strong>还有哪些风险需要确认</strong></div>{result.checks.map((item) => <article key={`${item.title}-${item.fact}`}><Badge variant="outline">{item.severity}</Badge><div><strong>{item.title}</strong><span>{item.fact}</span><p>{item.explanation}</p></div></article>)}<div className="personal-questions"><strong>决定前再回答</strong>{result.questions.map((item) => <p key={item}>{item}</p>)}</div><footer><Button variant="outline">加入观察</Button><Button variant="outline">保存分析</Button><Button variant="outline">记录交易理由</Button><Button>稍后再决定</Button></footer></section>; }

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
  const [expandedSector, setExpandedSector] = useState<string>();
  const rows = Object.entries(holdings).map(([code, item]) => ({ code, ...item })); const total = rows.reduce((sum, item) => sum + Number(item.value || 0), 0); const largest = [...rows].sort((a, b) => b.value - a.value)[0]; const maxWeight = largest && total ? largest.value / total : 0;
  const sectors = Object.entries(rows.reduce<Record<string, number>>((result, item) => { const key = item.industry ?? "行业待核对"; result[key] = (result[key] ?? 0) + item.value; return result; }, {})).sort((a, b) => b[1] - a[1]);
  if (!rows.length) return <div className="personal-content"><section className="personal-page-heading"><span>组合检查</span><h1>先看资金暴露，再看单个标的</h1><p>当前仅按你保存的持仓金额计算，不连接证券账户，也不补造实时市值。</p></section><section className="portfolio-summary"><div><span>组合金额</span><strong>暂无数据</strong></div><div><span>标的数量</span><strong>暂无数据</strong></div><div><span>最大单一持仓</span><strong>暂无数据</strong><small>个人上限 {percent(profile.maxSingleWeight)}</small></div></section><section className="portfolio-empty"><BriefcaseBusiness /><h2>先加入一笔持仓，才能计算暴露</h2><p>可在股票研究页保存持仓，或导入交易 CSV 自动生成未平仓数量。</p><div><Link href="/analysis?view=research">研究并加入持仓</Link><Link href="/trade-tool">导入交易 CSV</Link></div></section></div>;
  return <div className="personal-content"><section className="personal-page-heading"><span>组合检查</span><h1>先看资金暴露，再看单个标的</h1><p>当前仅按你保存的持仓金额计算，不连接证券账户，也不补造实时市值。</p></section><section className="portfolio-summary"><div><span>组合金额</span><strong>{total ? currency(total) : "暂无数据"}</strong></div><div><span>标的数量</span><strong>{rows.length || "暂无数据"}</strong></div><div><span>最大单一持仓</span><strong>{largest ? `${largest.name} ${percent(maxWeight)}` : "暂无数据"}</strong><small>个人上限 {percent(profile.maxSingleWeight)}</small></div></section>{rows.length ? <><section className="exposure-explorer"><header><div><Eye /><span>行业暴露可展开核对</span></div><small>点击查看构成与移除情景；不是调仓建议</small></header>{sectors.map(([sector, value]) => { const weight = total ? value / total : 0; const contributors = rows.filter((item) => (item.industry ?? "行业待核对") === sector).sort((a, b) => b.value - a.value); const open = expandedSector === sector; const largestContributor = contributors[0]; const whatIf = total > (largestContributor?.value ?? 0) ? (value - (largestContributor?.value ?? 0)) / (total - (largestContributor?.value ?? 0)) : 0; return <article key={sector}><button aria-expanded={open} onClick={() => setExpandedSector(open ? undefined : sector)}><span><strong>{sector}</strong><small>{contributors.length} 个标的共同贡献</small></span><i><b style={{ width: `${Math.min(100, weight * 100)}%` }} /></i><strong>{percent(weight)}</strong><ChevronDown /></button>{open && <div><p>主要构成：{contributors.map((item) => `${item.name} ${percent(item.value / total)}`).join("、")}</p><p>如果仅从情景中移除 {largestContributor.name}，该行业暴露预计变为 {percent(Math.max(0, whatIf))}。不代表必须卖出。</p>{contributors.length > 1 && <Badge variant="outline">可进一步核对底层重复暴露</Badge>}</div>}</article>; })}</section><section className="portfolio-list">{rows.map((item) => { const weight = total ? item.value / total : 0; return <article key={item.code}><div><strong>{item.name}</strong><span>{item.code} · {item.industry ?? "行业待核对"}</span></div><div className="portfolio-weight"><i><b style={{ width: `${Math.min(100, weight * 100)}%` }} /></i><strong>{percent(weight)}</strong></div><span>{currency(item.value)}</span></article>; })}</section></> : <section className="portfolio-empty"><BriefcaseBusiness /><h2>还没有可计算的持仓</h2><p>可继续使用原有“我的持仓”页面录入，或在交易复盘工具中导入 CSV。</p><div><Link href="/analysis">进入原有持仓页面</Link><Link href="/trade-tool">导入交易 CSV</Link></div></section>}</div>;
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

function AISettingsSurface({ initialProviders,initialPrivacyMode,onProvidersChange,onPrivacyModeChange }: { initialProviders: AIProviderProfile[];initialPrivacyMode:boolean;onProvidersChange:(providers:AIProviderProfile[])=>void;onPrivacyModeChange:(enabled:boolean)=>void }) {
  const [providers,setProviders]=useState<AIProviderProfile[]>(initialProviders); const [testing,setTesting]=useState<string>(); const [message,setMessage]=useState("");
  const [privacyMode,setPrivacyMode]=useState(initialPrivacyMode); const [privacySaving,setPrivacySaving]=useState(false);
  const [formOpen,setFormOpen]=useState(false); const [draft,setDraft]=useState<ProviderDraft>(DEFAULT_PROVIDER_DRAFT); const [showKey,setShowKey]=useState(false); const [saving,setSaving]=useState(false); const [discovering,setDiscovering]=useState(false); const [modelOptions,setModelOptions]=useState<string[]>([]); const [formResult,setFormResult]=useState<{success:boolean;message:string;latency?:number}>();
  const replaceProviders=(next:AIProviderProfile[])=>{setProviders(next);onProvidersChange(next);window.dispatchEvent(new CustomEvent("anxin:providers-updated"));};
  const refresh=async()=>{const response=await fetch("/api/ai/providers",{cache:"no-store"});const payload=await response.json() as {providers?:AIProviderProfile[];privacy_mode?:boolean};if(response.ok&&payload.providers){replaceProviders(payload.providers);setPrivacyMode(Boolean(payload.privacy_mode));onPrivacyModeChange(Boolean(payload.privacy_mode));}};
  const togglePrivacy=async(enabled:boolean)=>{setPrivacySaving(true);setMessage("");try{const response=await fetch("/api/ai/privacy",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({enabled})});const payload=await response.json() as {message?:string};if(!response.ok)throw new Error(payload.message||"无法修改隐私模式");setPrivacyMode(enabled);setMessage(payload.message||"隐私模式已更新");await refresh();}catch(error){setMessage(error instanceof Error?error.message:"无法修改隐私模式");}finally{setPrivacySaving(false);}};
  const setDefault=async(provider:AIProviderProfile)=>{setMessage("");const response=await fetch(`/api/ai/providers/${provider.providerId}/set-default`,{method:"POST"});const payload=await response.json() as {success?:boolean;message?:string};setMessage(payload.message??(response.ok?"默认模型已切换":"无法切换模型"));if(response.ok)await refresh();};
  const test=async(provider:AIProviderProfile)=>{setTesting(provider.providerId);setMessage("");try{const response=await fetch(`/api/ai/providers/${provider.providerId}/test`,{method:"POST"});const payload=await response.json() as {success?:boolean;message?:string;latency_ms?:number;fallback_available?:boolean};setMessage(`${payload.message??"连接检查完成"}${payload.success&&payload.latency_ms!==undefined?` · ${payload.latency_ms} ms`:payload.fallback_available?" 可重试、切换模型或继续使用规则版结果。":""}`);}catch{setMessage(`${provider.displayName} 当前连接失败。可重试、切换模型或继续使用规则版结果。`);}finally{setTesting(undefined);}};
  const selectPreset=(key:keyof typeof PROVIDER_PRESETS)=>{const preset=PROVIDER_PRESETS[key];setDraft((current)=>({...current,...preset,providerId:undefined,apiKey:""}));setModelOptions([]);setFormResult(undefined);};
  const edit=(provider:AIProviderProfile)=>{setDraft({providerId:provider.providerId,displayName:provider.displayName,providerType:provider.providerType==="mock"?"compatible":provider.providerType,baseUrl:provider.baseUrl,model:provider.model,apiMode:provider.apiMode,apiKey:"",capabilities:provider.capabilities});setFormOpen(true);setFormResult(undefined);window.scrollTo({top:0,behavior:"smooth"});};
  const keyless=["ollama","vllm","llamacpp"].includes(draft.providerType);
  const requestModels=async(current:ProviderDraft)=>{const response=await fetch("/api/ai/providers/discover",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(current)});const payload=await response.json() as {models?:string[];message?:string};if(!response.ok||!payload.models?.length)throw new Error(payload.message||"没有取得可用模型");return payload.models;};
  const testDraft=async()=>{setTesting("draft");setFormResult(undefined);try{let candidate=draft;if(!candidate.model.trim()){const models=await requestModels(candidate);setModelOptions(models);candidate={...candidate,model:models[0]};setDraft(candidate);}const response=await fetch("/api/ai/providers/test",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(candidate)});const payload=await response.json() as {success?:boolean;message?:string;latency_ms?:number};setFormResult({success:Boolean(payload.success),message:payload.success?`${payload.message??"连接检查完成"}。保存后会自动用于已启用的 AI 任务。`:payload.message??"连接检查完成",latency:payload.latency_ms});}catch(error){setFormResult({success:false,message:error instanceof Error?error.message:"连接失败，请检查配置。"});}finally{setTesting(undefined);}};
  const discoverModels=async()=>{setDiscovering(true);setFormResult(undefined);try{const models=await requestModels(draft);setModelOptions(models);setDraft((current)=>({...current,model:models.includes(current.model)?current.model:models[0]}));setFormResult({success:true,message:`已取得 ${models.length} 个可用模型，并选中 ${models[0]}。请再测试连接。`});}catch(error){setFormResult({success:false,message:error instanceof Error?error.message:"无法获取模型列表"});}finally{setDiscovering(false);}};
  const save=async()=>{setSaving(true);setFormResult(undefined);try{const target=draft.providerId?`/api/ai/providers/${draft.providerId}`:"/api/ai/providers";const response=await fetch(target,{method:draft.providerId?"PUT":"POST",headers:{"content-type":"application/json"},body:JSON.stringify(draft)});const payload=await response.json() as AIProviderProfile&{message?:string};if(!response.ok)throw new Error(payload.message||"保存失败");const defaultResponse=await fetch(`/api/ai/providers/${payload.providerId}/set-default`,{method:"POST"});const defaultPayload=await defaultResponse.json() as {message?:string};if(!defaultResponse.ok)throw new Error(defaultPayload.message||"模型已保存，但设为默认失败");await refresh();setMessage(`${payload.displayName} 已安全保存并设为默认，后续 AI 任务会自动调用。`);setFormOpen(false);setDraft(DEFAULT_PROVIDER_DRAFT);}catch(error){setFormResult({success:false,message:error instanceof Error?error.message:"保存失败"});}finally{setSaving(false);}};
  const remove=async(provider:AIProviderProfile)=>{if(!window.confirm(`删除“${provider.displayName}”及其加密密钥？`))return;const response=await fetch(`/api/ai/providers/${provider.providerId}`,{method:"DELETE"});const payload=await response.json() as {message?:string};setMessage(response.ok?"模型连接和密钥引用已删除":payload.message??"删除失败");if(response.ok)await refresh();};
  const current=providers.find(item=>item.isDefault);
  const configuredProviders=providers.filter((provider)=>provider.providerId==="mock"||provider.connectionStatus==="available"||provider.editable);
  const unavailableProviders=providers.filter((provider)=>provider.providerId!=="mock"&&provider.connectionStatus!=="available"&&!provider.editable);
  return <div className="personal-content ai-settings-content">
    <section className="personal-page-heading split"><div><span>模型设置</span><h1>先看当前可用能力，再决定是否接入模型</h1><p>规则计算、持仓诊断和回测不依赖大模型。自由问答、自然语言配置和文字解释需要可用模型。</p></div><div className="ai-heading-actions"><Link href="/evaluation"><ShieldCheck/>查看质量评测</Link><Button onClick={()=>{setFormOpen(true);setDraft(DEFAULT_PROVIDER_DRAFT);setFormResult(undefined)}}><Plus data-icon="inline-start"/>接入个人模型</Button></div></section>
    <section className="ai-default-provider"><div className="ai-default-symbol"><Cpu/></div><div><span>当前使用</span><h2>{current?.displayName??"未连接"}</h2><p>{current?.model||"模型名称待配置"} · {current?.mode==="local"?"本机模型":current?.mode==="platform"?"平台内置":current?.mode==="rules"?"规则计算":"第三方 API"}</p></div><div className="ai-default-state"><Badge variant={current?.connectionStatus==="available"?"secondary":"outline"}>{current?.providerId==="mock"?"规则检查可用":current?.connectionStatus==="available"?"已连接":"未配置"}</Badge><small>{current?.providerId==="mock"?"生成式开源模型尚未部署":current?.privacyLabel??(current?.secretStatus==="server_configured"?"服务器端密钥":"状态待核对")}</small></div><div className="ai-provider-actions"><Button variant="outline" onClick={()=>current&&void test(current)} disabled={!current||testing===current.providerId}>{testing===current?.providerId?"正在测试":"检查状态"}</Button>{current?.editable&&<Button variant="outline" onClick={()=>edit(current)}>编辑</Button>}</div></section>
    <section className="ai-auto-routing-note"><Sparkles/><div><strong>保存一次，之后自动调用</strong><p>设为默认后，自由对话、工作台配置、交易前解释、ETF 与持仓解释、量化规则解析会按已启用用途自动使用该模型；失败时保留规则结果并明确提示，不会伪装成 AI 回答。</p></div></section>
    <section className="ai-privacy-mode"><div><ShieldCheck/><span><strong>仅使用本机模型</strong><small>开启后，持仓和交易内容不会发送到 HKGAI、DeepSeek、OpenAI、Claude 或平台云端模型。</small></span></div><label><input type="checkbox" checked={privacyMode} disabled={privacySaving} onChange={(event)=>void togglePrivacy(event.target.checked)}/><span>{privacyMode?"已开启":"未开启"}</span></label></section>
    {formOpen&&<section className="ai-connection-form" aria-label="接入 AI 模型"><header><div><KeyRound/><span><strong>{draft.providerId?"编辑个人模型":"接入个人模型"}</strong><small>{keyless?"本机推理无需 API Key；云端页面不能直接访问你电脑上的 localhost":"Key 只在提交时发送给后端；页面不会保存或回显"}</small></span></div><Button variant="ghost" size="icon" onClick={()=>setFormOpen(false)} aria-label="取消"><X/></Button></header><div className="ai-provider-presets">{Object.entries({hkgai:"HKGAI",deepseek:"DeepSeek",openai:"OpenAI",claude:"Claude",ollama:"Ollama",vllm:"vLLM",llamacpp:"llama.cpp",custom:"自定义"}).map(([key,label])=><button type="button" key={key} onClick={()=>selectPreset(key as keyof typeof PROVIDER_PRESETS)} className={draft.displayName.toLowerCase().includes(key==="openai"?"openai":key)?"active":undefined}>{label}</button>)}</div><div className="ai-form-grid"><label><span>显示名称</span><Input value={draft.displayName} onChange={(event)=>setDraft({...draft,displayName:event.target.value})}/></label><label><span>提供商类型</span><select value={draft.providerType} onChange={(event)=>setDraft({...draft,providerType:event.target.value as ProviderDraft["providerType"]})}><option value="compatible">OpenAI-compatible</option><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="ollama">Ollama</option><option value="vllm">vLLM</option><option value="llamacpp">llama.cpp</option></select></label>{!keyless&&<label className="wide"><span>API Key {draft.providerId&&<small>留空则保留原 Key</small>}</span><div className="ai-key-input"><Input type={showKey?"text":"password"} autoComplete="new-password" value={draft.apiKey} onChange={(event)=>setDraft({...draft,apiKey:event.target.value})} placeholder={draft.providerId?"留空则不替换":"请输入 API Key"}/><button type="button" onClick={()=>setShowKey((show)=>!show)} aria-label={showKey?"隐藏 API Key":"显示 API Key"}>{showKey?<EyeOff/>:<Eye/>}</button></div></label>}<label className="wide"><span>Base URL</span><Input type="url" value={draft.baseUrl} onChange={(event)=>setDraft({...draft,baseUrl:event.target.value})} placeholder="https://.../v1"/><small>{keyless?"本地开发可使用 127.0.0.1；部署后的网页需要服务器可访问的 HTTPS 推理地址。":"请使用服务商提供的 API Base URL"}</small></label><label><span>模型名称</span>{modelOptions.length?<select value={draft.model} onChange={(event)=>setDraft({...draft,model:event.target.value})}>{modelOptions.map(model=><option key={model} value={model}>{model}</option>)}</select>:<Input value={draft.model} onChange={(event)=>setDraft({...draft,model:event.target.value})} placeholder={keyless?"例如 qwen3:8b":"先点击下方“获取可用模型”"}/>}<small>{keyless?"填写推理服务中已经安装的模型 ID。":"模型 ID 必须由当前服务商提供；无需猜测。"}</small></label><label><span>调用模式</span><select value={draft.apiMode} onChange={(event)=>setDraft({...draft,apiMode:event.target.value as ProviderDraft["apiMode"]})}><option value="chat">Chat Completions</option>{draft.providerType==="openai"&&<option value="responses">Responses</option>}{draft.providerType==="anthropic"&&<option value="native">Native Messages</option>}</select></label></div><fieldset className="ai-capabilities"><legend>模型用途</legend>{(Object.keys(CAPABILITY_LABELS) as Array<keyof AIProviderProfile["capabilities"]>).map((key)=><label key={key}><input type="checkbox" checked={draft.capabilities[key]} onChange={(event)=>setDraft({...draft,capabilities:{...draft.capabilities,[key]:event.target.checked}})}/><span>{CAPABILITY_LABELS[key]}</span></label>)}</fieldset>{formResult&&<Alert className={formResult.success?"ai-test-success":"ai-test-error"}><PlugZap/><AlertTitle>{formResult.success?"连接成功":"连接失败"}</AlertTitle><AlertDescription>{formResult.message}{formResult.success&&formResult.latency!==undefined?` · ${formResult.latency} ms`:""}</AlertDescription></Alert>}<footer><Button variant="outline" onClick={()=>void testDraft()} disabled={testing==="draft"||(!keyless&&!draft.apiKey)}>{testing==="draft"?"正在连接":"测试并识别模型"}</Button><Button onClick={()=>void save()} disabled={saving||!draft.displayName||!draft.baseUrl||!draft.model||(!draft.providerId&&!draft.apiKey&&!keyless)}>{saving?"正在安全保存":"保存并设为默认"}</Button><Button variant="ghost" onClick={()=>setFormOpen(false)}>取消</Button></footer><aside><ShieldCheck/>{keyless?"未检测到模型时会明确显示不可用，不会返回 Mock 冒充 AI。":"保存后自动用于所选任务；API Key 不进入 URL、本地存储、会话记录或普通日志。"}</aside></section>}
    {formOpen&&<section className="ai-model-discovery"><div><strong>不知道模型名称？</strong><p>{keyless?"启动本机推理服务后，可从当前地址读取已安装模型。":"先填写 API Key；平台只用它读取当前服务商的模型列表，不会在此步骤保存。"}</p></div><Button variant="outline" onClick={()=>void discoverModels()} disabled={discovering||(!keyless&&!draft.apiKey)||!draft.baseUrl}>{discovering?"正在获取":"自动获取模型"}</Button>{modelOptions.length>0&&<label><span>可用模型</span><select value={draft.model} onChange={(event)=>setDraft({...draft,model:event.target.value})}>{modelOptions.map((model)=><option key={model} value={model}>{model}</option>)}</select></label>}</section>}
    {message&&<Alert className="ai-settings-message"><CircleAlert/><AlertTitle>模型状态</AlertTitle><AlertDescription>{message}</AlertDescription></Alert>}
    <section className="ai-configured-heading"><div><span>当前可用</span><small>只显示已连接模型和规则工具</small></div></section><section className="ai-provider-list">{configuredProviders.map(provider=><article key={provider.providerId}><div className="ai-provider-main"><span className={provider.connectionStatus==="available"?"connected":"disabled"}/><div><strong>{provider.displayName}{provider.isDefault&&<Badge variant="secondary">当前</Badge>}{provider.isPlatformDefault&&<Badge variant="outline">平台默认</Badge>}</strong><p>{provider.mode==="local"?"本机模型":provider.mode==="platform"?"平台内置模型":provider.mode==="rules"?"确定性规则":"第三方 API"} · {provider.model||"模型待配置"}</p><small>{provider.description}</small><div className="ai-capability-tags">{provider.modelCapabilities?.toolCalling&&<Badge variant="outline">工具调用</Badge>}{provider.modelCapabilities?.jsonMode&&<Badge variant="outline">JSON</Badge>}{provider.modelCapabilities?.vision&&<Badge variant="outline">图片</Badge>}{provider.modelCapabilities?.contextWindow>0&&<Badge variant="outline">{Math.round(provider.modelCapabilities.contextWindow/1024)}K 上下文</Badge>}</div></div></div><div className="ai-provider-secret"><span>当前状态</span><strong>{provider.providerId==="mock"?"规则可用":provider.connectionStatus==="available"?"已连接":"未配置"}</strong><small>{provider.apiKeyMasked}</small></div><div className="ai-provider-actions"><Button variant="outline" onClick={()=>void test(provider)} disabled={testing===provider.providerId}>{testing===provider.providerId?"正在检查":"检查状态"}</Button><Button variant="outline" disabled={provider.isDefault||provider.connectionStatus!=="available"||(privacyMode&&!(["local","rules"] as string[]).includes(provider.mode))} onClick={()=>void setDefault(provider)}>{provider.isDefault?"当前使用":"使用此模型"}</Button>{provider.editable&&<Button variant="ghost" onClick={()=>edit(provider)}>编辑</Button>}{provider.editable&&<Button variant="ghost" size="icon-sm" onClick={()=>void remove(provider)} aria-label={`删除 ${provider.displayName}`}><Trash2/></Button>}</div></article>)}</section>
    {unavailableProviders.length>0&&<section className="ai-connect-catalog"><div><strong>生成式 AI 尚未接入</strong><p>可以连接 HKGAI、DeepSeek、OpenAI、Claude 或兼容接口。接入前，ETF、持仓、回测和规则检查仍可正常使用。</p><small>当前可选：{unavailableProviders.map((provider)=>provider.displayName.replace(" 本机模型","").replace(" 推理服务","")).join(" · ")}</small></div><Button variant="outline" onClick={()=>{setFormOpen(true);setDraft(DEFAULT_PROVIDER_DRAFT);setFormResult(undefined);window.scrollTo({top:0,behavior:"smooth"})}}>选择并接入</Button></section>}
    <section className="ai-provider-admin-note"><ShieldCheck/><div><strong>服务器端密钥安全</strong><p>个人 Key 使用服务器主密钥加密后存入与你登录账号隔离的数据库；浏览器不会取得解密后的 Key。</p><span>模型失败时保留确定性工具结果，并提供重试、切换模型或继续使用规则版结果。</span></div></section>
  </div>;
}
