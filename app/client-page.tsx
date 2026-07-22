"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bookmark,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  CircleHelp,
  ChevronDown,
  ChevronRight,
  Clock3,
  CalendarClock,
  Database,
  Download,
  Eye,
  ExternalLink,
  FileSearch,
  FileChartColumn,
  Gauge,
  History,
  LayoutDashboard,
  Layers3,
  LockKeyhole,
  LogOut,
  Plus,
  Search,
  ReceiptText,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  TimerReset,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { FinancialHealthPanel } from "./components/financial-health-panel";

type View = "desk" | "research" | "newDecision" | "decision" | "decisionResult" | "history" | "portfolio" | "rules" | "privacy";
type TradeAction = "买入" | "补仓" | "卖出" | "继续观察";
type UserRules = { investableCapital: number; maxSingleStockValue: number; maxSingleStockRatio: number; singleAmountAlert: number; coolingHours: number; requireInvalidation: boolean };
type HoldingBook = Record<string, { name: string; value: number }>;
type WatchBook = Record<string, { name: string }>;
type ReasonStructure = { fact: string; external: string; inference: string; urgency: string; source: string };
type TestFeedback = { testerCode: string; satisfaction: number; riskUnderstood: boolean; repeatIntent: boolean; paidIntent: boolean; confusingStep: string; submittedAtIso: string };
type CloudSyncStatus = "loading" | "saving" | "synced" | "local";
type CloudSnapshot = { rules?: UserRules; holdings?: HoldingBook; watched?: WatchBook; decisionRecords?: DecisionResult[]; latestDecision?: DecisionResult };
type DecisionResult = { stock: Stock; action: TradeAction; originalAmount: number; finalAmount: number; result: "已修改" | "维持计划" | "已延迟"; message: string; reason?: string; reasonStructure?: ReasonStructure; invalidation?: string; horizon?: string; reviewedAt?: string; reviewedAtIso?: string; ruleSnapshot?: UserRules; issues?: string[]; remainingIssues?: string[]; scenarioLoss?: number; originalScenarioLoss?: number; durationSeconds?: number; evidence?: LiveEvidencePayload; feedback?: TestFeedback };
type ResearchDecisionContext = { reason: string; evidence?: LiveEvidencePayload };

type Stock = {
  code: string;
  name: string;
  market: string;
  price: number;
  change: number;
  industry: string;
  summary: string;
  momentum: string;
  valuation: string;
  turnover: string;
  oneMonth: string;
  oneYear: string;
  chartHigh: string;
  chartLow: string;
  momentumScore: number;
  valuationScore: number;
  activityScore: number;
};

type LiveQuote = {
  stock_code: string;
  stock_name?: string;
  current_price: number;
  change_percent?: number;
  amount?: number;
  update_time?: string;
};
type LiveHistoryPoint = { date: string; close: number; volume?: number };
type LiveEvidencePayload = {
  assessment?: { status: string; summary: string; mode: "rules" | "openai"; evidence_indices?: number[] };
  feed?: { items?: Array<{ published_at: string; title: string; summary: string; source: string; url: string; category: string; relation: string; corroborating_sources?: string[] }>; data_mode?: string; updated_at?: string; sources?: string[]; message?: string };
  radar?: { total: number; official_count: number; media_count: number; opinion_count: number; source_count: number; coverage: string; disclaimer: string };
};
type InformationSnapshot = {
  requestedCode?: string;
  status: "live" | "partial" | "cached" | "fallback";
  provider?: string;
  fetchedAt?: string;
  message?: string;
  quote?: LiveQuote;
  history?: { data?: LiveHistoryPoint[] };
  evidence?: LiveEvidencePayload;
};
type ResearchEvidenceSnapshot = { requestedCode: string; requestedQuery: string; status: "loading" | "ready" | "fallback"; payload?: LiveEvidencePayload };
type FinancialQuerySnapshot = {
  requestedCode: string;
  requestedQuery: string;
  status: "ready" | "fallback";
  payload?: { report_date: string; coverage: { known_checks: number; total_checks: number }; checks: Array<{ state: string; title: string; finding: string }>; data_status: { is_demo: boolean; source: string } };
};
type StockSearchItem = { code: string; name: string; industry?: string };

const stocks: Stock[] = [
  { code: "600183", name: "生益科技", market: "SH", price: 32.78, change: 2.31, industry: "电子元件 · 覆铜板", summary: "价格与成交同步走强，但估值已处于近三年较高区间。产业链景气信号改善，社交平台流传的海外订单仍缺少公告印证。", momentum: "近20日 +12.4%", valuation: "78% 分位", turnover: "18.6 亿", oneMonth: "+5.8%", oneYear: "+21.7%", chartHigh: "34.12", chartLow: "27.46", momentumScore: 72, valuationScore: 78, activityScore: 63 },
  { code: "600036", name: "招商银行", market: "SH", price: 41.25, change: -0.46, industry: "银行 · 全国性股份行", summary: "股息与盈利稳定性仍是主要支撑，短期价格波动较小。需要继续观察净息差与零售资产质量变化。", momentum: "近20日 +1.8%", valuation: "42% 分位", turnover: "34.2 亿", oneMonth: "+0.9%", oneYear: "+12.6%", chartHigh: "42.36", chartLow: "38.84", momentumScore: 48, valuationScore: 42, activityScore: 52 },
  { code: "688981", name: "中芯国际", market: "SH", price: 86.42, change: 1.18, industry: "半导体 · 晶圆代工", summary: "行业关注度维持高位，价格对政策和产能消息较敏感。当前预期较满，需要区分确定的资本开支数据与情绪推断。", momentum: "近20日 +8.6%", valuation: "83% 分位", turnover: "128.5 亿", oneMonth: "+6.2%", oneYear: "+48.3%", chartHigh: "91.80", chartLow: "69.25", momentumScore: 82, valuationScore: 83, activityScore: 88 },
  { code: "000858", name: "五粮液", market: "SZ", price: 121.9, change: -1.12, industry: "食品饮料 · 白酒", summary: "渠道库存仍是影响预期的关键变量，价格表现弱于大盘。现金流稳定，但短期需求恢复尚缺乏一致证据。", momentum: "近20日 −4.1%", valuation: "37% 分位", turnover: "22.1 亿", oneMonth: "−2.8%", oneYear: "−8.6%", chartHigh: "128.40", chartLow: "118.70", momentumScore: 32, valuationScore: 37, activityScore: 46 },
  { code: "601012", name: "隆基绿能", market: "SH", price: 18.64, change: 0.81, industry: "电力设备 · 光伏", summary: "产业链价格企稳带来情绪修复，但盈利拐点尚未被财报确认。需要关注产能利用率和现金流。", momentum: "近20日 +5.2%", valuation: "无法比较", turnover: "47.3 亿", oneMonth: "+3.4%", oneYear: "−14.8%", chartHigh: "19.32", chartLow: "16.85", momentumScore: 58, valuationScore: 8, activityScore: 71 },
  { code: "600519", name: "贵州茅台", market: "SH", price: 1486.2, change: 0.63, industry: "食品饮料 · 白酒", summary: "批价与渠道库存仍是短期核心变量，品牌与现金流质量保持稳定。近期消费政策讨论改善情绪，但需求改善幅度仍需经营数据确认。", momentum: "近20日 +2.7%", valuation: "46% 分位", turnover: "31.8 亿", oneMonth: "+1.2%", oneYear: "+5.9%", chartHigh: "1512.00", chartLow: "1436.00", momentumScore: 53, valuationScore: 46, activityScore: 49 },
];

function createCodeStock(code: string): Stock {
  return { code, name: code, market: code.startsWith("6") ? "SH" : "SZ", price: 0, change: 0, industry: "A股 · 正在载入", summary: "真实行情正在载入；公司摘要、估值和公告证据尚未完成核实。", momentum: "待计算", valuation: "待载入", turnover: "待载入", oneMonth: "待计算", oneYear: "待计算", chartHigh: "0", chartLow: "0", momentumScore: 0, valuationScore: 0, activityScore: 0 };
}

const TOTAL_ASSETS = 200000;
const LOCAL_DECISION_KEY = "anxin.latestDecision.v1";
const LOCAL_DECISIONS_KEY = "anxin.decisionRecords.v1";
const LOCAL_RULES_KEY = "anxin.userRules.v1";
const LOCAL_HOLDINGS_KEY = "anxin.holdings.v1";
const LOCAL_WATCHED_KEY = "anxin.watched.v1";
const DEFAULT_RULES: UserRules = { investableCapital: TOTAL_ASSETS, maxSingleStockValue: 60000, maxSingleStockRatio: 25, singleAmountAlert: 30000, coolingHours: 24, requireInvalidation: true };
const STRONG_RULES: UserRules = { investableCapital: TOTAL_ASSETS, maxSingleStockValue: 48000, maxSingleStockRatio: 20, singleAmountAlert: 20000, coolingHours: 24, requireInvalidation: true };
const DEFAULT_HOLDINGS: HoldingBook = {};
const holdingValueFor = (holdings: HoldingBook, code: string) => holdings[code]?.value ?? 0;
const reviewDueDate = (record: DecisionResult) => {
  if (!record.reviewedAtIso) return undefined;
  const due = new Date(record.reviewedAtIso);
  if (Number.isNaN(due.getTime())) return undefined;
  const days = record.horizon === "1周" ? 7 : record.horizon === "3个月" ? 90 : 30;
  due.setDate(due.getDate() + days);
  return due;
};
const formatSourceTimestamp = (value?: string) => {
  if (!value) return "—";
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) return `${dateOnly[1]}年${Number(dateOnly[2])}月${Number(dateOnly[3])}日`;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
};
const currentAshareSession = () => {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Shanghai", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  if (["Sat", "Sun"].includes(value.weekday)) return "休市";
  const minute = Number(value.hour) * 60 + Number(value.minute);
  if ((minute >= 570 && minute < 690) || (minute >= 780 && minute < 900)) return "交易中";
  if (minute >= 690 && minute < 780) return "午间休市";
  return "已收盘";
};

const researchProfiles: Record<string, { thesis: string; invalidation: string; confirmed: string; uncertain: string; tradeoff: string; gap: string; suggestedReason: string; suggestedAmount: number; rumor: string; inference: string }> = {
  "600183": { thesis: "海外需求改善会带动覆铜板订单与收入增长", invalidation: "下一期收入或经营现金流未改善", confirmed: "利润同比改善已由业绩预告支持", uncertain: "海外订单尚未获得正式披露印证", tradeoff: "估值已在近三年 78% 分位", gap: "订单与现金流证据", suggestedReason: "最近关注度很高，朋友说公司拿到了海外大订单，我觉得现在补仓很快能涨回来。", suggestedAmount: 50000, rumor: "公司拿到了海外大订单", inference: "现在补仓很快能涨回来" },
  "600036": { thesis: "稳定盈利与股息能够支撑中期持有价值", invalidation: "净息差继续下降且零售资产质量明显恶化", confirmed: "最近一期利润和分红数据可以核实", uncertain: "净息差何时企稳仍不明确", tradeoff: "银行板块短期催化较少", gap: "下一期净息差与不良率", suggestedReason: "股息率看起来不错，我认为银行比较安全，想增加两万元。", suggestedAmount: 20000, rumor: "朋友说银行股不会大跌", inference: "高股息等于低风险" },
  "688981": { thesis: "先进制程需求与国产替代将支持产能利用率", invalidation: "产能利用率或毛利率连续两个季度下降", confirmed: "资本开支与产能数据已有正式披露", uncertain: "政策讨论能否转化为订单仍不明确", tradeoff: "估值与市场预期都处于较高位置", gap: "订单兑现与盈利弹性", suggestedReason: "最近半导体新闻很多，我担心错过行情，想先买三万元。", suggestedAmount: 30000, rumor: "政策很快会带来大量新订单", inference: "新闻多就会继续上涨" },
  "000858": { thesis: "渠道库存改善会带动白酒需求逐步恢复", invalidation: "核心产品批价继续下行且库存周转没有改善", confirmed: "公司现金流与历史分红可以核实", uncertain: "三季度渠道库存能否改善", tradeoff: "价格走势仍弱于主要指数", gap: "渠道库存与批价数据", suggestedReason: "已经跌了很多，我觉得白酒迟早会反弹，想买四万元。", suggestedAmount: 40000, rumor: "渠道马上要大规模补库存", inference: "跌得多就接近底部" },
  "601012": { thesis: "产业链价格企稳将推动盈利逐步修复", invalidation: "产品价格继续下跌且经营现金流恶化", confirmed: "产业链价格近期出现企稳迹象", uncertain: "盈利拐点尚未被财报确认", tradeoff: "行业产能仍然偏高", gap: "产能利用率与现金流", suggestedReason: "光伏跌了很久，产业链价格开始企稳，我想先买一万元。", suggestedAmount: 10000, rumor: "行业很快会全面出清", inference: "价格企稳等于盈利见底" },
  "600519": { thesis: "品牌力与渠道调整能够维持长期现金流质量", invalidation: "核心产品批价持续下降且经营现金流明显转弱", confirmed: "现金流、分红和历史盈利质量可以核实", uncertain: "短期渠道库存改善幅度仍不明确", tradeoff: "消费需求恢复速度可能低于预期", gap: "批价、库存与真实动销", suggestedReason: "最近消费政策经常被提到，我觉得茅台比较稳，想买五万元长期持有。", suggestedAmount: 50000, rumor: "政策会很快刺激高端白酒需求", inference: "好公司在任何价格都适合买入" },
};
const genericResearchProfile = { thesis: "先明确想验证的判断，再决定是否进入交易审查", invalidation: "尚未设置", confirmed: "真实行情、历史价格和近期正式披露可核实", uncertain: "财务基本面和用户看到的外部说法尚未核实", tradeoff: "仅凭价格和新闻数量不能形成完整判断", gap: "基本面、原始说法与判断条件", suggestedReason: "我最近关注到这只股票，想先核实相关信息再决定是否操作。", suggestedAmount: 10000, rumor: "尚未输入外部说法", inference: "关注度不等于确定的上涨依据" };

type EvidenceItem = { date: string; type: string; title: string; status: string; impact: string; detail: string; source?: string; url?: string };
type DeskUpdate = { id: string; stockCode: string; stockName: string; time: string; scope: "持仓" | "关注"; source: string; title: string; detail: string; impact: string; tone: "support" | "uncertain" | "weaken"; priority: "高" | "中"; judgment?: string; judgmentTime?: string; url?: string };
type HoldingCoverage = { code: string; name: string; status: "ready" | "partial" | "unavailable"; price?: number; change?: number; announcementCount: number; provider?: string };
type MarketOverview = { status: "loading" | "live" | "partial" | "cached" | "unavailable"; source: string; fetchedAt?: string; message?: string; items: Array<{ code: string; name: string; value: number; change: number; updatedAt?: string }> };
type SourceCheck = { category: string; source: string; status: "loading" | "live" | "partial" | "unavailable"; updatedAt: string; detail: string };
type HeaderFreshness = { state: "checking" | "ready" | "partial"; quote: string; evidence: string };
const LOADING_SOURCE_CHECKS: SourceCheck[] = ["行情", "公告", "财报"].map((category) => ({ category, source: "正在连接", status: "loading", updatedAt: "—", detail: "检查公开数据源" }));

const navItems = [
  { id: "desk" as const, label: "工作台", icon: LayoutDashboard },
  { id: "research" as const, label: "股票研究", icon: FileSearch },
  { id: "decision" as const, label: "决策验证", icon: ShieldCheck },
  { id: "portfolio" as const, label: "我的持仓", icon: BriefcaseBusiness },
  { id: "history" as const, label: "历史记录", icon: History },
  { id: "rules" as const, label: "我的规则", icon: SlidersHorizontal },
  { id: "privacy" as const, label: "数据和隐私", icon: LockKeyhole },
];

const toolNavItems = [
  { href: "/etf-tool", label: "ETF 诊断", icon: Layers3 },
  { href: "/trade-tool", label: "交易复盘", icon: ReceiptText },
];

function PriceChange({ value }: { value: number }) {
  return <span className={value >= 0 ? "price-up" : "price-down"}>{value >= 0 ? "+" : ""}{value.toFixed(2)}%</span>;
}

function Brand() {
  return <div className="brand" aria-label="安心看股"><span>安</span></div>;
}

function AppRail({ view, onView, hasPending }: { view: View; onView: (view: View) => void; hasPending: boolean }) {
  return (
    <aside className="app-rail">
      <Brand />
      <nav aria-label="主导航">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button key={id} className={view === id || (id === "decision" && view === "decisionResult") ? "rail-button active" : "rail-button"} onClick={() => onView(id)} aria-label={label} aria-current={view === id || (id === "decision" && view === "decisionResult") ? "page" : undefined}>
            <Icon />
            <span>{label}</span>
            {id === "decision" && hasPending && <i>1</i>}
          </button>
        ))}
        <span className="rail-divider" aria-hidden="true" />
        {toolNavItems.map(({ href, label, icon: Icon }) => (
          <a key={href} className="rail-button" href={href} aria-label={label}>
            <Icon />
            <span>{label}</span>
          </a>
        ))}
      </nav>
    </aside>
  );
}

function AppHeader({ view, stockCode, freshnessOverride, userName, syncStatus, onNewDecision, onSelectStock, onDataStatus }: { view: View; stockCode: string; freshnessOverride?: { stockCode: string; value: HeaderFreshness }; userName: string; syncStatus: CloudSyncStatus; onNewDecision: () => void; onSelectStock: (stock: Stock) => void; onDataStatus: () => void }) {
  const titles: Record<View, string> = { desk: "工作台", research: "股票研究", newDecision: "新建决策", decision: "决策验证", decisionResult: "审查记录", history: "历史记录", portfolio: "我的持仓", rules: "我的规则", privacy: "数据和隐私" };
  const [query, setQuery] = useState("");
  const [remoteMatches, setRemoteMatches] = useState<StockSearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");
  const [validatedQuery, setValidatedQuery] = useState("");
  const [failedQuery, setFailedQuery] = useState("");
  const [marketSession] = useState(() => currentAshareSession());
  const [freshness, setFreshness] = useState<HeaderFreshness>({ state: "checking", quote: "行情检查中", evidence: "公告检查中" });
  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      controller.abort();
      setFreshness({ state: "partial", quote: "数据检查超时", evidence: "打开来源状态可重新检查" });
    }, 15000);
    Promise.allSettled([
      fetch(`/api/information/${stockCode}`, { signal: controller.signal, cache: "no-store" }).then(async (response) => ({ ok: response.ok, body: await response.json() as InformationSnapshot })),
      fetch(`/api/evidence/${stockCode}?reason=${encodeURIComponent("检查公开资料来源状态")}`, { signal: controller.signal, cache: "no-store" }).then(async (response) => ({ ok: response.ok, body: await response.json() as LiveEvidencePayload })),
    ]).then(([quoteResult, evidenceResult]) => {
      if (controller.signal.aborted) return;
      window.clearTimeout(timeout);
      const quote = quoteResult.status === "fulfilled" ? quoteResult.value : undefined;
      const evidence = evidenceResult.status === "fulfilled" ? evidenceResult.value : undefined;
      const quoteReady = Boolean(quote?.ok && quote.body.quote);
      const evidenceCount = evidence?.body.feed?.items?.length ?? 0;
      const evidenceReady = Boolean(evidence?.ok && evidenceCount > 0);
      setFreshness({
        state: quoteReady && evidenceReady ? "ready" : "partial",
        quote: quoteReady ? `行情 ${formatSourceTimestamp(quote?.body.quote?.update_time || quote?.body.fetchedAt)}` : "行情暂不可用",
        evidence: evidenceReady ? `公告 ${formatSourceTimestamp(evidence?.body.feed?.updated_at)} · ${evidenceCount} 条` : evidence?.ok ? "公告暂未返回资料" : "公告暂不可用",
      });
    });
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [stockCode]);
  const visibleFreshness = freshnessOverride?.stockCode === stockCode ? freshnessOverride.value : freshness;
  const localMatches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    return stocks.filter((stock) => stock.name.toLowerCase().includes(normalized) || stock.code.includes(normalized) || stock.industry.toLowerCase().includes(normalized)).slice(0, 5);
  }, [query]);
  useEffect(() => {
    const normalized = query.trim();
    if (!normalized || localMatches.length > 0) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`/api/stocks/search?q=${encodeURIComponent(normalized)}&limit=5`, { signal: controller.signal, cache: "no-store" });
        const payload = await response.json() as { items?: StockSearchItem[] };
        setRemoteMatches(response.ok && Array.isArray(payload.items) ? payload.items : []);
        setValidatedQuery(normalized);
        setFailedQuery(response.ok ? "" : normalized);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setRemoteMatches([]);
          setValidatedQuery(normalized);
          setFailedQuery(normalized);
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 280);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, localMatches.length]);
  const matches = useMemo(() => {
    const remoteStocks = remoteMatches.map((item) => ({ ...createCodeStock(String(item.code).padStart(6, "0")), name: item.name || String(item.code), industry: item.industry || "A股 · 行业待载入" }));
    return [...localMatches, ...remoteStocks.filter((item) => !localMatches.some((local) => local.code === item.code))].slice(0, 5);
  }, [localMatches, remoteMatches]);
  const submitSearch = () => {
    if (matches[0]) { onSelectStock(matches[0]); setQuery(""); }
    else if (/^\d{6}$/.test(query.trim()) && failedQuery === query.trim()) { onSelectStock(createCodeStock(query.trim())); setQuery(""); }
    else if (query.trim() && !searching) setSearchMessage(validatedQuery === query.trim() ? `最近的 A 股证券名单中没有代码 ${query.trim()}` : "正在确认证券代码，请稍候");
  };
  return (
    <header className="app-header">
      <div className="header-title"><strong>{titles[view]}</strong><span>{view === "research" ? "实时行情以页内更新时间为准" : syncStatus === "synced" ? "个人数据已加密标识并同步" : syncStatus === "saving" ? "正在同步个人数据" : syncStatus === "loading" ? "正在读取个人数据" : "云端暂不可用 · 已保存在本设备"}</span></div>
      <form className="global-search" onSubmit={(event) => { event.preventDefault(); submitSearch(); }}>
        <Search />
        <input value={query} onChange={(event) => { setQuery(event.target.value); setRemoteMatches([]); setSearching(false); setSearchMessage(""); }} placeholder="搜索股票、代码或行业" aria-label="搜索股票" autoComplete="off" />
        <kbd>⌘ K</kbd>
        {query && <div className="search-results" role="listbox" aria-label="股票搜索结果">{matches.length > 0 ? matches.map((stock) => <button type="button" role="option" aria-selected="false" key={stock.code} onClick={() => { onSelectStock(stock); setQuery(""); setSearchMessage(""); }}><span><b>{stock.name}</b><small>{stock.code}.{stock.market} · {stock.industry}</small></span><span>{stock.price > 0 ? <><b>{stock.price.toFixed(2)}</b><PriceChange value={stock.change} /></> : <small>载入真实资料</small>}</span></button>) : searching ? <div className="search-empty"><strong>正在搜索 A 股列表…</strong><span>支持股票简称和 6 位代码</span></div> : /^\d{6}$/.test(query.trim()) && failedQuery === query.trim() ? <button type="button" role="option" aria-selected="false" onClick={() => { onSelectStock(createCodeStock(query.trim())); setQuery(""); setSearchMessage(""); }}><span><b>代码名单暂不可用</b><small>仍可尝试从真实行情服务查询 {query.trim()}</small></span><ArrowRight /></button> : <div className="search-empty"><strong>{searchMessage || (validatedQuery === query.trim() ? `没有在 A 股证券名单中找到 ${query.trim()}` : "没有匹配结果")}</strong><span>{validatedQuery === query.trim() ? "请检查代码；不会用指数或样例行情替代" : "可尝试输入 6 位 A 股代码"}</span></div>}</div>}
      </form>
      <div className="header-actions">
        <button className={`header-freshness ${visibleFreshness.state}`} onClick={onDataStatus} aria-label="查看数据与来源状态"><i /><span><b>{marketSession} · {visibleFreshness.quote}</b><small>{visibleFreshness.evidence}</small></span><ChevronRight /></button>
        <a className="header-account" href="/signout-with-chatgpt?return_to=%2F" title={`${userName} · 退出登录`}><span>{userName.slice(0, 1).toUpperCase()}</span><b>{userName}</b><LogOut /></a>
        <Button size="lg" onClick={onNewDecision}><Plus data-icon="inline-start" />新建决策</Button>
      </div>
    </header>
  );
}

function DataStatusDrawer({ stockCode, open, onClose, onStatus }: { stockCode: string; open: boolean; onClose: () => void; onStatus?: (rows: SourceCheck[]) => void }) {
  const [rows, setRows] = useState<SourceCheck[]>(LOADING_SOURCE_CHECKS);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      controller.abort();
      const checkedAt = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
      const timeoutRows: SourceCheck[] = ["行情", "公告", "财报"].map((category) => ({ category, source: "本次检查超时", status: "unavailable", updatedAt: checkedAt, detail: "公开服务未在 12 秒内响应；关闭后可重新打开检查。" }));
      setRows(timeoutRows);
      onStatus?.(timeoutRows);
    }, 12000);
    Promise.allSettled([
      fetch(`/api/information/${stockCode}`, { signal: controller.signal, cache: "no-store" }).then(async (response) => ({ ok: response.ok, body: await response.json() as InformationSnapshot })),
      fetch(`/api/evidence/${stockCode}?reason=${encodeURIComponent("检查公开资料来源状态")}`, { signal: controller.signal, cache: "no-store" }).then(async (response) => ({ ok: response.ok, body: await response.json() as LiveEvidencePayload })),
      fetch(`/api/financial/${stockCode}`, { signal: controller.signal, cache: "no-store" }).then(async (response) => ({ ok: response.ok, body: await response.json() as { report_date?: string; coverage?: { known_checks?: number; total_checks?: number }; data_status?: { is_demo?: boolean; source?: string } } })),
    ]).then(([informationResult, evidenceResult, financialResult]) => {
      if (controller.signal.aborted) return;
      window.clearTimeout(timeout);
      const information = informationResult.status === "fulfilled" ? informationResult.value : undefined;
      const evidence = evidenceResult.status === "fulfilled" ? evidenceResult.value : undefined;
      const financial = financialResult.status === "fulfilled" ? financialResult.value : undefined;
      const evidenceItems = evidence?.body.feed?.items?.length ?? 0;
      const evidenceSources = evidence?.body.feed?.sources ?? [];
      const evidenceSourceLabel = evidenceSources.length ? `${evidenceSources.slice(0, 2).join("、")}${evidenceSources.length > 2 ? ` 等 ${evidenceSources.length} 个来源` : ""}` : "巨潮资讯 / 东方财富公告";
      const knownChecks = financial?.body.coverage?.known_checks ?? 0;
      const totalChecks = financial?.body.coverage?.total_checks ?? 0;
      const nextRows: SourceCheck[] = [
        { category: "行情", source: information?.body.provider || "公开行情接口", status: information?.ok && information.body.quote ? "live" : information?.ok ? "partial" : "unavailable", updatedAt: formatSourceTimestamp(information?.body.quote?.update_time || information?.body.fetchedAt), detail: information?.body.quote ? `已取得 ${information.body.quote.stock_name || stockCode} 最近价格` : information?.body.message || "未取得行情" },
        { category: "公告", source: evidenceSourceLabel, status: evidence?.ok && evidenceItems > 0 ? "live" : evidence?.ok ? "partial" : "unavailable", updatedAt: formatSourceTimestamp(evidence?.body.feed?.updated_at), detail: evidence?.ok ? `取得 ${evidenceItems} 条公开资料，${evidence.body.radar?.official_count ?? 0} 条正式披露` : "公告来源暂不可用" },
        { category: "财报", source: financial?.body.data_status?.source || "公开财务数据", status: financial?.ok && knownChecks > 0 ? knownChecks === totalChecks ? "live" : "partial" : financial?.ok ? "partial" : "unavailable", updatedAt: formatSourceTimestamp(financial?.body.report_date), detail: financial?.ok ? `可完成 ${knownChecks}/${totalChecks || 4} 项财报检查` : "财务来源暂不可用" },
      ];
      setRows(nextRows);
      onStatus?.(nextRows);
    });
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [open, stockCode, onStatus]);
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, onClose]);
  if (!open) return null;
  const statusLabel: Record<SourceCheck["status"], string> = { loading: "检查中", live: "已取得", partial: "部分可用", unavailable: "不可用" };
  return <div className="data-drawer-layer"><button className="data-drawer-backdrop" aria-label="关闭数据状态" onClick={onClose} /><aside className="data-status-drawer" role="dialog" aria-modal="true" aria-label="数据与来源状态">
    <header><div><span>当前股票 {stockCode}</span><h2>数据与来源</h2><p>打开面板时现场检查，不用缓存状态冒充实时。</p></div><Button variant="ghost" size="icon" aria-label="关闭数据状态" onClick={onClose}><X /></Button></header>
    <div className="source-status-list">{rows.map((row) => <article key={row.category}><span className={`source-status-dot ${row.status}`} /><div><span>{row.category}</span><strong>{row.source}</strong><p>{row.detail}</p></div><div><Badge variant="outline">{statusLabel[row.status]}</Badge><time>{row.updatedAt}</time></div></article>)}</div>
    <footer><Database /><span>来源失败时对应功能会显示部分可用或不可用，不使用隐藏演示数据补齐。</span></footer>
  </aside></div>;
}

function SectionHeader({ title, meta, action }: { title: string; meta?: string; action?: React.ReactNode }) {
  return <div className="section-header"><div><h2>{title}</h2>{meta && <span>{meta}</span>}</div>{action}</div>;
}

function EvidenceList({ stockCode, compact = false, liveEvidence }: { stockCode: string; compact?: boolean; liveEvidence?: LiveEvidencePayload }) {
  const liveItems: EvidenceItem[] = liveEvidence?.feed?.items?.map((item) => ({
    date: item.published_at.replace("T", " ").slice(0, 16),
    type: item.category,
    title: item.title,
    status: item.category === "正式披露" ? "已核实来源" : item.category === "媒体报道" ? "需交叉确认" : "观点",
    impact: item.category === "正式披露" ? "优先读原文" : item.category === "媒体报道" ? "交叉确认" : "仅作观点",
    detail: item.summary || item.relation,
    source: item.corroborating_sources && item.corroborating_sources.length > 1 ? `${item.source} 等 ${item.corroborating_sources.length} 个来源` : item.source,
    url: item.url,
  })) ?? [];
  const evidence = liveItems;
  const [expanded, setExpanded] = useState<number | null>(compact ? null : 0);
  const exchange = stockCode.startsWith("0") ? "深圳证券交易所" : "上海证券交易所";
  const originFor = (item: EvidenceItem) => item.source ? item.source : item.type.includes("公告") || item.type.includes("披露") ? `${exchange}披露入口 · 当前未连接单条原文` : item.type.includes("行情") || item.type.includes("数据") ? "固定样例行情 · 非实时数据" : "演示外部线索 · 未连接原帖";
  if (!evidence.length) return <div className={compact ? "evidence-list compact" : "evidence-list"}><article className="evidence-empty"><FileSearch /><div><strong>尚未取得可核实来源</strong><p>请先发起公开资料核实；系统不会用样例公告填充真实证据链。</p></div></article></div>;
  return <div className={compact ? "evidence-list compact" : "evidence-list"}>{evidence.map((item, index) => { const isExpanded = expanded === index; return <article key={`${item.title}-${index}`} className={isExpanded ? "evidence-row expanded" : "evidence-row"}><div className="evidence-marker"><span>{index + 1}</span><i /></div><div className="evidence-content"><div><time>{item.date}</time><span className="evidence-labels"><Badge variant={item.status.includes("待核实") || item.status.includes("交叉") ? "outline" : "secondary"}>{item.type} · {item.status}</Badge>{!compact && <em>{item.impact}</em>}</span></div>{item.url ? <a className="evidence-title-link" href={item.url} target="_blank" rel="noreferrer"><strong>{item.title}</strong><ExternalLink /></a> : <strong>{item.title}</strong>}{isExpanded && <><p>{item.detail}</p><span className="evidence-origin"><Database />{originFor(item)}</span></>}</div><Button variant="ghost" size="icon-sm" aria-expanded={isExpanded} aria-label={`${isExpanded ? "收起" : "展开"} ${item.title}`} onClick={() => setExpanded(isExpanded ? null : index)}>{isExpanded ? <ChevronDown /> : <ChevronRight />}</Button></article>; })}</div>;
}

function RecentTable({ onHistory, records }: { onHistory?: () => void; records: DecisionResult[] }) {
  const rows = records.map((record) => ({ time: record.reviewedAt ?? "最近", stock: record.stock.name, action: record.action, before: `¥${record.originalAmount.toLocaleString()}`, after: record.result === "已延迟" ? "稍后再看" : `¥${record.finalAmount.toLocaleString()}`, result: record.result }));
  return (
    <section className="workspace-section review-table-section">
      <SectionHeader title="最近决策" meta="保留原计划与最终选择" action={onHistory && <Button variant="ghost" size="sm" onClick={onHistory}>全部记录<ChevronRight data-icon="inline-end" /></Button>} />
      <Table>
        <TableHeader><TableRow><TableHead>时间</TableHead><TableHead>股票</TableHead><TableHead>操作</TableHead><TableHead className="numeric">原计划</TableHead><TableHead className="numeric">最终选择</TableHead><TableHead>结果</TableHead></TableRow></TableHeader>
        <TableBody>{rows.slice(0, onHistory ? 3 : 4).map((row) => <TableRow key={row.time + row.stock}><TableCell className="muted-cell">{row.time}</TableCell><TableCell><strong>{row.stock}</strong></TableCell><TableCell>{row.action}</TableCell><TableCell className="numeric">{row.before}</TableCell><TableCell className="numeric">{row.after}</TableCell><TableCell><Badge variant="outline">{row.result}</Badge></TableCell></TableRow>)}</TableBody>
      </Table>
      {rows.length === 0 && <div className="table-empty"><History /><strong>还没有决策记录</strong><span>完成第一次交易前审查后，原计划与最终选择会出现在这里。</span></div>}
    </section>
  );
}

function DeskView({ onDecision, onResearch, onHistory, onPortfolio, latest, records, holdings, watched, rules }: { onDecision: () => void; onResearch: (stock?: Stock) => void; onHistory: () => void; onPortfolio: () => void; latest?: DecisionResult; records: DecisionResult[]; holdings: HoldingBook; watched: WatchBook; rules: UserRules }) {
  const [marketOverview, setMarketOverview] = useState<MarketOverview>({ status: "loading", source: "东方财富公开行情", items: [] });
  const [updates, setUpdates] = useState<DeskUpdate[]>([]);
  const [coverage, setCoverage] = useState<HoldingCoverage[]>([]);
  const [updatesLoading, setUpdatesLoading] = useState(Object.keys(holdings).length + Object.keys(watched).length > 0);
  const [updatesError, setUpdatesError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [refreshedAt, setRefreshedAt] = useState("");
  const [currentTime] = useState(() => Date.now());
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/market/overview", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { status?: "live" | "partial" | "cached" | "unavailable"; source?: string; fetched_at?: string; cached_at?: string; message?: string; items?: Array<{ code: string; name: string; value: number; change: number; updated_at?: string }> };
        setMarketOverview({ status: response.ok ? payload.status ?? "partial" : "unavailable", source: payload.status === "cached" ? `${payload.source ?? "东方财富公开行情"} · 最近缓存` : payload.source ?? "东方财富公开行情", fetchedAt: payload.cached_at ?? payload.fetched_at, message: payload.message, items: (payload.items ?? []).map((item) => ({ ...item, updatedAt: item.updated_at })) });
      })
      .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) setMarketOverview({ status: "unavailable", source: "东方财富公开行情", message: "指数行情暂不可用", items: [] }); });
    return () => controller.abort();
  }, []);
  const holdingEntries = useMemo(() => {
    const entries = new Map(Object.entries(watched).map(([code, item]) => [code, { code, name: item.name, value: 0 }]));
    Object.entries(holdings).forEach(([code, item]) => entries.set(code, { code, ...item }));
    return [...entries.values()].sort((a, b) => b.value - a.value).slice(0, 8);
  }, [holdings, watched]);
  const latestDecisionByCode = useMemo(() => records.reduce<Record<string, DecisionResult>>((result, record) => {
    if (!result[record.stock.code]) result[record.stock.code] = record;
    return result;
  }, {}), [records]);
  useEffect(() => {
    const controller = new AbortController();
    if (!holdingEntries.length) {
      const timer = window.setTimeout(() => { setUpdates([]); setCoverage([]); setUpdatesError(""); setUpdatesLoading(false); }, 0);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => { setUpdatesLoading(true); setUpdatesError(""); }, 0);
    Promise.all(holdingEntries.map(async (holding) => {
      const [informationResult, evidenceResult] = await Promise.allSettled([
        fetch(`/api/information/${holding.code}`, { signal: controller.signal, cache: "no-store" }).then(async (response) => ({ ok: response.ok, payload: await response.json() as InformationSnapshot })),
        fetch(`/api/evidence/${holding.code}?reason=${encodeURIComponent("近期是否有可能影响原判断的正式披露")}`, { signal: controller.signal, cache: "no-store" }).then(async (response) => ({ ok: response.ok, payload: await response.json() as LiveEvidencePayload })),
      ]);
      const information = informationResult.status === "fulfilled" && informationResult.value.ok ? informationResult.value.payload : undefined;
      const evidence = evidenceResult.status === "fulfilled" && evidenceResult.value.ok ? evidenceResult.value.payload : undefined;
      const allAnnouncementItems = evidence?.feed?.items ?? [];
      const meaningfulAnnouncements = allAnnouncementItems.filter((item) => !/H股公告|法律意见书|公司秘书|内幕信息|证券变动月报表|股东会决议|公司章程/.test(item.title));
      const announcementItems = (meaningfulAnnouncements.length ? meaningfulAnnouncements : allAnnouncementItems).slice(0, 2);
      const quote = information?.quote;
      const displayName = quote?.stock_name || stocks.find((item) => item.code === holding.code)?.name || holding.name || holding.code;
      const priorDecision = latestDecisionByCode[holding.code];
      const judgment = priorDecision?.reason?.trim();
      const judgmentImpact = judgment ? "对照最近判断" : "尚未记录判断";
      const itemUpdates: DeskUpdate[] = announcementItems.map((item, index) => {
        const important = /业绩|减持|增持|回购|重大|风险|停牌|重组|处罚/.test(item.title);
        return { id: `${holding.code}-${item.url || index}`, stockCode: holding.code, stockName: displayName, time: item.published_at?.slice(5, 10) || "日期未知", scope: holding.value > 0 ? "持仓" : "关注", source: item.source, title: `${displayName}：${item.title}`, detail: item.summary || "打开公告原文查看完整披露。", impact: judgmentImpact, tone: "uncertain", priority: important || Boolean(judgment) ? "高" : "中", judgment, judgmentTime: priorDecision?.reviewedAt, url: item.url };
      });
      if (quote && Math.abs(quote.change_percent ?? 0) >= 2) itemUpdates.push({ id: `${holding.code}-price`, stockCode: holding.code, stockName: displayName, time: quote.update_time?.slice(5, 10) || "最近交易日", scope: holding.value > 0 ? "持仓" : "关注", source: information?.provider || "公开行情", title: `${displayName}最近交易日变动 ${(quote.change_percent ?? 0) >= 0 ? "+" : ""}${(quote.change_percent ?? 0).toFixed(2)}%`, detail: `最近收盘价 ¥${quote.current_price.toFixed(2)}。价格变化不等同于公司基本面发生变化。`, impact: judgmentImpact, tone: "uncertain", priority: Math.abs(quote.change_percent ?? 0) >= 5 || Boolean(judgment) ? "高" : "中", judgment, judgmentTime: priorDecision?.reviewedAt });
      return { updates: itemUpdates, coverage: { code: holding.code, name: displayName, status: information || evidence ? information && evidence ? "ready" as const : "partial" as const : "unavailable" as const, price: quote?.current_price, change: quote?.change_percent, announcementCount: evidence?.radar?.official_count ?? announcementItems.length, provider: information?.provider } };
    }))
      .then((results) => {
        if (controller.signal.aborted) return;
        setUpdates(results.flatMap((result) => result.updates).sort((a, b) => b.time.localeCompare(a.time)).slice(0, 8));
        setCoverage(results.map((result) => result.coverage));
        setRefreshedAt(new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }));
        if (results.every((result) => result.coverage.status === "unavailable")) setUpdatesError("公开数据源暂时不可用，请稍后重试。");
      })
      .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) setUpdatesError("公开资料读取失败，请稍后重试。"); })
      .finally(() => { if (!controller.signal.aborted) setUpdatesLoading(false); });
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [holdingEntries, latestDecisionByCode, reloadKey]);
  const officialCount = coverage.reduce((sum, item) => sum + item.announcementCount, 0);
  const priceReadyCount = coverage.filter((item) => typeof item.price === "number").length;
  const positions = Object.entries(holdings).map(([code, item]) => ({ code, ...item, name: coverage.find((entry) => entry.code === code)?.name || stocks.find((entry) => entry.code === code)?.name || item.name || code, ratio: rules.investableCapital > 0 ? item.value / rules.investableCapital * 100 : 0 })).sort((a, b) => b.value - a.value);
  const largestPosition = positions[0];
  const boundaryConflict = largestPosition && (largestPosition.ratio > rules.maxSingleStockRatio || largestPosition.value > rules.maxSingleStockValue) ? largestPosition : undefined;
  const leadingUpdate = updates.find((item) => item.priority === "高") ?? updates[0];
  const dueDecision = records.find((record) => (reviewDueDate(record)?.getTime() ?? Infinity) <= currentTime);
  const coveredCount = coverage.filter((item) => item.status !== "unavailable").length;
  const targetFor = (code: string, name: string) => stocks.find((stock) => stock.code === code) ?? { ...createCodeStock(code), name };
  return (
    <main className="workbench-page view-enter" id="main-content">
      <section className={`market-context-strip ${marketOverview.status}`} aria-label="主要市场指数">
        <div className="market-context-label"><span>市场</span><strong>{currentAshareSession()}</strong></div>
        {marketOverview.status === "loading" ? <div className="market-context-loading"><i /><i /><i /></div> : marketOverview.items.length > 0 ? <div className="market-index-list">{marketOverview.items.map((item) => <article key={item.code}><span>{item.name}</span><strong>{item.value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong><PriceChange value={item.change} /></article>)}</div> : <div className="market-context-unavailable"><TriangleAlert /><span>{marketOverview.message ?? "指数行情暂不可用"}</span></div>}
        <div className="market-context-source"><span>{marketOverview.source}</span><time>{marketOverview.fetchedAt ? formatSourceTimestamp(marketOverview.fetchedAt) : "正在连接"}</time></div>
      </section>
      <section className={`workbench-priority ${boundaryConflict ? "attention" : dueDecision || leadingUpdate ? "information" : "quiet"}`}>
        <div className="workbench-section-title"><span>现在先处理</span>{refreshedAt && <time>更新于 {refreshedAt}</time>}</div>
        {boundaryConflict ? <div className="priority-editorial">
          <span className="priority-signal"><TriangleAlert /></span>
          <div><small>持仓边界</small><h1>{boundaryConflict.name}占记录资金 {boundaryConflict.ratio.toFixed(1)}%</h1><p>你的单股比例上限为 {rules.maxSingleStockRatio}%，当前持仓金额 ¥{boundaryConflict.value.toLocaleString()}。</p></div>
          <div className="priority-scale" aria-label={`${boundaryConflict.name}持仓比例 ${boundaryConflict.ratio.toFixed(1)}%，个人上限 ${rules.maxSingleStockRatio}%`}><span><i style={{ width: `${Math.min(boundaryConflict.ratio, 100)}%` }} /><b style={{ left: `${Math.min(rules.maxSingleStockRatio, 100)}%` }} /></span><small>当前 {boundaryConflict.ratio.toFixed(1)}%</small><small>上限 {rules.maxSingleStockRatio}%</small></div>
          <Button onClick={() => onResearch(targetFor(boundaryConflict.code, boundaryConflict.name))}>查看持仓影响<ArrowRight data-icon="inline-end" /></Button>
        </div> : dueDecision ? <div className="priority-editorial">
          <span className="priority-signal verified"><CalendarClock /></span>
          <div><small>判断已到复核时间</small><h1>{dueDecision.stock.name} · 回到当时的理由和证据</h1><p>{dueDecision.reason || "这条记录已到你设置的观察期限。"}</p></div>
          <div className="priority-fact"><span>当时的选择</span><strong>{dueDecision.action} · {dueDecision.result}</strong><small>观察期限 {dueDecision.horizon ?? "1个月"}</small></div>
          <Button onClick={onHistory}>开始重新核实<ArrowRight data-icon="inline-end" /></Button>
        </div> : leadingUpdate ? <div className="priority-editorial">
          <span className="priority-signal verified"><FileSearch /></span>
          <div><small>{leadingUpdate.source} · {leadingUpdate.time}</small><h1>{leadingUpdate.title}</h1><p>{leadingUpdate.detail}</p></div>
          <div className="priority-fact"><span>与你的关系</span><strong>{leadingUpdate.scope} · {leadingUpdate.impact}</strong><small>{leadingUpdate.judgment ? `最近记录：${leadingUpdate.judgment}` : "先建立判断，后续变化才能自动回到原问题"}</small></div>
          <Button onClick={() => onResearch(targetFor(leadingUpdate.stockCode, leadingUpdate.stockName))}>打开研究<ArrowRight data-icon="inline-end" /></Button>
        </div> : positions.length === 0 ? <div className="priority-editorial">
          <span className="priority-signal neutral"><BriefcaseBusiness /></span>
          <div><small>尚无持仓</small><h1>先导入持仓，工作台才知道哪些变化与你有关</h1><p>只需股票代码、名称和用于计算的金额；不连接证券账户。</p></div>
          <div className="priority-fact"><span>需要填写</span><strong>代码 · 名称 · 金额</strong><small>可使用模拟数据</small></div>
          <Button onClick={onPortfolio}>导入持仓<ArrowRight data-icon="inline-end" /></Button>
        </div> : <div className="priority-editorial">
          <span className="priority-signal verified"><CheckCircle2 /></span>
          <div><small>本次检查完成</small><h1>当前没有需要立即处理的事项</h1><p>已检查 {coveredCount}/{positions.length} 只持仓；有交易计划时再进入审查。</p></div>
          <div className="priority-fact"><span>正式披露</span><strong>{officialCount} 条</strong><small>行情已载入 {priceReadyCount}/{positions.length}</small></div>
          <Button variant="outline" onClick={onDecision}>新建审查<ArrowRight data-icon="inline-end" /></Button>
        </div>}
      </section>

      <div className="workbench-grid">
        <section className="workbench-changes">
          <div className="workbench-section-title"><div><span>与你有关的变化</span><small>真实行情与法定披露</small></div>{positions.length > 0 && <Button variant="ghost" size="sm" onClick={() => setReloadKey((value) => value + 1)} disabled={updatesLoading}>{updatesLoading ? "检查中…" : "重新检查"}</Button>}</div>
          <div className="change-timeline">{updatesLoading ? Array.from({ length: Math.min(4, Math.max(2, holdingEntries.length)) }).map((_, index) => <div key={index} className="timeline-loading"><i /><span><b /><b /><b /></span></div>) : updates.map((item) => <article key={item.id} className={item.priority === "高" ? "high" : ""}>
            <div className="timeline-date"><strong>{item.time}</strong><span>{item.source}</span></div>
            <span className="timeline-node"><i /></span>
            <button onClick={() => onResearch(targetFor(item.stockCode, item.stockName))}><span><Badge variant="outline">{item.stockName}</Badge><em>{item.impact}</em></span><strong>{item.title}</strong><p>{item.detail}</p>{item.judgment && <small className="timeline-judgment">最近判断：{item.judgment}</small>}</button>
            <div className="timeline-action">{item.url ? <a href={item.url} target="_blank" rel="noreferrer">原始来源<ExternalLink /></a> : <span>进入研究页核实</span>}<ChevronRight /></div>
          </article>)}</div>
          {!updatesLoading && updatesError && <div className="inbox-empty error"><TriangleAlert /><strong>公开资料暂时不可用</strong><span>{updatesError}</span><Button variant="outline" size="sm" onClick={() => setReloadKey((value) => value + 1)}>重试</Button></div>}
          {!updatesLoading && !updatesError && positions.length === 0 && <div className="inbox-empty"><BriefcaseBusiness /><strong>还没有与你相关的变化</strong><span>导入持仓后，这里会按股票整理真实公告与行情。</span><Button variant="outline" size="sm" onClick={onPortfolio}>导入持仓</Button></div>}
          {!updatesLoading && !updatesError && positions.length > 0 && updates.length === 0 && <div className="inbox-empty"><CheckCircle2 /><strong>已完成检查</strong><span>当前没有取得需要展开的变化。</span></div>}
          {!updatesLoading && updates.length > 0 && <div className="timeline-footer">本次取得 {updates.length} 条变化 · {officialCount} 条正式披露</div>}
        </section>

        <aside className="portfolio-exposure">
          <div className="workbench-section-title"><div><span>组合暴露</span><small>按单股持仓</small></div><Badge variant="outline">{updatesLoading ? "检查中" : `${coveredCount}/${positions.length} 已覆盖`}</Badge></div>
          <div className="exposure-legend"><span><i />当前占比</span><span><b />个人上限 {rules.maxSingleStockRatio}%</span></div>
          <div className="exposure-ranking">{positions.slice(0, 6).map((position, index) => { const live = coverage.find((item) => item.code === position.code); const over = position.ratio > rules.maxSingleStockRatio || position.value > rules.maxSingleStockValue; return <button key={position.code} onClick={() => onResearch(targetFor(position.code, position.name))}>
            <span className="exposure-rank">{index + 1}</span><span className="exposure-name"><strong>{position.name}</strong><small>{position.code}{live?.status === "unavailable" ? " · 资料不可用" : ""}</small></span>
            <span className="exposure-bar"><i className={over ? "over" : ""} style={{ width: `${Math.min(position.ratio / Math.max(rules.maxSingleStockRatio * 1.35, position.ratio, 1) * 100, 100)}%` }} /><b style={{ left: `${Math.min(rules.maxSingleStockRatio / Math.max(rules.maxSingleStockRatio * 1.35, position.ratio, 1) * 100, 100)}%` }} /></span>
            <span className={over ? "exposure-value over" : "exposure-value"}><strong>{position.ratio.toFixed(1)}%</strong>{typeof live?.change === "number" ? <PriceChange value={live.change} /> : <small>¥{position.value.toLocaleString()}</small>}</span>
          </button>; })}</div>
          {positions.length === 0 && <div className="exposure-empty"><BriefcaseBusiness /><strong>暂无持仓</strong><span>导入后显示单股占比与边界。</span></div>}
          <div className="exposure-total"><span>记录资金</span><strong>¥{rules.investableCapital.toLocaleString()}</strong><span>已填写持仓 ¥{positions.reduce((sum, item) => sum + item.value, 0).toLocaleString()}</span></div>
          <Button variant="ghost" onClick={onPortfolio}>查看完整持仓<ArrowRight data-icon="inline-end" /></Button>
        </aside>
      </div>

      {latest && <section className="latest-decision-strip"><div><span>最近一次审查</span><strong>{latest.stock.name} · {latest.action}</strong><small>{latest.reviewedAt ?? "最近"}</small></div><div><span>原计划</span><strong>¥{latest.originalAmount.toLocaleString()}</strong></div><ArrowRight /><div><span>最终选择</span><strong>{latest.result === "已延迟" ? "稍后再看" : `¥${latest.finalAmount.toLocaleString()}`}</strong></div><Badge variant="outline">{latest.result}</Badge><Button variant="ghost" size="sm" onClick={onHistory}>查看记录<ChevronRight data-icon="inline-end" /></Button></section>}
        <RecentTable onHistory={onHistory} records={records} />
    </main>
  );
}

function StockRail({ selected, onSelect, followedStocks, liveQuote, holdings }: { selected: Stock; onSelect: (stock: Stock) => void; followedStocks: Record<string, boolean>; liveQuote?: LiveQuote; holdings: HoldingBook }) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<"关注" | "持仓" | "最近">("关注");
  const holdingCodes = new Set(Object.keys(holdings));
  const availableStocks = stocks.some((stock) => stock.code === selected.code) ? stocks : [selected, ...stocks];
  const filteredStocks = availableStocks.filter((stock) => {
    const matchesQuery = stock.name.includes(query.trim()) || stock.code.includes(query.trim()) || stock.industry.includes(query.trim());
    if (!matchesQuery) return false;
    if (stock.code === selected.code) return true;
    if (group === "关注") return followedStocks[stock.code] === true;
    if (group === "持仓") return holdingCodes.has(stock.code);
    if (group === "最近") return ["600183", "688981", "600519"].includes(stock.code);
    return true;
  });
  return (
    <aside className="context-rail stock-rail">
      <div className="stock-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="筛选股票" placeholder="名称、代码或行业" /></div>
      <div className="rail-tabs">{(["关注", "持仓", "最近"] as const).map((item) => <button key={item} className={group === item ? "active" : ""} onClick={() => setGroup(item)}>{item}</button>)}</div>
      <div className="stock-rail-list">{filteredStocks.map((stock) => { const isLiveSelection = Boolean(stock.code === selected.code && liveQuote); const price = isLiveSelection ? liveQuote?.current_price : undefined; const change = isLiveSelection ? liveQuote?.change_percent : undefined; return <button key={stock.code} className={stock.code === selected.code ? "active" : ""} onClick={() => onSelect(stock)}><span className="stock-ident"><i>{stock.name.slice(0, 1)}</i><span><b>{isLiveSelection && liveQuote?.stock_name ? liveQuote.stock_name : stock.name}</b><small>{stock.code}.{stock.market}</small></span></span><span className="stock-quote">{typeof price === "number" ? <><b>{price.toFixed(2)}</b><PriceChange value={change ?? 0} /></> : <small>打开后载入</small>}</span></button>; })}{filteredStocks.length === 0 && <div className="rail-empty"><Search /><strong>没有匹配股票</strong><span>可尝试输入 6 位代码</span></div>}</div>
      <div className="context-link static">当前列表 {filteredStocks.length} 只 · 已选股票与本地关注</div>
    </aside>
  );
}

function StartDecisionView({ stock, onSelect, action, setAction, onResearch, onContinue, holdings, capital }: { stock: Stock; onSelect: (stock: Stock) => void; action: TradeAction; setAction: (action: TradeAction) => void; onResearch: () => void; onContinue: () => void; holdings: HoldingBook; capital: number }) {
  const [query, setQuery] = useState("");
  const [remoteMatches, setRemoteMatches] = useState<StockSearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const holdingValue = holdingValueFor(holdings, stock.code);
  const holdingRatio = capital > 0 ? holdingValue / capital * 100 : 0;
  const localMatches = useMemo(() => stocks.filter((item) => item.name.includes(query.trim()) || item.code.includes(query.trim()) || item.industry.includes(query.trim())), [query]);
  useEffect(() => {
    const normalized = query.trim();
    if (!normalized || localMatches.length > 0) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/stocks/search?q=${encodeURIComponent(normalized)}&limit=8`, { signal: controller.signal, cache: "no-store" });
        const payload = await response.json() as { items?: StockSearchItem[] };
        setRemoteMatches(response.ok && Array.isArray(payload.items) ? payload.items : []);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setRemoteMatches([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 280);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, localMatches.length]);
  const matches = useMemo(() => {
    if (localMatches.length > 0) return localMatches;
    const remoteStocks = remoteMatches.map((item) => ({ ...createCodeStock(String(item.code).padStart(6, "0")), name: item.name || String(item.code), industry: item.industry || "A股 · 行业待载入" }));
    if (remoteStocks.length > 0) return remoteStocks;
    return /^\d{6}$/.test(query.trim()) && !searching ? [createCodeStock(query.trim())] : [];
  }, [localMatches, query, remoteMatches, searching]);
  const actions: TradeAction[] = ["买入", "补仓", "卖出", "继续观察"];
  return (
    <main className="start-decision-page view-enter" id="main-content">
      <section className="workspace start-decision-workspace">
        <header className="start-decision-header">
          <div><Badge variant="outline">交易前审查</Badge><h1>选择股票和准备进行的操作</h1><p>系统会使用当前持仓、个人边界和该股票的证据进入下一步。</p></div>
          <span className="data-provenance"><Database /><b>股票与持仓</b><small>行情进入研究页后核实</small></span>
        </header>
        <div className="start-decision-grid">
          <section className="stock-picker-panel">
            <label className="stock-picker-search"><Search /><input value={query} onChange={(event) => { const next = event.target.value; setQuery(next); setRemoteMatches([]); const normalized = next.trim(); const hasLocal = stocks.some((item) => item.name.includes(normalized) || item.code.includes(normalized) || item.industry.includes(normalized)); setSearching(Boolean(normalized) && !hasLocal); }} placeholder="输入股票名称、代码或行业，例如半导体" aria-label="选择决策股票" /></label>
            <div className="stock-picker-heading"><strong>选择股票</strong><span>{searching ? "正在搜索 A 股列表…" : `${matches.length} 只可用`}</span></div>
            <div className="stock-picker-list">{matches.map((item) => { const held = holdingValueFor(holdings, item.code); return <button key={item.code} className={item.code === stock.code ? "selected" : ""} aria-pressed={item.code === stock.code} onClick={() => onSelect(item)}><span className="stock-picker-ident"><i>{item.name.slice(0, 1)}</i><span><strong>{item.name}</strong><small>{item.code}.{item.market} · {item.industry}</small></span></span><span className="stock-picker-quote"><small>研究页载入行情</small></span><span className="holding-state">{held > 0 ? `持仓 ¥${held.toLocaleString()}` : "未持仓"}</span><CheckCircle2 /></button>; })}{matches.length === 0 && <div className="stock-picker-empty"><Search /><strong>{searching ? "正在搜索 A 股列表…" : "没有找到匹配股票"}</strong><span>{searching ? "支持股票简称和 6 位代码" : "可输入股票简称、6 位代码或行业关键词"}</span></div>}</div>
          </section>
          <aside className="decision-setup-panel">
            <div className="selected-stock-summary"><span><i>{stock.name.slice(0, 1)}</i><span><small>当前选择</small><strong>{stock.name}</strong><em>{stock.code}.{stock.market}</em></span></span><Badge variant="outline">待核实行情</Badge></div>
            <dl><div><dt>当前持仓</dt><dd>{holdingValue > 0 ? `¥${holdingValue.toLocaleString()}` : "尚无持仓"}</dd></div><div><dt>占记录资产</dt><dd>{holdingValue > 0 ? `${holdingRatio.toFixed(1)}%` : "0.0%"}</dd></div><div><dt>行情数据</dt><dd>进入研究页后载入</dd></div></dl>
            <div className="setup-action"><strong>准备做什么？</strong><div className="action-segments" role="radiogroup" aria-label="新决策操作">{actions.map((item) => { const unavailable = holdingValue === 0 && (item === "补仓" || item === "卖出"); return <button key={item} role="radio" aria-checked={action === item} className={action === item ? "active" : ""} disabled={unavailable} onClick={() => setAction(item)}>{action === item && <Check />}{item}</button>; })}</div></div>
            <div className="setup-note"><ShieldCheck /><p><strong>下一步会检查</strong><span>计划金额、仓位上限、下跌情景和理由证据。</span></p></div>
            <div className="setup-actions"><Button variant="outline" size="lg" onClick={onResearch}>先查看研究</Button><Button size="lg" onClick={action === "继续观察" ? onResearch : onContinue}>{action === "继续观察" ? "进入股票研究" : "继续填写计划"}<ArrowRight data-icon="inline-end" /></Button></div>
          </aside>
        </div>
      </section>
    </main>
  );
}

function buildComparablePath(points: LiveHistoryPoint[], minimum: number, maximum: number) {
  const spread = Math.max(maximum - minimum, 0.01);
  return points.map((point, index) => {
    const x = index / Math.max(points.length - 1, 1) * 690;
    const y = 174 - ((Number(point.close) - minimum) / spread) * 148;
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
}

function PriceChart({ stock, liveHistory, events, holdingValue, capital }: { stock: Stock; liveHistory?: LiveHistoryPoint[]; events: Array<{ date: string; type: string; title: string; detail: string; source: string; url: string }>; holdingValue: number; capital: number }) {
  const [range, setRange] = useState<"1月" | "3月" | "1年">("1月");
  const [selectedEventIndex, setSelectedEventIndex] = useState(0);
  const [benchmark, setBenchmark] = useState<LiveHistoryPoint[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/market/benchmark", { cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? await response.json() as { data?: LiveHistoryPoint[] } : { data: [] })
      .then((payload) => setBenchmark(payload.data ?? []))
      .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) setBenchmark([]); });
    return () => controller.abort();
  }, []);
  const rangeDays = { "1月": 22, "3月": 66, "1年": 250 }[range];
  const livePoints = liveHistory && liveHistory.length > 1 ? liveHistory.slice(-rangeDays) : undefined;
  if (!livePoints) return <div className="event-chart-empty"><TriangleAlert /><span><strong>历史价格暂不可用</strong><small>系统不会用样例曲线替代；恢复数据源后可重新打开本页。</small></span></div>;
  const benchmarkByDate = new Map(benchmark.map((point) => [point.date.slice(0, 10), point.close]));
  const benchmarkBase = benchmarkByDate.get(livePoints[0].date.slice(0, 10));
  const stockBase = Number(livePoints[0].close);
  const benchmarkComparable = benchmarkBase ? livePoints.map((point) => ({ date: point.date, close: stockBase * ((benchmarkByDate.get(point.date.slice(0, 10)) ?? benchmarkBase) / benchmarkBase) })) : [];
  const combinedValues = [...livePoints, ...benchmarkComparable].map((point) => Number(point.close));
  const chartHigh = Math.max(...combinedValues);
  const chartLow = Math.min(...combinedValues);
  const chartPath = buildComparablePath(livePoints, chartLow, chartHigh);
  const benchmarkPath = benchmarkComparable.length > 1 ? buildComparablePath(benchmarkComparable, chartLow, chartHigh) : "";
  const axisPrecision = stock.price >= 100 ? 0 : 2;
  const axisValues = [0, 1 / 3, 2 / 3, 1].map((step) => (chartHigh - (chartHigh - chartLow) * step).toFixed(axisPrecision));
  const dateLabels = [livePoints[0].date, livePoints[Math.floor(livePoints.length / 3)].date, livePoints[Math.floor(livePoints.length * 2 / 3)].date, livePoints.at(-1)?.date ?? ""];
  const liveVolumes = livePoints.map((point) => Number(point.volume ?? 0));
  const maxVolume = Math.max(...liveVolumes, 1);
  const volumes = liveVolumes.map((value) => Math.max(8, value / maxVolume * 100));
  const eventMarkers = events.map((event) => {
    const pointIndex = livePoints.findIndex((point) => point.date >= event.date);
    if (pointIndex < 0 || event.date < livePoints[0].date || event.date > (livePoints.at(-1)?.date ?? "")) return undefined;
    const point = livePoints[pointIndex];
    const nextPoint = livePoints[Math.min(pointIndex + 1, livePoints.length - 1)];
    const fifthPoint = livePoints[Math.min(pointIndex + 5, livePoints.length - 1)];
    const x = pointIndex / (livePoints.length - 1) * 690;
    const y = 174 - ((Number(point.close) - chartLow) / Math.max(chartHigh - chartLow, 0.01)) * 148;
    const nextChange = point.close ? (nextPoint.close / point.close - 1) * 100 : 0;
    const fifthChange = point.close ? (fifthPoint.close / point.close - 1) * 100 : 0;
    const benchmarkAtEvent = benchmarkByDate.get(point.date.slice(0, 10));
    const benchmarkAfter = benchmarkByDate.get(fifthPoint.date.slice(0, 10));
    const benchmarkChange = benchmarkAtEvent && benchmarkAfter ? (benchmarkAfter / benchmarkAtEvent - 1) * 100 : undefined;
    return { ...event, pointIndex, point, nextPoint, fifthPoint, nextChange, fifthChange, benchmarkChange, x, y };
  }).filter((item): item is NonNullable<typeof item> => Boolean(item)).sort((a, b) => a.date.localeCompare(b.date)).slice(-4);
  const activeEventIndex = Math.min(selectedEventIndex, Math.max(eventMarkers.length - 1, 0));
  const selectedEvent = eventMarkers[activeEventIndex];
  const mechanicalImpact = selectedEvent && holdingValue > 0 ? holdingValue * selectedEvent.nextChange / 100 : 0;
  return (
    <div className="chart-block">
      <div className="chart-toolbar"><div><strong>{livePoints.length} 个交易日</strong><span>真实历史数据</span><small>{livePoints.length < rangeDays ? `当前来源仅覆盖 ${livePoints.length} 个交易日，少于所选 ${range}` : `数据区间：最高 ${chartHigh.toFixed(axisPrecision)} · 最低 ${chartLow.toFixed(axisPrecision)}`}</small></div><div className="range-selector">{(["1月", "3月", "1年"] as const).map((item) => <button key={item} className={range === item ? "active" : ""} onClick={() => setRange(item)}>{item}</button>)}</div></div>
      <div className="chart-wrap">
      <div className="chart-grid">{axisValues.map((value) => <span key={value}>{value}</span>)}</div>
      <svg viewBox="0 0 690 190" role="img" aria-label={`${stock.name}${range}价格走势`} preserveAspectRatio="none">
        <defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity=".2"/><stop offset="100%" stopColor="var(--primary)" stopOpacity="0"/></linearGradient></defs>
        <path className="chart-area" d={`${chartPath} L690 190 L0 190 Z`} />
        <path className="chart-line" d={chartPath} />
        {benchmarkPath && <path className="chart-benchmark-line" d={benchmarkPath} />}
        {eventMarkers.map((event, index) => <g key={`${event.date}-${event.title}`} className={index === activeEventIndex ? "chart-event-marker active" : "chart-event-marker"}><line x1={event.x} x2={event.x} y1="18" y2="178" /><circle cx={event.x} cy={event.y} r={index === activeEventIndex ? 6 : 4} /><text x={event.x} y="14" textAnchor="middle">{index + 1}</text></g>)}
      </svg>
      <div className="chart-dates">{dateLabels.map((date) => <span key={date}>{date.slice(0, 10)}</span>)}</div>
      </div>
      <div className="volume-strip" aria-label="成交量变化">{volumes.map((value, index) => <i key={index} style={{ height: `${value}%` }} />)}</div>
      <div className="chart-legend"><span><i className="price-line-key" />{stock.name}</span>{benchmarkPath && <span><i className="benchmark-line-key" />沪深300（同起点）</span>}<span><i className="event-key" />公司事件</span><span><i className="volume-key" />成交量</span></div>
      {eventMarkers.length > 0 ? <section className="event-price-bridge" aria-label="事件与价格变化对照">
        <div className="event-marker-list">{eventMarkers.map((event, index) => <button key={`${event.date}-${event.title}`} className={index === activeEventIndex ? "active" : ""} onClick={() => setSelectedEventIndex(index)}><i>{index + 1}</i><span><small>{event.date} · {event.type}</small><strong>{event.title}</strong></span></button>)}</div>
        {selectedEvent && <article className="selected-event-impact"><header><span><Badge variant="outline">事件 {activeEventIndex + 1}</Badge><small>{selectedEvent.source}</small></span>{selectedEvent.url && <a href={selectedEvent.url} target="_blank" rel="noreferrer">原始来源<ExternalLink /></a>}</header><h3>{selectedEvent.title}</h3><p>{selectedEvent.detail}</p><div className="event-impact-metrics"><div><span>下一交易日</span><strong className={selectedEvent.nextChange >= 0 ? "price-up" : "price-down"}>{selectedEvent.nextChange >= 0 ? "+" : ""}{selectedEvent.nextChange.toFixed(2)}%</strong><small>{selectedEvent.nextPoint.date.slice(0, 10)}</small></div><ArrowRight /><div><span>随后 5 个交易日</span><strong className={selectedEvent.fifthChange >= 0 ? "price-up" : "price-down"}>{selectedEvent.fifthChange >= 0 ? "+" : ""}{selectedEvent.fifthChange.toFixed(2)}%</strong><small>{typeof selectedEvent.benchmarkChange === "number" ? `同期沪深300 ${selectedEvent.benchmarkChange >= 0 ? "+" : ""}${selectedEvent.benchmarkChange.toFixed(2)}%` : "基准数据暂不可用"}</small></div><ArrowRight /><div><span>按当前持仓机械换算</span><strong>{holdingValue > 0 ? `${mechanicalImpact >= 0 ? "+" : "−"}¥${Math.abs(mechanicalImpact).toLocaleString("zh-CN", { maximumFractionDigits: 0 })}` : "尚无持仓"}</strong><small>{holdingValue > 0 ? `按下一交易日 · 占记录资金 ${capital > 0 ? (holdingValue / capital * 100).toFixed(1) : "0.0"}%` : "导入持仓后显示金额影响"}</small></div></div><footer>时间相邻不代表因果；跑赢基准也不能证明事件是价格变化原因。金额仅按价格变化机械换算。</footer></article>}
      </section> : <div className="event-chart-empty"><FileSearch /><span><strong>当前价格区间内没有可定位事件</strong><small>取得带日期的正式披露后，事件会标注在价格曲线上。</small></span></div>}
    </div>
  );
}

function ResearchActionPanel({ stock, action, setAction, onDecision, saved, onSave, dataStatus, holdings, capital }: { stock: Stock; action: TradeAction; setAction: (action: TradeAction) => void; onDecision: () => void; saved: boolean; onSave: () => void; dataStatus: InformationSnapshot["status"] | "loading"; holdings: HoldingBook; capital: number }) {
  const actions: TradeAction[] = ["买入", "补仓", "卖出", "继续观察"];
  const holdingValue = holdingValueFor(holdings, stock.code);
  const holdingRatio = capital > 0 ? holdingValue / capital * 100 : 0;
  const instrumentUnavailable = dataStatus === "fallback";
  return (
    <aside className="research-aside">
      <div className="aside-heading"><Target /><div><h2>准备做什么</h2><p>针对 {stock.name}</p></div></div>
      <div className="action-segments" role="radiogroup" aria-label="选择操作">{actions.map((item) => { const unavailable = holdingValue === 0 && (item === "补仓" || item === "卖出"); return <button key={item} role="radio" aria-checked={action === item} className={action === item ? "active" : ""} disabled={unavailable} title={unavailable ? "当前没有这只股票的持仓" : undefined} onClick={() => setAction(item)}>{action === item && <Check />}{item}</button>; })}</div>
      <div className="action-summary"><span>当前持仓</span><strong>{holdingValue > 0 ? `¥${holdingValue.toLocaleString()}` : "尚无持仓"}</strong><small>{holdingValue > 0 ? `占记录资产 ${holdingRatio.toFixed(1)}%` : "可从买入或继续观察开始"}</small></div>
      <Separator />
      <div className="aside-checks"><h3>进入决策前</h3><p><CheckCircle2 />{dataStatus === "live" ? "实时行情与历史价格已载入" : dataStatus === "partial" ? "部分实时数据已载入" : dataStatus === "loading" ? "正在连接行情服务" : "证券代码或行情尚未确认"}</p><p><TriangleAlert />{instrumentUnavailable ? "请先检查证券代码后重试" : "1 条外部信息待核实"}</p><p><Gauge />进入后计算仓位与下跌情景</p></div>
      <Button size="lg" onClick={onDecision} disabled={action === "继续观察" || instrumentUnavailable}>{instrumentUnavailable ? "等待标的确认" : action === "继续观察" ? "已加入观察" : `开始${action}审查`}<ArrowRight data-icon="inline-end" /></Button>
      <button className={saved ? "aside-secondary saved" : "aside-secondary"} onClick={onSave}>{saved ? <CheckCircle2 /> : <Bookmark />}{saved ? "已保存在本次会话" : "保存研究档案"}</button>
    </aside>
  );
}

function ResearchView({ stock, setStock, action, setAction, onDecision, holdings, watched, onWatch, capital, records }: { stock: Stock; setStock: (stock: Stock) => void; action: TradeAction; setAction: (action: TradeAction) => void; onDecision: (context?: ResearchDecisionContext) => void; holdings: HoldingBook; watched: WatchBook; onWatch: (stock: Stock, followed: boolean) => void; capital: number; records: DecisionResult[] }) {
  const [panel, setPanel] = useState<"概览" | "财报体检" | "价格与事件" | "证据链" | "待验证问题">("价格与事件");
  const [researchQuery, setResearchQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const followedStocks = useMemo(() => Object.fromEntries(Object.keys(watched).map((code) => [code, true])), [watched]);
  const [savedResearch, setSavedResearch] = useState<Record<string, boolean>>({});
  const [information, setInformation] = useState<InformationSnapshot>();
  const [researchEvidence, setResearchEvidence] = useState<ResearchEvidenceSnapshot>();
  const [financialQuery, setFinancialQuery] = useState<FinancialQuerySnapshot>();
  const profile = researchProfiles[stock.code] ?? genericResearchProfile;
  const recordedJudgment = records.find((record) => record.stock.code === stock.code && Boolean(record.reason?.trim()));
  useEffect(() => {
    const savedQuestion = recordedJudgment?.reason?.trim() ?? "";
    const frame = window.requestAnimationFrame(() => {
      setResearchQuery(savedQuestion);
      setSubmittedQuery(savedQuestion);
      setPanel("价格与事件");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [stock.code, recordedJudgment?.reason]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/information/${stock.code}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as InformationSnapshot;
        setInformation({ ...payload, requestedCode: stock.code, status: response.ok ? payload.status : "fallback" });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setInformation({ requestedCode: stock.code, status: "fallback", message: "实时服务暂不可用" });
      });
    return () => controller.abort();
  }, [stock.code]);
  useEffect(() => {
    const controller = new AbortController();
    const requestedCode = stock.code;
    const requestedQuery = submittedQuery;
    const timer = window.setTimeout(() => setResearchEvidence({ requestedCode, requestedQuery, status: "loading" }), 0);
    fetch(`/api/evidence/${stock.code}?reason=${encodeURIComponent(submittedQuery)}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as LiveEvidencePayload;
        setResearchEvidence({ requestedCode, requestedQuery, status: response.ok ? "ready" : "fallback", payload: response.ok ? payload : undefined });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setResearchEvidence({ requestedCode, requestedQuery, status: "fallback" });
      });
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [stock.code, submittedQuery]);
  const needsFinancialQuery = /财报|营收|利润|现金流|应收|存货|负债/.test(submittedQuery);
  useEffect(() => {
    if (!needsFinancialQuery) return;
    const controller = new AbortController();
    const requestedCode = stock.code;
    const requestedQuery = submittedQuery;
    fetch(`/api/financial/${stock.code}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as FinancialQuerySnapshot["payload"];
        setFinancialQuery({ requestedCode, requestedQuery, status: response.ok ? "ready" : "fallback", payload: response.ok ? payload : undefined });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFinancialQuery({ requestedCode, requestedQuery, status: "fallback" });
      });
    return () => controller.abort();
  }, [needsFinancialQuery, stock.code, submittedQuery]);
  const hasRecordedJudgment = Boolean(recordedJudgment);
  const followed = followedStocks[stock.code] ?? false;
  const saved = savedResearch[stock.code] ?? false;
  const currentInformation = information?.requestedCode === stock.code ? information : undefined;
  const currentEvidence = researchEvidence?.requestedCode === stock.code && researchEvidence.requestedQuery === submittedQuery ? researchEvidence : undefined;
  const currentFinancialQuery = financialQuery?.requestedCode === stock.code && financialQuery.requestedQuery === submittedQuery ? financialQuery : undefined;
  const liveEvidence = currentEvidence?.payload ?? currentInformation?.evidence;
  const stockEvents = (liveEvidence?.feed?.items ?? []).slice(0, 5).map((item) => ({ date: item.published_at?.slice(0, 10) || "日期未知", type: item.category, title: item.title, detail: item.summary, source: item.source, url: item.url }));
  const evidenceCount = liveEvidence?.feed?.items?.length ?? 0;
  const officialCount = liveEvidence?.radar?.official_count ?? 0;
  const sourceCount = liveEvidence?.radar?.source_count ?? 0;
  const assessmentStatus = liveEvidence?.assessment?.status ?? "尚未取得证据";
  const dataStatus: InformationSnapshot["status"] | "loading" = currentInformation?.status ?? "loading";
  const quote = currentInformation?.quote;
  const historyPoints = currentInformation?.history?.data ?? [];
  const historyReady = historyPoints.length >= 2;
  const latestHistory = historyPoints.at(-1);
  const momentumBase = historyPoints.at(Math.max(0, historyPoints.length - 20));
  const liveMomentum = historyReady && latestHistory?.close && momentumBase?.close
    ? (latestHistory.close / momentumBase.close - 1) * 100
    : 0;
  const recentVolumes = historyPoints.slice(-20).map((item) => item.volume).filter((value): value is number => typeof value === "number" && value > 0);
  const averageVolume = recentVolumes.length ? recentVolumes.reduce((sum, value) => sum + value, 0) / recentVolumes.length : 0;
  const liveActivity = latestHistory?.volume && averageVolume ? latestHistory.volume / averageVolume * 100 : 0;
  const displayName = quote?.stock_name || stock.name;
  const displayPrice = quote?.current_price;
  const displayChange = quote?.change_percent;
  const displayTurnover = quote?.amount ? `${(quote.amount / 100_000_000).toFixed(1)} 亿` : "暂无";
  const displayIndustry = quote && stock.industry.includes("正在载入") ? "A股" : stock.industry;
  const updateLabel = quote?.update_time
    ? `最近交易日 ${new Date(quote.update_time).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}`
    : dataStatus === "loading" ? "等待公开行情" : "公开行情暂不可用";
  const statusLabel = dataStatus === "live" ? "实时数据" : dataStatus === "partial" ? "部分实时" : dataStatus === "cached" ? "最近缓存" : dataStatus === "loading" ? "连接数据源" : "数据暂不可用";
  const effectiveStock = { ...stock, name: displayName, price: displayPrice ?? 0, change: displayChange ?? 0, turnover: displayTurnover };
  const researchSummary = liveEvidence?.assessment?.summary
    ?? (dataStatus === "live" || dataStatus === "partial"
      ? `已载入 ${historyPoints.length} 个价格点；${currentEvidence?.status === "loading" ? "公开资料仍在并行核实。" : "当前未取得与理由相关的正式披露。"}缺失的基本面和外部说法不会由系统补写。`
      : dataStatus === "loading"
        ? "正在连接公开行情与披露来源，暂不显示未经核实的研究结论。"
        : currentInformation?.message ?? "实时资料暂不可用。请稍后重试；系统不会用样例结论替代。 ");
  const researchTasks = submittedQuery
    ? [
        ...(submittedQuery.match(/订单|公告|回购|减持|增持|合同|中标|并购|重组/) ? ["核对公司披露"] : []),
        ...(submittedQuery.match(/财报|营收|利润|现金流|应收|存货|负债/) ? ["检查财务报表"] : []),
        ...(submittedQuery.match(/涨|跌|价格|成交|放量|走势/) ? ["计算价格变化"] : []),
        "追溯公开来源",
      ].filter((item, index, items) => items.indexOf(item) === index)
    : ["读取近期披露", "追溯公开来源"];
  const financialAttentionCount = currentFinancialQuery?.payload?.checks.filter((item) => item.state === "attention" || item.state === "watch").length ?? 0;
  return (
    <div className="shell-with-context view-enter">
      <StockRail selected={stock} onSelect={setStock} followedStocks={followedStocks} liveQuote={quote} holdings={holdings} />
      <main className="research-layout" id="main-content">
        <article className="workspace research-dossier">
          <header className="stock-dossier-header">
            <div><div className="stock-title-line"><h1>{displayName}</h1><Badge variant="outline">{stock.code}.{stock.market}</Badge><Button variant="ghost" size="icon-sm" className={followed ? "active" : ""} aria-label={followed ? "取消关注股票" : "关注股票"} aria-pressed={followed} onClick={() => onWatch({ ...effectiveStock, name: displayName }, !followed)}>{followed ? <Check /> : <Bookmark />}</Button></div><p>{displayIndustry} · {updateLabel}</p><span className={`live-data-status ${dataStatus}`}><i />{statusLabel}<small>{currentInformation?.provider ?? "daily_stock_analysis"}</small></span></div>
            <div className="stock-live-price"><strong>{typeof displayPrice === "number" ? displayPrice.toFixed(2) : "—"}</strong>{typeof displayChange === "number" && <PriceChange value={displayChange} />}<small>成交额 {displayTurnover}</small></div>
          </header>
          <form className="research-query-bar" onSubmit={(event) => { event.preventDefault(); const query = researchQuery.trim(); if (!query) return; setSubmittedQuery(query); setPanel("证据链"); }}>
            <div><Search /><span><strong>研究一个具体问题</strong><small>例如：最近订单增长是否有公告和现金流支持？</small></span></div>
            <Input aria-label="输入研究问题" value={researchQuery} onChange={(event) => setResearchQuery(event.target.value)} placeholder="输入你想核实的说法、新闻或财务问题" />
            <Button type="submit" disabled={!researchQuery.trim()}>开始核实</Button>
            <div className="research-task-preview"><span>{submittedQuery ? "本次核实路径" : "默认检查"}</span>{researchTasks.map((task) => <Badge key={task} variant="outline">{task}</Badge>)}</div>
          </form>
          <section className="since-last-strip"><div><TimerReset /><span><strong>当前资料状态</strong><small>{currentEvidence?.status === "loading" ? "公开资料核实中" : `${officialCount} 条正式披露 · ${sourceCount} 个独立来源`} · {currentInformation?.history?.data?.length ?? 0} 个价格点</small></span></div><button onClick={() => setPanel("证据链")}>查看证据来源 <ChevronRight /></button></section>
          <nav className="research-tabs" aria-label="研究视图">{(["价格与事件", "财报体检", "证据链", "概览", "待验证问题"] as const).map((item) => <button key={item} className={panel === item ? "active" : ""} onClick={() => setPanel(item)}>{item}{item === "证据链" && <i>{evidenceCount}</i>}{item === "待验证问题" && <i>3</i>}</button>)}</nav>
          {panel === "概览" && <div className="research-panel overview-panel">
            <section className="research-verdict"><div className="verdict-heading"><div><Badge variant="secondary"><Sparkles data-icon="inline-start" />研究摘要</Badge><span>{liveEvidence ? "来自本次公开资料检索" : "仅展示已取得的数据"}</span></div><span className="verdict-state"><i />关键证据仍缺失</span></div><p>{researchSummary}</p><div className="verdict-points">{liveEvidence ? <><span><CheckCircle2 /><b>本次核实</b>{liveEvidence.assessment?.status ?? "已返回公开资料"}</span><span><TriangleAlert /><b>来源覆盖</b>{officialCount} 条正式披露 / {sourceCount} 个来源</span><span><Gauge /><b>仍需验证</b>{profile.gap}</span></> : <><span><CheckCircle2 /><b>价格数据</b>{historyReady ? `${historyPoints.length} 个交易日已载入` : "尚未载入"}</span><span><TriangleAlert /><b>正式披露</b>当前未取得</span><span><Gauge /><b>下一步</b>先查看来源，再形成判断</span></>}</div></section>
            {historyReady ? <section className="signal-board"><SectionHeader title="市场信号" meta="由本次取得的历史价格计算" /><div className="signal-list"><div><span><b>近20日变化</b><em>{liveMomentum >= 0 ? "+" : ""}{liveMomentum.toFixed(1)}%</em></span><i><b style={{ width: `${Math.max(0, Math.min(100, 50 + liveMomentum * 3))}%` }} /></i><small>起止收盘价计算，不代表未来方向</small></div><div><span><b>估值位置</b><em>未接入</em></span><i><b style={{ width: "0%" }} /></i><small>没有统一可比口径时不展示样例分位</small></div><div><span><b>成交活跃度</b><em>{liveActivity ? `${liveActivity.toFixed(0)}%` : "暂无"}</em></span><i><b style={{ width: `${Math.max(0, Math.min(100, liveActivity))}%` }} /></i><small>最近一日成交量 / 近20日均量</small></div></div></section> : <section className="signal-board data-readiness"><SectionHeader title="资料完整度" meta="缺失的数据不会由 AI 猜测" /><div className="readiness-list"><span><CheckCircle2 /><b>实时行情</b><em>{quote ? "已载入" : dataStatus === "loading" ? "连接中" : "暂无"}</em></span><span><CheckCircle2 /><b>历史价格</b><em>{historyPoints.length ? `${historyPoints.length} 个交易日` : dataStatus === "loading" ? "连接中" : "暂无"}</em></span><span><CheckCircle2 /><b>正式披露</b><em>{officialCount ? `${officialCount} 条` : "暂无"}</em></span><span><FileChartColumn /><b>财务基本面</b><em>打开财报体检加载</em></span></div></section>}
            {hasRecordedJudgment ? <section className="thesis-card">
              <div className="thesis-card-heading"><div><span className="eyebrow">最近记录的判断</span><h2>{recordedJudgment?.reason}</h2></div><div><Badge variant="outline">{recordedJudgment?.result}</Badge><span>{recordedJudgment?.reviewedAt ?? "已保存"}</span></div></div>
              <div className="thesis-impact-map"><div><span>本次公开资料</span><strong>{liveEvidence?.assessment?.summary ?? "尚未取得可核实证据"}</strong></div><ArrowRight /><div className="active"><span>对判断的影响</span><strong>{liveEvidence?.assessment?.status ?? "暂不能判断"}</strong></div><ArrowRight /><div><span>仍缺少</span><strong>{profile.gap}</strong></div></div>
              <div className="thesis-fields"><div><span>判断失效条件</span><strong>{recordedJudgment?.invalidation || "尚未记录"}</strong></div><div><span>观察期限</span><strong>{recordedJudgment?.horizon || "尚未记录"}</strong></div></div>
              <button onClick={() => setPanel("待验证问题")}>查看判断条件 <ChevronRight /></button>
            </section> : <section className="thesis-card empty-thesis"><div className="thesis-card-heading"><div><span className="eyebrow">我的判断</span><h2>尚未为 {displayName} 建立判断</h2></div><Badge variant="outline">等待用户输入</Badge></div><p>先写清为什么关注、需要核实哪条说法，以及什么情况会推翻判断，再进入交易前审查。</p><button onClick={() => onDecision(submittedQuery ? { reason: submittedQuery, evidence: liveEvidence } : undefined)}>开始建立判断 <ChevronRight /></button></section>}
          </div>}
          {panel === "财报体检" && <FinancialHealthPanel code={stock.code} name={displayName} judgment={recordedJudgment ? { reason: recordedJudgment.reason, invalidation: recordedJudgment.invalidation, reviewedAt: recordedJudgment.reviewedAt } : undefined} />}
          {panel === "价格与事件" && <section className="research-panel chart-panel"><SectionHeader title="价格、成交量与公司事件" meta="前复权 · 日线；事件不等同于价格原因" action={<Badge variant="outline">{statusLabel}</Badge>} /><PriceChart stock={stock} liveHistory={currentInformation?.history?.data} events={stockEvents} holdingValue={holdingValueFor(holdings, stock.code)} capital={capital} /></section>}
          {panel === "证据链" && <section className="research-panel evidence-panel"><div className="evidence-summary"><div><BarChart3 /><span><strong>{currentEvidence?.status === "loading" ? "正在核实来源" : `${sourceCount} 个独立来源`}</strong><small>{currentEvidence?.status === "loading" ? "行情已经独立载入，无需等待证据检索" : `正式披露 ${officialCount} · 共 ${evidenceCount} 条公开资料`}</small></span></div><div><strong>{officialCount} / {evidenceCount}</strong><span>正式披露</span></div><div className="attention"><strong>{currentEvidence?.status === "loading" ? "检索中" : assessmentStatus}</strong><span>{liveEvidence?.assessment?.mode === "openai" ? "AI 受限于当前证据" : "规则核实结果"}</span></div></div>{submittedQuery && <div className="research-tool-results"><div><span>输入问题</span><strong>{submittedQuery}</strong></div><article><FileSearch /><span><b>公开披露</b><small>{currentEvidence?.status === "loading" ? "检索中" : `${officialCount} 条 · ${assessmentStatus}`}</small></span></article>{needsFinancialQuery && <article className={currentFinancialQuery?.status === "ready" ? "ready" : "loading"}><FileChartColumn /><span><b>财报勾稽</b><small>{currentFinancialQuery?.status === "ready" ? `${currentFinancialQuery.payload?.coverage.known_checks ?? 0} 项可判断 · ${financialAttentionCount} 项需关注` : currentFinancialQuery?.status === "fallback" ? "财报服务暂不可用" : "正在读取三张报表"}</small></span><button onClick={() => setPanel("财报体检")}>查看体检 <ChevronRight /></button></article>}</div>}<SectionHeader title="证据如何影响判断" meta={liveEvidence?.assessment?.summary ?? (currentEvidence?.status === "loading" ? "正在检索公司公告与公开报道" : "先看来源，再看结论")} action={<Badge variant="outline">{currentEvidence?.status === "loading" ? "核实中" : liveEvidence?.feed?.data_mode === "live" ? "实时公开资料" : "资料降级"}</Badge>} />{currentEvidence?.status === "loading" ? <div className="evidence-loading-state"><FileSearch /><strong>公开资料正在并行核实</strong><span>你可以先查看行情，结果返回后会自动更新。</span></div> : <EvidenceList stockCode={stock.code} liveEvidence={liveEvidence} />}</section>}
          {panel === "待验证问题" && <section className="research-panel questions-section"><SectionHeader title="下一步要验证什么" meta="这些问题会带入决策审查" /><ol><li><span>01</span><p><strong>{profile.gap}何时能够得到确认？</strong><small>优先使用公司公告和下一期财报验证。</small></p><Badge variant="outline">财报发布后</Badge></li><li><span>02</span><p><strong>价格变化是否对应可核实的经营变化？</strong><small>先看事件时间与公开来源，不把相关性当作因果。</small></p><Badge variant="outline">持续观察</Badge></li><li><span>03</span><p><strong>什么变化会推翻当前判断？</strong><small>{recordedJudgment?.invalidation || "尚未设置；完成一次决策审查后会保存到这里。"}</small></p><Badge variant={recordedJudgment?.invalidation ? "secondary" : "outline"}>{recordedJudgment?.invalidation ? "已设置" : "待填写"}</Badge></li></ol></section>}
        </article>
        <ResearchActionPanel stock={effectiveStock} action={action} setAction={setAction} onDecision={() => { setStock(effectiveStock); setAction(action); onDecision(submittedQuery ? { reason: submittedQuery, evidence: liveEvidence } : undefined); }} saved={saved} dataStatus={dataStatus} holdings={holdings} capital={capital} onSave={() => setSavedResearch((current) => ({ ...current, [stock.code]: !saved }))} />
      </main>
    </div>
  );
}

function parseReasonStructure(text: string): ReasonStructure {
  const clauses = text.split(/[，。；;！!？?\n]/).map((item) => item.trim()).filter(Boolean);
  const externalKeywords = ["新闻", "朋友", "群", "听说", "小红书", "媒体", "网传", "消息", "政策", "研报"];
  const inferenceKeywords = ["觉得", "认为", "应该", "会涨", "反弹", "赚钱", "挣钱", "看好", "比较稳", "迟早"];
  const urgencyKeywords = ["现在", "马上", "赶紧", "担心错过", "很快", "急着", "立刻"];
  const verificationQuestion = text.match(/^(.+?)(?:是否|有没有|有无)(?:存在|有|发布|披露)?(?:正式)?(?:公告|披露|证据|来源)/);
  const external = clauses.find((clause) => externalKeywords.some((keyword) => clause.includes(keyword))) ?? verificationQuestion?.[1]?.trim() ?? "";
  const inference = clauses.find((clause) => inferenceKeywords.some((keyword) => clause.includes(keyword))) ?? "";
  const urgency = clauses.find((clause) => urgencyKeywords.some((keyword) => clause.includes(keyword))) ?? "";
  const fact = clauses.find((clause) => clause !== external && clause !== inference && clause !== urgency && /\d|已|最近|下降|增长|回落|改善/.test(clause)) ?? "";
  const source = verificationQuestion ? "待核实（用户提问）" : ["小红书", "朋友", "微信群", "群", "新闻", "媒体", "公告", "财报", "研报", "网传"].find((item) => text.includes(item)) ?? "未说明具体来源";
  return { fact, external, inference, urgency, source };
}

function parseReasonAmount(text: string): number | null {
  const arabic = text.match(/(\d+(?:\.\d+)?)\s*万/);
  if (arabic) return Number(arabic[1]) * 10000;
  const chinese = text.match(/([一二三四五六七八九十]+)\s*万/);
  if (!chinese) return null;
  const digits: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const value = chinese[1].includes("十") ? (chinese[1].split("十")[0] ? digits[chinese[1].split("十")[0]] : 1) * 10 + (digits[chinese[1].split("十")[1]] ?? 0) : digits[chinese[1]];
  return typeof value === "number" ? value * 10000 : null;
}

function parseRuleDescription(text: string, current: UserRules): UserRules {
  const capitalMatch = text.match(/(?:大约|拿|投入|投资资金|用于投资)[^，。；]*?(\d+(?:\.\d+)?)\s*万/);
  const maxValueMatch = text.match(/(?:单只|一只|单个股票)[^，。；]*?(?:最多|不超过|上限)[^，。；]*?(\d+(?:\.\d+)?)\s*万/);
  const alertMatch = text.match(/(?:单笔|每笔)[^，。；]*?(?:超过|大于|提醒)[^，。；]*?(\d+(?:\.\d+)?)\s*万/);
  const ratioMatch = text.match(/(?:单只|一只|单股)[^，。；]*?(\d+(?:\.\d+)?)\s*%/);
  const hoursMatch = text.match(/(\d+(?:\.\d+)?)\s*小时/);
  const daysMatch = text.match(/(\d+(?:\.\d+)?)\s*天/);
  const investableCapital = capitalMatch ? Number(capitalMatch[1]) * 10000 : current.investableCapital;
  const maxSingleStockValue = maxValueMatch ? Number(maxValueMatch[1]) * 10000 : current.maxSingleStockValue;
  const derivedRatio = investableCapital > 0 ? Math.round(maxSingleStockValue / investableCapital * 100) : current.maxSingleStockRatio;
  return {
    investableCapital,
    maxSingleStockValue,
    maxSingleStockRatio: ratioMatch ? Number(ratioMatch[1]) : derivedRatio,
    singleAmountAlert: alertMatch ? Number(alertMatch[1]) * 10000 : current.singleAmountAlert,
    coolingHours: hoursMatch ? Number(hoursMatch[1]) : daysMatch ? Number(daysMatch[1]) * 24 : current.coolingHours,
    requireInvalidation: /失效|判断可能错|判断错误|每笔交易都要写/.test(text) ? true : current.requireInvalidation,
  };
}

function RulesView({ rules, onSave, onBack }: { rules: UserRules; onSave: (rules: UserRules) => void; onBack: () => void }) {
  const describeRules = (value: UserRules) => `我大约拿${value.investableCapital / 10000}万元投资股票，单只股票最多${value.maxSingleStockValue / 10000}万元。单笔超过${value.singleAmountAlert / 10000}万元时提醒我，亏损后希望隔${value.coolingHours >= 24 && value.coolingHours % 24 === 0 ? `${value.coolingHours / 24}天` : `${value.coolingHours}小时`}再看。${value.requireInvalidation ? "每笔交易都要写什么情况说明判断可能错了。" : "判断失效条件可以稍后补充。"}`;
  const [description, setDescription] = useState(() => describeRules(rules));
  const [draft, setDraft] = useState(rules);
  const [parsed, setParsed] = useState(true);
  const applyTemplate = (template: UserRules) => { setDraft(template); setDescription(describeRules(template)); setParsed(true); };
  const updateNumber = (key: keyof UserRules, value: number) => { setDraft((current) => ({ ...current, [key]: Math.max(0, value) })); setParsed(true); };
  const effectiveLimit = Math.min(draft.maxSingleStockValue, draft.investableCapital * draft.maxSingleStockRatio / 100);
  const validRules = draft.investableCapital > 0 && draft.maxSingleStockValue > 0 && draft.maxSingleStockRatio > 0 && draft.maxSingleStockRatio <= 100 && draft.singleAmountAlert > 0;
  return (
    <main className="rules-page view-enter" id="main-content">
      <section className="workspace rules-workspace">
        <header className="rules-header">
          <div><Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft data-icon="inline-start" />返回</Button><h1>我的提醒规则</h1><p>这些数字只用于检查你的计划是否碰到自己设定的边界，不是仓位建议。</p></div>
          <span className="data-provenance"><Database /><b>保存在本设备</b><small>可随时重新修改</small></span>
        </header>
        <div className="rules-grid">
          <section className="rule-description-panel">
            <div className="rule-step-heading"><span>1</span><div><h2>用自己的话描述</h2><p>不需要理解专业术语，写清大约资金、单只股票上限和希望何时被提醒。</p></div></div>
            <Textarea aria-label="自然语言规则描述" value={description} onChange={(event) => { setDescription(event.target.value); setParsed(false); }} rows={7} />
            <div className="rule-template-row"><span>快速开始</span><Button variant="outline" size="sm" onClick={() => applyTemplate(STRONG_RULES)}>强提醒模式</Button><Button variant="outline" size="sm" onClick={() => applyTemplate(DEFAULT_RULES)}>标准提醒模式</Button></div>
            <Button size="lg" onClick={() => { setDraft(parseRuleDescription(description, draft)); setParsed(true); }}>整理成规则<ArrowRight data-icon="inline-end" /></Button>
            <div className="rule-privacy-note"><ShieldCheck /><p><strong>不会替你决定合适比例</strong><span>系统只提取你写出的数字；保存前必须由你确认。</span></p></div>
          </section>
          <section className="rule-confirm-panel">
            <div className="rule-step-heading"><span>2</span><div><h2>确认识别结果</h2><p>{parsed ? "请逐项检查，必要时直接修改数字。" : "先整理上面的描述，或选择一个提醒模板。"}</p></div></div>
            <div className="rule-fields">
              <label><span>用于投资的记录资金</span><div className="money-input"><span>¥</span><Input aria-label="用于投资的记录资金" type="number" min="0" step="10000" value={draft.investableCapital} onChange={(event) => updateNumber("investableCapital", Number(event.target.value))} /></div><small>只用于计算仓位比例</small></label>
              <label><span>单只股票金额上限</span><div className="money-input"><span>¥</span><Input aria-label="单只股票金额上限" type="number" min="0" step="1000" value={draft.maxSingleStockValue} onChange={(event) => updateNumber("maxSingleStockValue", Number(event.target.value))} /></div><small>超过时提醒重新检查</small></label>
              <label><span>单股占比上限</span><div className="percent-input"><Input aria-label="单股占比上限" type="number" min="0" max="100" step="1" value={draft.maxSingleStockRatio} onChange={(event) => updateNumber("maxSingleStockRatio", Number(event.target.value))} /><span>%</span></div><small>金额和比例以更严格的一项为准</small></label>
              <label><span>单笔金额提醒</span><div className="money-input"><span>¥</span><Input aria-label="单笔金额提醒" type="number" min="0" step="1000" value={draft.singleAmountAlert} onChange={(event) => updateNumber("singleAmountAlert", Number(event.target.value))} /></div><small>达到该金额时额外显示提醒</small></label>
              <label><span>亏损后冷静时间</span><div className="percent-input"><Input aria-label="亏损后冷静时间" type="number" min="0" step="1" value={draft.coolingHours} onChange={(event) => updateNumber("coolingHours", Number(event.target.value))} /><span>小时</span></div><small>记录提醒，不阻止用户操作</small></label>
              <label className="rule-toggle"><input type="checkbox" checked={draft.requireInvalidation} onChange={(event) => { setDraft((current) => ({ ...current, requireInvalidation: event.target.checked })); setParsed(true); }} /><span><b>每笔计划填写判断失效条件</b><small>帮助以后判断依据是否已经变化</small></span></label>
            </div>
            <div className="rule-confirm-summary"><span>实际生效边界</span><strong>单股不超过 ¥{effectiveLimit.toLocaleString()}</strong><small>金额上限 ¥{draft.maxSingleStockValue.toLocaleString()} 与比例上限 {draft.maxSingleStockRatio}% 中取更严格的一项</small><div><span>例如计划后单股达到 ¥{Math.min(draft.investableCapital, effectiveLimit + 10000).toLocaleString()}</span><b>{effectiveLimit + 10000 > effectiveLimit ? `会提示超出 ¥${Math.min(10000, Math.max(0, draft.investableCapital - effectiveLimit)).toLocaleString()}` : "不会触发仓位提醒"}</b></div></div>
            <Button size="lg" disabled={!parsed || !validRules} onClick={() => onSave(draft)}>确认并使用这些规则<Check data-icon="inline-end" /></Button>
          </section>
        </div>
      </section>
    </main>
  );
}

function PrivacyView({ recordCount, holdingCount, syncStatus, onClear, onBack }: { recordCount: number; holdingCount: number; syncStatus: CloudSyncStatus; onClear: () => void; onBack: () => void }) {
  const [confirmClear, setConfirmClear] = useState(false);
  return <main className="privacy-page view-enter" id="main-content"><section className="workspace privacy-workspace"><header className="privacy-header"><div><Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft data-icon="inline-start" />返回</Button><h1>数据和隐私</h1><p>这里说明当前桌面版实际保存什么、向哪些公开服务发出请求，以及如何删除数据。</p></div><span><LockKeyhole /><b>不连接证券账户</b><small>不保存账户密码或交易权限</small></span></header><section className="privacy-local-summary"><div><span>决策记录</span><strong>{recordCount}</strong><small>{syncStatus === "synced" ? "已同步到个人云端空间" : "云端不可用时保存在本设备"}</small></div><div><span>持仓条目</span><strong>{holdingCount}</strong><small>手动填写或 CSV 导入</small></div><div><span>自动交易权限</span><strong>无</strong><small>不会连接券商或执行下单</small></div></section><div className="privacy-grid"><section><SectionHeader title="哪些数据会保存" meta="仅为完成决策流程" /><div className="privacy-data-list"><article><strong>个人提醒规则</strong><span>记录资金、单股边界、单笔提醒、冷静时间与是否填写失效条件</span><Badge variant="outline">个人云端 + 本机备份</Badge></article><article><strong>手动持仓</strong><span>股票代码、名称与用户填写的金额；不需要成本价或证券账户</span><Badge variant="outline">个人云端 + 本机备份</Badge></article><article><strong>决策记录</strong><span>计划金额、理由拆解、失效条件、规则快照与当时取得的证据摘要</span><Badge variant="outline">个人云端 + 本机备份</Badge></article><article><strong>登录标识</strong><span>服务器只保存由 ChatGPT 登录邮箱生成的不可逆散列键，不在记录中保存邮箱</span><Badge variant="outline">服务器</Badge></article><article><strong>ETF / 交易复盘输入</strong><span>在当前会话中计算；刷新页面后不会作为个人账户数据保存</span><Badge variant="outline">当前会话</Badge></article></div></section><section><SectionHeader title="会访问哪些第三方服务" meta="公开资料与可选 AI" /><div className="privacy-service-list"><article><div><strong>腾讯证券公开行情</strong><span>历史价格与成交量</span></div><small>发送：股票代码</small></article><article><div><strong>巨潮资讯、东方财富公告</strong><span>法定披露与公告聚合</span></div><small>发送：股票代码与检索词</small></article><article><div><strong>新浪财经公开财务报表</strong><span>资产负债表、利润表与现金流量表</span></div><small>发送：股票代码</small></article><article><div><strong>东方财富、天天基金公开数据</strong><span>ETF 搜索与定期披露持仓</span></div><small>发送：ETF 代码或名称</small></article><article><div><strong>可选大语言模型</strong><span>仅在服务器配置密钥时整理理由和有限检索资料；未配置时使用本地规则</span></div><small>可能发送：理由、资料标题、摘要、来源；关键金额仍由确定性代码计算</small></article></div></section></div><section className="privacy-boundaries"><div><ShieldCheck /><span><strong>产品边界</strong><small>不推荐必买或必卖，不预测保证收益，不自动交易。AI 或规则生成的文字只用于信息整理与风险复核，不构成投资建议。</small></span></div><div><TriangleAlert /><span><strong>不要输入</strong><small>证券账户密码、身份证号、银行卡号、短信验证码或任何可以授权交易的信息。</small></span></div><div><CircleHelp /><span><strong>语言版本</strong><small>当前真实用户测试只开放完整中文界面。English Beta 尚未开放，避免半译状态影响金融信息理解。</small></span></div></section><footer className="privacy-controls"><div><strong>管理全部个人数据</strong><span>清空会同时删除个人云端记录和本机备份；操作前可在“历史记录”和“我的持仓”分别导出。</span></div>{confirmClear ? <div className="privacy-clear-confirm"><span>此操作无法撤销。确认清空持仓、规则和决策记录？</span><Button variant="outline" onClick={() => setConfirmClear(false)}>取消</Button><Button onClick={onClear}>确认清空</Button></div> : <Button variant="outline" onClick={() => setConfirmClear(true)}>清空全部个人数据</Button>}</footer></section></main>;
}

function parseHoldingCsv(text: string): HoldingBook {
  const rows = text.replace(/^\uFEFF/, "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (rows.length < 2) return {};
  const header = rows[0].split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));
  const codeIndex = header.findIndex((item) => ["代码", "股票代码", "code"].includes(item.toLowerCase()));
  const nameIndex = header.findIndex((item) => ["名称", "股票名称", "name"].includes(item.toLowerCase()));
  const valueIndex = header.findIndex((item) => ["持仓金额", "金额", "市值", "value"].includes(item.toLowerCase()));
  if (codeIndex < 0 || valueIndex < 0) return {};
  return rows.slice(1).reduce<HoldingBook>((book, line) => {
    const cells = line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));
    const rawCode = (cells[codeIndex] || "").split(".")[0].replace(/\D/g, "").padStart(6, "0");
    const value = Number((cells[valueIndex] || "").replace(/[¥￥,\s]/g, ""));
    const knownName = stocks.find((item) => item.code === rawCode)?.name;
    if (/^\d{6}$/.test(rawCode) && Number.isFinite(value) && value > 0) book[rawCode] = { name: cells[nameIndex] || knownName || rawCode, value: Math.round(value) };
    return book;
  }, {});
}

function HoldingsView({ holdings, capital, maxSingleStockValue, maxSingleStockRatio, records, onChange, onNotice, onResearch, onReview }: { holdings: HoldingBook; capital: number; maxSingleStockValue: number; maxSingleStockRatio: number; records: DecisionResult[]; onChange: (holdings: HoldingBook) => void; onNotice: (message: string) => void; onResearch: (stock: Stock) => void; onReview: (stock: Stock) => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const positions = Object.entries(holdings).map(([itemCode, item]) => ({ code: itemCode, ...item, name: item.name === itemCode ? stocks.find((stock) => stock.code === itemCode)?.name ?? item.name : item.name })).sort((a, b) => b.value - a.value);
  const invested = positions.reduce((sum, item) => sum + item.value, 0);
  const investedRatio = capital > 0 ? invested / capital * 100 : 0;
  const portfolioScenarioLoss = Math.round(invested * .2);
  const effectiveSingleLimit = Math.min(maxSingleStockValue, capital * maxSingleStockRatio / 100);
  const effectiveSingleRatio = capital > 0 ? effectiveSingleLimit / capital * 100 : 0;
  const boundaryConflicts = positions.filter((item) => item.value > effectiveSingleLimit);
  const stockFor = (item: { code: string; name: string }) => stocks.find((stock) => stock.code === item.code) ?? { ...createCodeStock(item.code), name: item.name };
  const latestFor = (itemCode: string) => records.find((record) => record.stock.code === itemCode);
  const addHolding = () => {
    const rawDigits = code.trim().split(".")[0].replace(/\D/g, "");
    const normalized = rawDigits ? rawDigits.padStart(6, "0") : "";
    const amount = Number(value);
    if (!/^\d{6}$/.test(normalized) || !Number.isFinite(amount) || amount <= 0) {
      onNotice("请输入 6 位股票代码和大于 0 的持仓金额");
      return;
    }
    const knownName = stocks.find((item) => item.code === normalized)?.name;
    onChange({ ...holdings, [normalized]: { name: name.trim() || knownName || normalized, value: Math.round(amount) } });
    setCode(""); setName(""); setValue("");
    onNotice("持仓已保存在本设备");
  };
  const importCsv = async (file?: File) => {
    if (!file) return;
    const parsed = parseHoldingCsv(await file.text());
    if (!Object.keys(parsed).length) {
      onNotice("没有识别到持仓；请使用列：代码,名称,持仓金额");
      return;
    }
    onChange(parsed);
    onNotice(`已导入 ${Object.keys(parsed).length} 只持仓`);
  };
  const exportCsv = () => {
    const lines = [["代码", "名称", "持仓金额"], ...positions.map((item) => [item.code, item.name, item.value])];
    const csv = `\uFEFF${lines.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "安心看股-持仓备份.csv"; link.click(); URL.revokeObjectURL(url);
  };
  return <main className="workspace holdings-workspace view-enter" id="main-content">
    <section className="holdings-overview">
      <div className="holdings-exposure-board">
        <div className="holdings-overview-heading"><div><span>组合暴露</span><strong>已记录 ¥{invested.toLocaleString()}</strong></div><small>{positions.length} 只股票 · 金额来自手动填写或 CSV</small></div>
        <div className="allocation-track" aria-label={`已记录持仓占记录资金 ${investedRatio.toFixed(1)}%`}><i style={{ width: `${Math.min(investedRatio, 100)}%` }} /></div>
        <div className="holdings-key-numbers"><div><span>占记录资金</span><strong>{investedRatio.toFixed(1)}%</strong><small>记录资金 ¥{capital.toLocaleString()}</small></div><div><span>未分配金额</span><strong>¥{Math.max(0, capital - invested).toLocaleString()}</strong><small>{invested > capital ? `已超出记录资金 ¥${(invested - capital).toLocaleString()}` : "未填写部分不视为现金账户"}</small></div><div><span>整体下跌 20% 情景</span><strong>−¥{portfolioScenarioLoss.toLocaleString()}</strong><small>按当前填写金额机械计算</small></div></div>
      </div>
      <aside className="holdings-review-queue">
        <div className="holdings-overview-heading"><div><span>现在需要复核</span><strong>{boundaryConflicts.length ? `${boundaryConflicts.length} 项边界冲突` : positions.length ? "当前无边界冲突" : "等待导入持仓"}</strong></div><Badge variant="outline">单股上限 ¥{effectiveSingleLimit.toLocaleString()}</Badge></div>
        {boundaryConflicts.length > 0 ? boundaryConflicts.slice(0, 3).map((item) => <button key={item.code} onClick={() => onReview(stockFor(item))}><span><strong>{item.name}</strong><small>{(item.value / capital * 100).toFixed(1)}% · 超出 ¥{(item.value - effectiveSingleLimit).toLocaleString()}</small></span><ArrowRight /></button>) : <div className="holdings-review-empty"><CheckCircle2 /><span>{positions.length ? "已填写持仓均在当前个人边界内。" : "导入后会按你的个人规则列出待复核事项。"}</span></div>}
        <small className="holdings-review-note">这里只提示你设置的边界，不生成调仓建议。</small>
      </aside>
    </section>
    <section className="holdings-editor-grid">
      <div className="holdings-table-panel"><SectionHeader title="持仓与判断" meta="金额仅保存在当前浏览器；行情和公告进入研究页后核实" action={<div className="table-actions"><label className="import-holdings-button"><span>导入 CSV</span><input aria-label="导入持仓 CSV" type="file" accept=".csv,text/csv" onChange={(event) => { void importCsv(event.target.files?.[0]); event.target.value = ""; }} /></label><Button variant="outline" size="sm" onClick={exportCsv} disabled={!positions.length}>导出备份</Button></div>} />
        {positions.length ? <div className="holding-position-list"><div className="holding-position-head"><span>股票</span><span>组合占比 / 个人边界</span><span>下跌 20%</span><span>最近审查</span><span /></div>{positions.map((item) => { const ratio = capital > 0 ? item.value / capital * 100 : 0; const over = item.value > effectiveSingleLimit; const latest = latestFor(item.code); return <article key={item.code} className={over ? "holding-position-row over" : "holding-position-row"}><button className="holding-position-name" onClick={() => onResearch(stockFor(item))}><strong>{item.name}</strong><small>{item.code} · 记录 ¥{item.value.toLocaleString()}</small></button><div className="holding-position-exposure"><span><strong>{ratio.toFixed(1)}%</strong><small>有效上限 {effectiveSingleRatio.toFixed(1)}%</small></span><i><b style={{ width: `${Math.min(ratio, 100)}%` }} /><em style={{ left: `${Math.min(effectiveSingleRatio, 100)}%` }} /></i><small>{over ? `超出有效边界 ¥${(item.value - effectiveSingleLimit).toLocaleString()}` : `距有效边界 ¥${Math.max(0, effectiveSingleLimit - item.value).toLocaleString()}`}</small></div><div className="holding-scenario"><strong>−¥{Math.round(item.value * .2).toLocaleString()}</strong><small>机械情景</small></div><div className="holding-last-review"><strong>{latest ? `${latest.action} · ${latest.result}` : "尚未审查"}</strong><small>{latest?.reviewedAt ? new Date(latest.reviewedAt).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }) : "可先查看研究"}</small></div><div className="holding-row-actions"><Button variant="outline" size="sm" onClick={() => onResearch(stockFor(item))}>研究</Button><Button size="sm" onClick={() => onReview(stockFor(item))}>审查</Button><Button variant="ghost" size="icon-sm" aria-label={`删除 ${item.name}`} onClick={() => { const next = { ...holdings }; delete next[item.code]; onChange(next); }}><X /></Button></div></article>; })}</div> : <div className="holdings-empty"><BriefcaseBusiness /><strong>还没有填写持仓</strong><span>导入 CSV 或在右侧填写模拟金额，随后即可看到组合暴露和决策上下文。</span></div>}
      </div>
      <aside className="holding-add-panel"><SectionHeader title="添加或更新" meta="相同代码会覆盖原金额" /><label><span>6 位股票代码</span><Input aria-label="6 位股票代码" value={code} onChange={(event) => setCode(event.target.value)} placeholder="例如 600519" inputMode="numeric" /></label><label><span>股票名称</span><Input aria-label="股票名称" value={name} onChange={(event) => setName(event.target.value)} placeholder="可选；已知股票会自动识别" /></label><label><span>持仓金额</span><div className="money-input"><span>¥</span><Input aria-label="持仓金额" value={value} onChange={(event) => setValue(event.target.value)} type="number" min="0" step="1000" placeholder="50000" /></div><small>可使用模拟金额；无需填写股数或成本价</small></label><Button size="lg" onClick={addHolding}><Plus data-icon="inline-start" />保存并重新计算</Button><div className="holding-import-guide"><strong>CSV 最少需要 3 列</strong><code>代码,名称,持仓金额</code><span>导入会替换当前持仓；请先导出备份。</span></div><div className="holding-privacy-note"><ShieldCheck /><p><strong>仅保存决策所需信息</strong><span>不连接券商，不需要账号、成本价或成交明细。</span></p></div>{Object.keys(holdings).length > 0 && <button className="reset-demo-holdings" onClick={() => { onChange({}); onNotice("已清空本设备持仓"); }}>清空全部持仓</button>}</aside>
    </section>
  </main>;
}

function DecisionView({ stock, action, rules, holdings, priorDecision, researchContext, onEditRules, onDone, onBack }: { stock: Stock; action: TradeAction; rules: UserRules; holdings: HoldingBook; priorDecision?: DecisionResult; researchContext?: ResearchDecisionContext; onEditRules: () => void; onDone: (result: DecisionResult) => void; onBack: () => void }) {
  const currentHolding = holdingValueFor(holdings, stock.code);
  const currentRatio = currentHolding / rules.investableCapital * 100;
  const initialAmount = priorDecision?.stock.code === stock.code ? priorDecision.finalAmount : Math.min(10000, Math.max(1000, rules.singleAmountAlert));
  const initialReason = researchContext?.reason || (priorDecision?.stock.code === stock.code && priorDecision.action === action ? priorDecision.reason ?? "" : "");
  const [amount, setAmount] = useState(initialAmount);
  const [reason, setReason] = useState(initialReason);
  const [reasonStructure, setReasonStructure] = useState<ReasonStructure>(() => researchContext?.reason ? parseReasonStructure(researchContext.reason) : priorDecision?.stock.code === stock.code && priorDecision.action === action && priorDecision.reasonStructure ? priorDecision.reasonStructure : parseReasonStructure(initialReason));
  const [reasonConfirmed, setReasonConfirmed] = useState(false);
  const [invalid, setInvalid] = useState(priorDecision?.stock.code === stock.code ? priorDecision.invalidation ?? "" : "");
  const [horizon, setHorizon] = useState(priorDecision?.stock.code === stock.code ? priorDecision.horizon ?? "1个月" : "1个月");
  const [durationSeconds, setDurationSeconds] = useState(1);
  const [evidenceCheck, setEvidenceCheck] = useState<LiveEvidencePayload | undefined>(researchContext?.evidence);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState("");
  useEffect(() => {
    const timer = window.setInterval(() => setDurationSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const positionDelta = action === "卖出" ? -Math.min(amount, currentHolding) : action === "继续观察" ? 0 : amount;
  const projectedHolding = Math.max(0, currentHolding + positionDelta);
  const ratio = useMemo(() => Number((projectedHolding / rules.investableCapital * 100).toFixed(1)), [projectedHolding, rules.investableCapital]);
  const scenarioLoss = Math.round(projectedHolding * 0.2);
  const effectiveMaxHolding = Math.min(rules.maxSingleStockValue, rules.investableCapital * rules.maxSingleStockRatio / 100);
  const effectiveMaxRatio = effectiveMaxHolding / rules.investableCapital * 100;
  const currentPositionAlreadyOver = currentHolding > effectiveMaxHolding;
  const isOverPosition = projectedHolding > effectiveMaxHolding;
  const over = Math.max(0, ratio - effectiveMaxRatio);
  const maxAllowedAmount = Math.max(0, Math.floor((effectiveMaxHolding - currentHolding) / 1000) * 1000);
  const overSingleAlert = amount > rules.singleAmountAlert;
  const externalClaim = reasonStructure.external.trim();
  const statedAmount = useMemo(() => parseReasonAmount(reason), [reason]);
  const reasonAmountMismatch = statedAmount !== null && Math.abs(statedAmount - amount) >= 1000;
  const evidenceStatus = evidenceCheck?.assessment?.status;
  const hasFormalMatch = evidenceStatus === "找到相关正式披露";
  const evidenceItems = evidenceCheck?.feed?.items?.length ?? 0;
  const officialEvidence = evidenceCheck?.radar?.official_count ?? 0;
  const reasonMissing = reason.trim().length < 6;
  const invalidationMissing = rules.requireInvalidation && invalid.trim().length < 4;
  const evidencePending = Boolean(externalClaim) && !evidenceCheck;
  const evidenceIssue = externalClaim ? evidencePending ? "外部信息尚未核实" : hasFormalMatch ? "外部说法找到相关正式披露，仍需阅读原文" : "外部说法未找到相关正式披露" : "";
  const reviewIssues = [reasonMissing ? "尚未写清操作理由" : !reasonConfirmed ? "理由拆解尚未确认" : "", reasonAmountMismatch ? "理由中的金额与计划金额不一致" : "", isOverPosition ? "单股仓位超过个人边界" : "", overSingleAlert ? "单笔金额超过提醒值" : "", evidenceIssue, invalidationMissing ? "尚未填写判断失效条件" : ""].filter(Boolean);
  const issueCount = reviewIssues.length;
  const canCompleteReview = !reasonMissing && reasonConfirmed && !reasonAmountMismatch && !invalidationMissing && !evidencePending && !evidenceLoading;
  const originalProjectedHolding = Math.max(0, currentHolding + (action === "卖出" ? -Math.min(initialAmount, currentHolding) : action === "继续观察" ? 0 : initialAmount));
  const originalProjectedRatio = Number((originalProjectedHolding / rules.investableCapital * 100).toFixed(1));
  const originalScenarioLoss = Math.round(originalProjectedHolding * .2);
  const originalPositionOver = originalProjectedHolding > effectiveMaxHolding;
  const originalAlertOver = initialAmount > rules.singleAmountAlert;
  const originalIssues = [reasonMissing ? "原计划未写清操作理由" : "", originalPositionOver ? "单股仓位超过个人边界" : "", originalAlertOver ? "单笔金额超过提醒值" : "", externalClaim ? "理由包含待核实外部信息" : "", rules.requireInvalidation ? "原计划未填写判断失效条件" : ""].filter(Boolean);
  const verifyReason = async () => {
    if (!reason.trim()) {
      setEvidenceError("请先写下需要核实的交易理由。");
      return;
    }
    if (!reasonConfirmed) {
      setEvidenceError("请先确认右侧的理由拆解，再检索公开资料。");
      return;
    }
    setEvidenceLoading(true);
    setEvidenceError("");
    setEvidenceCheck(undefined);
    try {
      const response = await fetch(`/api/evidence/${stock.code}?reason=${encodeURIComponent(reason.trim())}`, { cache: "no-store" });
      const payload = await response.json() as LiveEvidencePayload & { message?: string };
      if (!response.ok) throw new Error(payload.message || "公开资料检索暂时不可用");
      setEvidenceCheck(payload);
    } catch (error) {
      setEvidenceError(error instanceof Error ? error.message : "公开资料检索暂时不可用");
    } finally {
      setEvidenceLoading(false);
    }
  };
  const completeReview = (result: DecisionResult["result"], finalAmount: number, message: string) => {
    const completedAt = new Date();
    onDone({ stock, action, originalAmount: initialAmount, finalAmount, result, message, reason, reasonStructure, invalidation: invalid, horizon, reviewedAt: completedAt.toLocaleString("zh-CN", { month: "numeric", day: "2-digit", hour: "2-digit", minute: "2-digit" }), reviewedAtIso: completedAt.toISOString(), ruleSnapshot: rules, issues: originalIssues, remainingIssues: reviewIssues, scenarioLoss, originalScenarioLoss, durationSeconds, evidence: evidenceCheck });
  };
  return (
    <main className="decision-layout view-enter" id="main-content">
      <article className="workspace decision-canvas">
        <header className="decision-canvas-header">
          <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft data-icon="inline-start" />返回研究</Button>
          <div><Badge variant="outline">{stock.code}.{stock.market}</Badge><span>{stock.name}</span><ChevronRight /><span>{action}审查</span></div>
          <span className="saved-indicator"><Check />本次会话草稿</span>
        </header>
        <section className="decision-focus">
          <div className="decision-focus-heading"><div><Badge variant="outline">计划影响实时计算</Badge><h1>本次{action}会使单股占比从 {currentRatio.toFixed(1)}% 变为 {ratio.toFixed(1)}%{isOverPosition ? `，高于你的 ${effectiveMaxRatio.toFixed(1)}% 上限` : ""}</h1><p>{reviewIssues.length ? `另有 ${issueCount} 项需要确认：${reviewIssues.join("；")}。` : "当前没有触发已设置的提醒边界。"}所有最终选择都由你确认。</p></div><Badge variant="outline"><Clock3 data-icon="inline-start" />约 1 分钟</Badge></div>
          <div className="decision-risk-grid">
            <article className="exposure-visual"><div className="visual-title"><span>单股仓位</span><strong>{ratio.toFixed(1)}%</strong><Badge variant="outline">{isOverPosition ? `超过上限 ${over.toFixed(1)}%` : "符合当前上限"}</Badge></div><div className="position-value-flow"><span>当前 ¥{currentHolding.toLocaleString()}</span><ArrowRight /><strong>计划后 ¥{projectedHolding.toLocaleString()}</strong></div><div className="exposure-track"><i className="exposure-current" style={{ width: `${Math.min(currentRatio, ratio)}%` }} /><i className={ratio >= currentRatio ? "exposure-added" : "exposure-reduced"} style={ratio >= currentRatio ? { left: `${currentRatio}%`, width: `${Math.max(0, ratio - currentRatio)}%` } : { left: `${ratio}%`, width: `${currentRatio - ratio}%` }} /><i className="exposure-limit" style={{ left: `${effectiveMaxRatio}%` }} /></div><div className="track-labels"><span>当前 {currentRatio.toFixed(1)}%</span><b>上限 {effectiveMaxRatio.toFixed(1)}%</b><span>计划后 {ratio.toFixed(1)}%</span></div></article>
            <article className="scenario-visual"><div className="visual-title"><span>下跌情景金额影响</span><strong>−¥{scenarioLoss.toLocaleString()}</strong><small>按计划后持仓机械计算</small></div><div className="scenario-bars"><div><span>−10%</span><i><b style={{ width: "33%" }} /></i><em>−¥{Math.round(projectedHolding * .1).toLocaleString()}</em></div><div className="active"><span>−20%</span><i><b style={{ width: "66%" }} /></i><em>−¥{scenarioLoss.toLocaleString()}</em></div><div><span>−30%</span><i><b style={{ width: "100%" }} /></i><em>−¥{Math.round(projectedHolding * .3).toLocaleString()}</em></div></div></article>
            <article className="evidence-readiness"><div className="visual-title"><span>正式披露覆盖</span><strong>{officialEvidence} / {evidenceItems}</strong><small>{evidenceCheck ? "正式披露 / 全部资料" : "等待核实"}</small></div><div className="evidence-dots"><i className={officialEvidence > 0 ? "verified" : ""}>{officialEvidence > 0 ? <Check /> : <FileSearch />}</i><i><TriangleAlert /></i><i><Sparkles /></i></div><dl><div><dt>正式披露</dt><dd>{evidenceCheck ? officialEvidence : "—"}</dd></div><div><dt>公开资料</dt><dd>{evidenceCheck ? evidenceItems : "—"}</dd></div><div><dt>核实结论</dt><dd>{evidenceStatus ?? "尚未检索"}</dd></div></dl></article>
          </div>
        </section>
        {isOverPosition && <Alert className="decision-alert"><TriangleAlert /><AlertTitle>{currentPositionAlreadyOver ? "当前持仓已经高于个人单股边界" : "当前计划超过你设定的单股边界"}</AlertTitle><AlertDescription>{currentPositionAlreadyOver ? action === "卖出" ? <>当前持仓占比 {currentRatio.toFixed(1)}%，本次卖出后为 {ratio.toFixed(1)}%，仍高于 {effectiveMaxRatio.toFixed(1)}% 上限。这里仅显示差值，不阻止你的选择。</> : <>当前持仓 ¥{currentHolding.toLocaleString()}，占记录资金 {currentRatio.toFixed(1)}%。任何新增金额都无法使计划后仓位回到边界内；¥0 仅表示不再增加暴露，不代表当前仓位符合边界。</> : <>计划金额 ¥{amount.toLocaleString()} 会使单股占比达到 {ratio.toFixed(1)}%。将金额降至约 ¥{maxAllowedAmount.toLocaleString()}，可同时满足 ¥{rules.maxSingleStockValue.toLocaleString()} 和 {rules.maxSingleStockRatio}% 两项上限。</>}</AlertDescription></Alert>}
        {overSingleAlert && <Alert className="decision-alert amount-alert"><Gauge /><AlertTitle>本次金额达到你的单笔提醒线</AlertTitle><AlertDescription>计划金额 ¥{amount.toLocaleString()} 高于提醒值 ¥{rules.singleAmountAlert.toLocaleString()}。这不是禁止操作，只是提醒再次核对理由和下跌情景。</AlertDescription></Alert>}
        <section className="decision-rule-table">
          <div className="decision-rule-heading"><div><strong>本次检查</strong><span>数字规则由程序计算；证据结论只覆盖本次检索范围</span></div><Badge variant="outline">{reviewIssues.length} 项待确认</Badge></div>
          <div className="decision-rule-columns"><span>检查项</span><span>当前计划</span><span>个人规则 / 证据要求</span><span>差值或状态</span><span>可执行动作</span></div>
          <div className={isOverPosition ? "decision-rule-row attention" : "decision-rule-row"}><strong>单股仓位</strong><span>{ratio.toFixed(1)}% · ¥{projectedHolding.toLocaleString()}</span><span>≤ {effectiveMaxRatio.toFixed(1)}% · ¥{effectiveMaxHolding.toLocaleString()}</span><span>{isOverPosition ? `+${over.toFixed(1)} 个百分点` : "未超边界"}</span><small>{action === "卖出" && isOverPosition ? `仍需减少约 ¥${(Math.ceil((projectedHolding - effectiveMaxHolding) / 1000) * 1000).toLocaleString()}` : isOverPosition ? `新增金额上限 ¥${maxAllowedAmount.toLocaleString()}` : "可保留或继续修改"}</small></div>
          <div className={overSingleAlert ? "decision-rule-row attention" : "decision-rule-row"}><strong>单笔金额</strong><span>¥{amount.toLocaleString()}</span><span>提醒线 ¥{rules.singleAmountAlert.toLocaleString()}</span><span>{overSingleAlert ? `+¥${(amount - rules.singleAmountAlert).toLocaleString()}` : "未触发提醒"}</span><small>修改金额或保留并记录</small></div>
          <div className={reasonAmountMismatch ? "decision-rule-row attention" : "decision-rule-row"}><strong>理由金额</strong><span>{statedAmount === null ? "原话未明确金额" : `原话 ¥${statedAmount.toLocaleString()}`}</span><span>与计划金额一致</span><span>{reasonAmountMismatch ? `相差 ¥${Math.abs((statedAmount ?? amount) - amount).toLocaleString()}` : "一致或未明确"}</span><small>{reasonAmountMismatch ? "更新理由并重新确认" : "无需处理"}</small></div>
          <div className={externalClaim && !hasFormalMatch ? "decision-rule-row attention" : "decision-rule-row"}><strong>外部说法</strong><span>{externalClaim || "未填写"}</span><span>需要可追溯来源</span><span>{externalClaim ? evidencePending ? "尚未核实" : evidenceStatus ?? "未找到正式披露" : "无外部说法"}</span><small>{externalClaim ? "阅读来源或改写理由" : "无需检索"}</small></div>
          <div className={invalidationMissing ? "decision-rule-row attention" : "decision-rule-row"}><strong>失效条件</strong><span>{invalid || "尚未填写"}</span><span>{rules.requireInvalidation ? "本次必须填写" : "可选"}</span><span>{invalidationMissing ? "缺失" : "已记录"}</span><small>明确何时重新检查</small></div>
        </section>
        <section className={amount === initialAmount ? "decision-comparison unchanged" : "decision-comparison changed"}><div><span>原计划</span><strong>¥{initialAmount.toLocaleString()} · {originalProjectedRatio.toFixed(1)}%</strong><small>下跌 20% 情景 −¥{originalScenarioLoss.toLocaleString()}</small></div><ArrowRight /><div><span>{amount === initialAmount ? "当前尚未修改" : "修改后"}</span><strong>¥{amount.toLocaleString()} · {ratio.toFixed(1)}%</strong><small>下跌 20% 情景 −¥{scenarioLoss.toLocaleString()}</small></div><Badge variant="outline">{amount === initialAmount ? "等待选择" : `${action}金额${amount > initialAmount ? "增加" : "减少"} ¥${Math.abs(amount - initialAmount).toLocaleString()}`}</Badge></section>
        <section className="decision-work-grid">
          <div className="plan-form">
            <SectionHeader title="你的计划" meta="修改后风险数字会立即更新" />
            {researchContext?.reason && <div className="decision-research-context"><FileSearch /><span><strong>已从股票研究带入</strong><small>保留刚才的问题和 {researchContext.evidence?.feed?.items?.length ?? 0} 条公开资料；仍需确认系统如何拆解你的原话。</small></span></div>}
            <label><span>股票与操作</span><div className="read-only-field"><b>{stock.name}</b><Badge variant="secondary">{action}</Badge></div></label>
            <label><span>计划金额</span><div className="money-input"><span>¥</span><Input type="number" min="0" step="1000" value={amount} onChange={(event) => setAmount(Number(event.target.value))} /></div><small>你的单笔提醒金额：¥{rules.singleAmountAlert.toLocaleString()}</small></label>
            <label><span>为什么现在想操作？</span><Textarea value={reason} onChange={(event) => { const value = event.target.value; setReason(value); setReasonStructure(parseReasonStructure(value)); setReasonConfirmed(false); setEvidenceCheck(undefined); setEvidenceError(""); }} rows={4} /><small>写出新闻、朋友说法或社交平台观点；先确认系统如何理解，再检索公开资料。</small></label>
            <div className="reason-verification-action"><Button variant="outline" onClick={verifyReason} disabled={evidenceLoading || !reason.trim() || !reasonConfirmed}><FileSearch data-icon="inline-start" />{evidenceLoading ? "正在检索公开资料…" : !reasonConfirmed ? "先确认理由拆解" : "核实外部说法"}</Button><span>{evidenceCheck ? `${evidenceItems} 条资料 · ${officialEvidence} 条正式披露` : reasonConfirmed ? "拆解已确认，可以开始核实" : "不会把搜索结果自动当作事实"}</span></div>
            {evidenceError && <Alert className="evidence-check-result error"><TriangleAlert /><AlertTitle>暂时无法完成核实</AlertTitle><AlertDescription>{evidenceError}</AlertDescription></Alert>}
            {evidenceCheck?.assessment && <Alert className={`evidence-check-result ${hasFormalMatch ? "matched" : "unconfirmed"}`}><FileSearch /><AlertTitle>{evidenceCheck.assessment.status}</AlertTitle><AlertDescription>{evidenceCheck.assessment.summary}<span>{evidenceCheck.assessment.mode === "openai" ? "AI 结论，仅限当前检索范围" : "规则核实结果，未使用付费 AI"}</span></AlertDescription></Alert>}
            <label><span>什么情况说明判断可能错了？</span><Textarea value={invalid} onChange={(event) => setInvalid(event.target.value)} placeholder="例如：下一期收入没有改善，且公司公告未出现订单增长" rows={3} /><small className={invalid ? "complete" : rules.requireInvalidation ? "needed" : ""}>{invalid ? "已填写失效条件" : rules.requireInvalidation ? "你的个人规则要求填写这一项" : "当前规则允许稍后补充"}</small></label>
            <div className="followup-settings"><div><span>预计观察期限</span><div className="horizon-options">{["1周", "1个月", "3个月"].map((item) => <button key={item} className={horizon === item ? "active" : ""} onClick={() => setHorizon(item)}>{item}</button>)}</div></div><div><span>下次复核</span><strong>正式半年报发布后</strong><small>到时会回到这条判断，而不是只看盈亏。</small></div></div>
          </div>
          <div className="reason-map" aria-live="polite">
            <SectionHeader title="确认系统如何理解" meta="规则拆解 · 每一项都可以修正" />
            <label><span><Badge variant="secondary">可核实事实</Badge><small>已经发生、能够查证的内容</small></span><Textarea value={reasonStructure.fact} onChange={(event) => { setReasonStructure((current) => ({ ...current, fact: event.target.value })); setReasonConfirmed(false); }} placeholder="没有明确事实时可以留空" rows={2} /></label>
            <label><span><Badge variant="outline">外部说法</Badge><small>新闻、朋友、群聊或社交平台观点</small></span><Textarea value={reasonStructure.external} onChange={(event) => { setReasonStructure((current) => ({ ...current, external: event.target.value })); setReasonConfirmed(false); setEvidenceCheck(undefined); }} placeholder="没有外部说法时可以留空" rows={2} /></label>
            <label><span><Badge variant="outline">个人推断</Badge><small>你对未来、价格或结果的判断</small></span><Textarea value={reasonStructure.inference} onChange={(event) => { setReasonStructure((current) => ({ ...current, inference: event.target.value })); setReasonConfirmed(false); }} placeholder="例如：我认为现金流会稳定" rows={2} /></label>
            <div className="reason-meta-fields"><label><span>紧迫性表达</span><Input value={reasonStructure.urgency} onChange={(event) => { setReasonStructure((current) => ({ ...current, urgency: event.target.value })); setReasonConfirmed(false); }} placeholder="例如：担心错过" /></label><label><span>信息来源</span><Input value={reasonStructure.source} onChange={(event) => { setReasonStructure((current) => ({ ...current, source: event.target.value })); setReasonConfirmed(false); }} /></label></div>
            {evidenceCheck?.assessment && <article className="reason-evidence-summary"><Badge variant="secondary"><CheckCircle2 data-icon="inline-start" />公开资料核实</Badge><p>{evidenceCheck.assessment.summary}</p><small>只覆盖本次返回的来源与时间范围。</small></article>}
            <div className={reasonConfirmed ? "reason-confirmation confirmed" : "reason-confirmation"}><div>{reasonConfirmed ? <CheckCircle2 /> : <CircleHelp />}<span><strong>{reasonConfirmed ? "拆解已确认" : "请检查后确认"}</strong><small>确认只表示系统理解无误，不表示这些说法真实。</small></span></div><Button variant={reasonConfirmed ? "outline" : "default"} onClick={() => { setReasonConfirmed(true); setEvidenceError(""); }} disabled={reasonMissing}>{reasonConfirmed ? "重新确认" : "确认理由拆解"}</Button></div>
          </div>
        </section>
        <footer className="decision-action-bar">
          <div><strong>{amount === initialAmount ? "当前计划" : "修改后预览"}</strong><span>金额 ¥{amount.toLocaleString()} · 单股占比 {ratio.toFixed(1)}% · 观察 {horizon} · {isOverPosition ? `仍超上限 ${over.toFixed(1)}%` : "符合当前上限"}</span>{!canCompleteReview && <small className="review-completion-hint">完成理由、失效条件及必要的外部信息核实后，才能记录最终选择。</small>}</div>
          <div><Button variant="ghost" size="lg" onClick={() => completeReview("已延迟", amount, "已保存，稍后再看")}>稍后再看</Button><Button variant="outline" size="lg" onClick={() => completeReview("维持计划", initialAmount, "已记录：维持原计划")} disabled={!canCompleteReview}>维持原计划</Button><Button size="lg" onClick={() => completeReview("已修改", amount, `已记录修改：¥${amount.toLocaleString()}`)} disabled={!canCompleteReview || amount === initialAmount}>确认修改<ArrowRight data-icon="inline-end" /></Button></div>
        </footer>
      </article>
      <aside className="decision-context">
        {priorDecision && <section className="decision-prior-context"><SectionHeader title="上次记录的判断" meta={priorDecision.reviewedAt ?? "已保存"} /><div><Badge variant="outline">{priorDecision.action} · {priorDecision.result}</Badge><p>{priorDecision.reason || "上次未记录理由"}</p><small>失效条件：{priorDecision.invalidation || "尚未记录"}</small></div></section>}
        <section><SectionHeader title="个人提醒边界" action={<Button variant="ghost" size="sm" onClick={onEditRules}>调整规则</Button>} /><dl><div><dt>单股金额 / 比例上限</dt><dd>¥{rules.maxSingleStockValue.toLocaleString()} / {rules.maxSingleStockRatio}%</dd></div><div><dt>单笔提醒金额</dt><dd>¥{rules.singleAmountAlert.toLocaleString()}</dd></div><div><dt>亏损后冷静期</dt><dd>{rules.coolingHours} 小时</dd></div><div><dt>失效条件</dt><dd>{rules.requireInvalidation ? "需要填写" : "可选"}</dd></div></dl></section>
        <section><SectionHeader title="证据时间线" meta={evidenceCheck ? "本次实时公开资料" : "等待核实当前理由"} /><EvidenceList stockCode={stock.code} compact liveEvidence={evidenceCheck} /></section>
        <section className="position-note"><BriefcaseBusiness /><div><strong>当前持仓</strong><span>{currentHolding > 0 ? `${stock.name} · ¥${currentHolding.toLocaleString()}` : `${stock.name} · 尚无持仓`}</span><small>{currentHolding > 0 ? `占记录资产 ${currentRatio.toFixed(1)}%` : "本次计划将新建仓位"}</small></div></section>
      </aside>
    </main>
  );
}

function DecisionResultView({ record, holdings, onDesk, onHistory, onResearch, onFeedback }: { record: DecisionResult; holdings: HoldingBook; onDesk: () => void; onHistory: () => void; onResearch: () => void; onFeedback: (feedback: TestFeedback) => void }) {
  const [testerCode, setTesterCode] = useState(record.feedback?.testerCode ?? "T001");
  const [satisfaction, setSatisfaction] = useState(record.feedback?.satisfaction ?? 4);
  const [riskUnderstood, setRiskUnderstood] = useState(record.feedback?.riskUnderstood ?? true);
  const [repeatIntent, setRepeatIntent] = useState(record.feedback?.repeatIntent ?? true);
  const [paidIntent, setPaidIntent] = useState(record.feedback?.paidIntent ?? false);
  const [confusingStep, setConfusingStep] = useState(record.feedback?.confusingStep ?? "");
  const [feedbackSaved, setFeedbackSaved] = useState(Boolean(record.feedback));
  const rules = record.ruleSnapshot ?? DEFAULT_RULES;
  const currentHolding = holdingValueFor(holdings, record.stock.code);
  const project = (amount: number) => Math.max(0, currentHolding + (record.action === "卖出" ? -Math.min(amount, currentHolding) : record.action === "继续观察" ? 0 : amount));
  const originalHolding = project(record.originalAmount);
  const finalHolding = project(record.finalAmount);
  const originalRatio = originalHolding / rules.investableCapital * 100;
  const finalRatio = finalHolding / rules.investableCapital * 100;
  const effectiveLimit = Math.min(rules.maxSingleStockValue, rules.investableCapital * rules.maxSingleStockRatio / 100) / rules.investableCapital * 100;
  const evidenceItems = record.evidence?.feed?.items?.length ?? 0;
  const officialEvidence = record.evidence?.radar?.official_count ?? 0;
  const unresolved = record.remainingIssues ?? [];
  const choice = record.result === "已延迟" ? "稍后再看" : record.result === "维持计划" ? `维持 ¥${record.originalAmount.toLocaleString()}` : `改为 ¥${record.finalAmount.toLocaleString()}`;
  return <main className="decision-result-page view-enter" id="main-content"><article className="workspace decision-result-workspace">
    <header className="decision-result-header"><div><span><CheckCircle2 />审查已记录 · 不会执行交易</span><h1>{record.stock.name} · 你选择了“{choice}”</h1><p>{record.message}。这张记录保留当时的规则、证据和个人判断，方便之后重新核实。</p></div><Badge variant="outline">{record.reviewedAt ?? "刚刚"}</Badge></header>
    <section className="decision-result-summary"><div><span>原计划</span><strong>¥{record.originalAmount.toLocaleString()}</strong><small>计划后 {originalRatio.toFixed(1)}% · 下跌 20% −¥{(record.originalScenarioLoss ?? Math.round(originalHolding * .2)).toLocaleString()}</small></div><ArrowRight /><div className="selected"><span>最终选择</span><strong>{record.result === "已延迟" ? "稍后再看" : `¥${record.finalAmount.toLocaleString()}`}</strong><small>{record.result === "已延迟" ? "没有改变当前持仓记录" : `计划后 ${finalRatio.toFixed(1)}% · 下跌 20% −¥${(record.scenarioLoss ?? Math.round(finalHolding * .2)).toLocaleString()}`}</small></div><div className="result-boundary"><span>个人单股上限</span><strong>{effectiveLimit.toFixed(1)}%</strong><small>{record.result === "已延迟" ? "下次继续时重新计算" : finalRatio > effectiveLimit ? `仍高 ${Math.max(0, finalRatio - effectiveLimit).toFixed(1)} 个百分点` : "未超过当前边界"}</small></div></section>
    <div className="decision-result-grid"><section><div className="result-section-heading"><div><strong>为什么做这个选择</strong><span>保留原话和用户确认后的结构</span></div><Badge variant="outline">{record.action}</Badge></div><blockquote>{record.reason || "本次选择稍后再看，尚未形成完整操作理由。"}</blockquote><dl className="result-reason-fields"><div><dt>可核实事实</dt><dd>{record.reasonStructure?.fact || "未单独填写"}</dd></div><div><dt>外部说法</dt><dd>{record.reasonStructure?.external || "无"}</dd></div><div><dt>个人推断</dt><dd>{record.reasonStructure?.inference || "未单独填写"}</dd></div><div><dt>信息来源</dt><dd>{record.reasonStructure?.source || "未说明"}</dd></div><div><dt>判断失效条件</dt><dd>{record.invalidation || "尚未填写"}</dd></div><div><dt>观察期限</dt><dd>{record.horizon || "尚未设置"}</dd></div></dl></section><aside><div className="result-section-heading"><div><strong>证据与剩余问题</strong><span>只复述本次检索范围</span></div><Badge variant="outline">{officialEvidence}/{evidenceItems} 正式披露</Badge></div><div className="result-evidence"><strong>{record.evidence?.assessment?.status ?? "未完成公开资料核实"}</strong><p>{record.evidence?.assessment?.summary ?? "本次没有保存证据结果；不能据此判断外部说法真伪。"}</p></div><div className="result-unresolved"><span>完成后仍需注意</span>{unresolved.length ? <ul>{unresolved.map((issue) => <li key={issue}>{issue}</li>)}</ul> : <p>没有遗留的必填项；这不表示交易没有风险。</p>}</div></aside></div>
    <section className="decision-test-feedback"><div><span>可选 · 用户测试记录</span><strong>{feedbackSaved ? "反馈已保存在本设备" : "这次审查是否值得下次再用？"}</strong><small>只使用匿名编号，不填写姓名、手机号或微信号。</small></div><label><span>匿名编号</span><Input aria-label="匿名测试编号" value={testerCode} maxLength={20} onChange={(event) => { setTesterCode(event.target.value.replace(/[^a-zA-Z0-9_-]/g, "").toUpperCase()); setFeedbackSaved(false); }} /></label><div><span>满意度</span><div className="feedback-score">{[1, 2, 3, 4, 5].map((score) => <button key={score} className={satisfaction === score ? "active" : ""} onClick={() => { setSatisfaction(score); setFeedbackSaved(false); }}>{score}</button>)}</div></div><div><span>看懂主要风险</span><button className={riskUnderstood ? "feedback-choice active" : "feedback-choice"} onClick={() => { setRiskUnderstood(!riskUnderstood); setFeedbackSaved(false); }}>{riskUnderstood ? "看懂了" : "没看懂"}</button></div><div><span>下次还会用</span><button className={repeatIntent ? "feedback-choice active" : "feedback-choice"} onClick={() => { setRepeatIntent(!repeatIntent); setFeedbackSaved(false); }}>{repeatIntent ? "愿意" : "不愿意"}</button></div><div><span>了解付费测试</span><button className={paidIntent ? "feedback-choice active" : "feedback-choice"} onClick={() => { setPaidIntent(!paidIntent); setFeedbackSaved(false); }}>{paidIntent ? "愿意" : "暂不"}</button></div><label className="feedback-confusion"><span>最困惑的地方（可选）</span><Input aria-label="最困惑的步骤" value={confusingStep} maxLength={120} placeholder="例如：不知道为什么需要写失效条件" onChange={(event) => { setConfusingStep(event.target.value); setFeedbackSaved(false); }} /></label><Button className="feedback-save" variant={feedbackSaved ? "outline" : "default"} disabled={!testerCode.trim()} onClick={() => { onFeedback({ testerCode, satisfaction, riskUnderstood, repeatIntent, paidIntent, confusingStep: confusingStep.trim(), submittedAtIso: new Date().toISOString() }); setFeedbackSaved(true); }}>{feedbackSaved ? "已保存" : "保存匿名反馈"}</Button></section>
    <footer className="decision-result-actions"><div><strong>下一步由你决定</strong><span>应用不连接券商，也不会自动下单。</span></div><div><Button variant="ghost" onClick={onResearch}>返回股票研究</Button><Button variant="outline" onClick={onHistory}>查看历史记录</Button><Button onClick={onDesk}>返回工作台</Button></div></footer>
  </article></main>;
}

function HistoryView({ records, onStart, onResearch, onRecheck, onRestore }: { records: DecisionResult[]; onStart: () => void; onResearch: (stock: Stock) => void; onRecheck: (record: DecisionResult) => void; onRestore: (records: DecisionResult[]) => void }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [restoreError, setRestoreError] = useState("");
  const [currentTime] = useState(() => Date.now());
  const selected = records[selectedIndex] ?? records[0];
  const totalReviews = records.length;
  const changedReviews = records.filter((record) => record.result !== "维持计划").length;
  const changedRate = totalReviews > 0 ? Math.round(changedReviews / totalReviews * 100) : 0;
  const timedRecords = records.filter((record) => typeof record.durationSeconds === "number");
  const averageDuration = timedRecords.length > 0 ? Math.round(timedRecords.reduce((sum, record) => sum + (record.durationSeconds ?? 0), 0) / timedRecords.length) : 0;
  const durationLabel = averageDuration > 0 ? `${Math.floor(averageDuration / 60)}′${String(averageDuration % 60).padStart(2, "0")}″` : "—";
  const issueCounts = records.flatMap((record) => record.issues ?? []).reduce<Record<string, number>>((counts, issue) => ({ ...counts, [issue]: (counts[issue] ?? 0) + 1 }), {});
  const commonIssue = Object.entries(issueCounts).sort((a, b) => b[1] - a[1])[0];
  const socialSourceCount = records.filter((record) => /朋友|小红书|群|网传|新闻|媒体/.test(record.reason ?? "")).length;
  const missingInvalidationCount = records.filter((record) => !(record.invalidation ?? "").trim()).length;
  const overPositionCount = records.filter((record) => record.issues?.some((issue) => issue.includes("仓位"))).length;
  const dueRecords = records.filter((record) => {
    const due = reviewDueDate(record);
    return due ? due.getTime() <= currentTime : false;
  });
  const nextDue = records.map((record) => ({ record, due: reviewDueDate(record) })).filter((item): item is { record: DecisionResult; due: Date } => Boolean(item.due)).sort((a, b) => a.due.getTime() - b.due.getTime())[0];
  const formatDue = (record: DecisionResult) => {
    const due = reviewDueDate(record);
    if (!due) return "旧记录未保存复核日期";
    const days = Math.ceil((due.getTime() - currentTime) / 86400000);
    if (days < 0) return `已到期 ${Math.abs(days)} 天`;
    if (days === 0) return "今天复核";
    return `${days} 天后复核`;
  };
  const exportCsv = () => {
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const savedLines = records.map((record) => [record.reviewedAt ?? "最近", record.stock.name, record.action, record.originalAmount, record.result === "已延迟" ? "稍后再看" : record.finalAmount, record.issues?.join("；") ?? "", record.remainingIssues?.join("；") ?? "", record.result, record.reason ?? "", record.invalidation ?? "", record.horizon ?? "", record.originalScenarioLoss ?? "", record.scenarioLoss ?? "", record.durationSeconds ?? "", record.ruleSnapshot?.investableCapital ?? "", record.ruleSnapshot?.maxSingleStockValue ?? "", record.ruleSnapshot?.maxSingleStockRatio ?? "", record.ruleSnapshot?.singleAmountAlert ?? "", record.evidence?.assessment?.status ?? "未核实", record.evidence?.assessment?.summary ?? "", record.evidence?.radar?.official_count ?? "", record.evidence?.feed?.items?.length ?? "", record.evidence?.feed?.items?.map((item) => item.url).filter(Boolean).join("；") ?? "", record.feedback?.testerCode ?? "", record.feedback?.satisfaction ?? "", typeof record.feedback?.riskUnderstood === "boolean" ? (record.feedback.riskUnderstood ? "看懂" : "未看懂") : "", record.feedback ? (record.feedback.repeatIntent ? "愿意" : "不愿意") : "", record.feedback ? (record.feedback.paidIntent ? "愿意了解" : "暂不") : "", record.feedback?.confusingStep ?? ""]);
    const lines = [["时间", "股票", "操作", "原计划", "最终选择", "原计划发现的问题", "完成后仍需注意", "结果", "原始理由", "判断失效条件", "观察期限", "原计划下跌20%情景", "最终计划下跌20%情景", "完成耗时秒", "记录资金", "单股金额上限", "单股比例上限", "单笔提醒金额", "证据核实结论", "证据核实摘要", "正式披露数", "公开资料数", "证据来源链接", "匿名测试编号", "满意度1到5", "是否看懂主要风险", "愿意再次使用", "愿意了解付费测试", "最困惑步骤"], ...savedLines];
    const csv = `\uFEFF${lines.map((line) => line.map((value) => escape(String(value))).join(",")).join("\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "安心看股-决策记录.csv";
    link.click();
    URL.revokeObjectURL(url);
  };
  const exportBackup = () => {
    const payload = JSON.stringify({ format: "anxin-decision-backup", version: 1, exportedAt: new Date().toISOString(), records }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `安心看股-完整备份-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const restoreBackup = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as { format?: string; records?: DecisionResult[] };
      const valid = parsed.format === "anxin-decision-backup" && Array.isArray(parsed.records) && parsed.records.every((record) => record?.stock?.code && record?.result && typeof record.originalAmount === "number");
      if (!valid) throw new Error("invalid");
      onRestore(parsed.records!.slice(0, 20));
      setSelectedIndex(0);
      setRestoreError("");
    } catch {
      setRestoreError("无法识别此备份。请选择由安心看股导出的 JSON 文件。");
    }
  };
  if (records.length === 0) return <main className="workspace history-workspace history-empty-workspace view-enter" id="main-content"><section className="history-empty-primary"><div className="history-empty-icon"><History /></div><span>决策记录</span><h1>还没有完成过交易前审查</h1><p>完成第一条记录后，这里会保留当时的理由、个人规则、公开资料核实结果和下次复核时间。</p><div><Button onClick={onStart}>开始第一次审查<ArrowRight data-icon="inline-end" /></Button><label className="history-upload-button"><Upload />恢复完整备份<input type="file" accept="application/json,.json" onChange={(event) => restoreBackup(event.target.files?.[0])} /></label></div>{restoreError && <small className="history-restore-error">{restoreError}</small>}</section><section className="history-empty-explainer"><div><strong>记录原计划</strong><span>保留金额、理由与失效条件</span></div><ArrowRight /><div><strong>保存当时证据</strong><span>来源变化后仍可回看</span></div><ArrowRight /><div><strong>到期重新核实</strong><span>复核判断，不只复盘盈亏</span></div></section></main>;
  return (
    <main className="workspace history-workspace view-enter" id="main-content">
      <section className="history-command"><div><span>需要重新核实</span><strong>{dueRecords.length}</strong><small>{dueRecords.length ? "已到你设定的观察期限" : nextDue ? `${nextDue.record.stock.name} · ${formatDue(nextDue.record)}` : "新记录将自动计算复核时间"}</small></div><div><span>已完成审查</span><strong>{totalReviews}</strong><small>{changedReviews} 次修改或延迟 · {changedRate}%</small></div><div><span>平均用时</span><strong>{durationLabel}</strong><small>{timedRecords.length ? `基于 ${timedRecords.length} 条记录` : "尚无完整耗时"}</small></div><div className="history-command-actions"><Button onClick={onStart}>新建审查</Button><Button variant="outline" onClick={exportBackup}><Download data-icon="inline-start" />完整备份</Button><label><Upload />恢复<input type="file" accept="application/json,.json" onChange={(event) => restoreBackup(event.target.files?.[0])} /></label></div></section>
      {restoreError && <div className="history-restore-error banner">{restoreError}</div>}
      <section className="history-body history-review-layout"><div className="history-list"><SectionHeader title="复核时间线" meta="选择记录，查看当时依据" action={<Button variant="ghost" size="sm" onClick={exportCsv}>导出 CSV</Button>} /><div className="history-record-list">{records.map((record, index) => { const due = reviewDueDate(record); return <button key={`${record.reviewedAtIso ?? record.reviewedAt}-${record.stock.code}-${index}`} className={selectedIndex === index ? "active" : ""} onClick={() => setSelectedIndex(index)}><span className="history-record-date">{record.reviewedAt ?? "旧记录"}</span><span className="history-record-main"><strong>{record.stock.name}</strong><em>{record.action} · 原计划 ¥{record.originalAmount.toLocaleString()}</em></span><span className="history-record-result"><Badge variant="outline">{record.result}</Badge><small className={due && due.getTime() <= currentTime ? "due" : ""}>{formatDue(record)}</small></span><ChevronRight /></button>; })}</div></div><article className="history-record-detail"><header><div><span>记录详情</span><h2>{selected.stock.name} · {selected.action}</h2><small>{selected.stock.code} · {selected.reviewedAt ?? "旧记录"}</small></div><div><Badge variant="outline">{selected.result}</Badge><Button variant="outline" size="sm" onClick={() => onResearch(selected.stock)}><Eye data-icon="inline-start" />查看当前资料</Button><Button size="sm" onClick={() => onRecheck(selected)}><CalendarClock data-icon="inline-start" />重新核实</Button></div></header><section className="history-decision-change"><div><span>原计划</span><strong>¥{selected.originalAmount.toLocaleString()}</strong><small>{selected.originalScenarioLoss ? `下跌 20% 情景 −¥${selected.originalScenarioLoss.toLocaleString()}` : "未保存情景计算"}</small></div><ArrowRight /><div><span>最终选择</span><strong>{selected.result === "已延迟" ? "稍后再看" : `¥${selected.finalAmount.toLocaleString()}`}</strong><small>{selected.scenarioLoss ? `下跌 20% 情景 −¥${selected.scenarioLoss.toLocaleString()}` : "未保存情景计算"}</small></div><div><span>复核时间</span><strong>{formatDue(selected)}</strong><small>观察期限 {selected.horizon ?? "未设置"}</small></div></section><section className="history-detail-columns"><div><span>当时为什么想操作</span><p>{selected.reason || "未记录理由"}</p><dl><div><dt>外部说法</dt><dd>{selected.reasonStructure?.external || "无"}</dd></div><div><dt>个人推断</dt><dd>{selected.reasonStructure?.inference || "未单独记录"}</dd></div><div><dt>失效条件</dt><dd>{selected.invalidation || "未填写"}</dd></div></dl></div><div><span>当时核实到了什么</span><strong>{selected.evidence?.assessment?.status ?? "未保存证据核实"}</strong><p>{selected.evidence?.assessment?.summary ?? "这条旧记录没有可复查的证据快照。重新核实时应读取当前公开资料。"}</p><small>{selected.evidence?.radar?.official_count ?? 0} 条正式披露 · {selected.evidence?.feed?.items?.length ?? 0} 条公开资料</small></div></section><section className="history-issue-strip"><div><span>原计划发现的问题</span><strong>{selected.issues?.join("；") || "没有记录到规则冲突"}</strong></div><div><span>完成后仍需注意</span><strong>{selected.remainingIssues?.join("；") || "无遗留必填项"}</strong></div></section></article></section>
      <section className="history-pattern-row"><div><span>记录中的重复情况</span><strong>{commonIssue?.[0] ?? "尚未形成重复模式"}</strong><small>{commonIssue ? `${commonIssue[1]} 次出现；仅描述记录，不判断心理状态。` : "积累更多真实记录后再统计。"}</small></div><div><b>{overPositionCount}</b><span>仓位边界冲突</span></div><div><b>{socialSourceCount}</b><span>理由提到外部消息</span></div><div><b>{missingInvalidationCount}</b><span>未写失效条件</span></div></section>
    </main>
  );
}

export default function Home({ authenticatedUser }: { authenticatedUser: string }) {
  const [view, setView] = useState<View>("desk");
  const [stock, setStock] = useState(stocks[0]);
  const [action, setAction] = useState<TradeAction>("买入");
  const [notice, setNotice] = useState("");
  const [showDataStatus, setShowDataStatus] = useState(false);
  const [freshnessOverride, setFreshnessOverride] = useState<{ stockCode: string; value: HeaderFreshness }>();
  const [latestDecision, setLatestDecision] = useState<DecisionResult>();
  const [decisionRecords, setDecisionRecords] = useState<DecisionResult[]>([]);
  const [researchDecisionContext, setResearchDecisionContext] = useState<ResearchDecisionContext>();
  const [rules, setRules] = useState<UserRules>(DEFAULT_RULES);
  const [holdings, setHoldings] = useState<HoldingBook>(DEFAULT_HOLDINGS);
  const [watched, setWatched] = useState<WatchBook>({});
  const [stateHydrated, setStateHydrated] = useState(false);
  const [syncStatus, setSyncStatus] = useState<CloudSyncStatus>("loading");
  useEffect(() => {
    const applySnapshot = (snapshot: CloudSnapshot) => {
      const completeRecords = Array.isArray(snapshot.decisionRecords) ? snapshot.decisionRecords.filter((record) => Boolean(record?.reviewedAt)).slice(0, 100) : [];
      if (completeRecords.length) setDecisionRecords(completeRecords);
      const latest = snapshot.latestDecision?.stock?.code ? snapshot.latestDecision : completeRecords[0];
      if (latest) setLatestDecision(latest);
      if (snapshot.rules?.investableCapital && snapshot.rules?.maxSingleStockRatio) setRules(snapshot.rules);
      if (snapshot.holdings && typeof snapshot.holdings === "object") setHoldings(snapshot.holdings);
      if (snapshot.watched && typeof snapshot.watched === "object") setWatched(snapshot.watched);
    };
    const readLocalSnapshot = (): CloudSnapshot => {
      try {
        const requestedView = new URLSearchParams(window.location.search).get("view");
        if (["desk", "research", "newDecision", "history", "portfolio", "rules", "privacy"].includes(requestedView ?? "")) setView(requestedView as View);
        return {
          latestDecision: JSON.parse(window.localStorage.getItem(LOCAL_DECISION_KEY) || "null") || undefined,
          decisionRecords: JSON.parse(window.localStorage.getItem(LOCAL_DECISIONS_KEY) || "[]"),
          rules: JSON.parse(window.localStorage.getItem(LOCAL_RULES_KEY) || "null") || undefined,
          holdings: JSON.parse(window.localStorage.getItem(LOCAL_HOLDINGS_KEY) || "null") || undefined,
          watched: JSON.parse(window.localStorage.getItem(LOCAL_WATCHED_KEY) || "null") || undefined,
        };
      } catch {
        window.localStorage.removeItem(LOCAL_DECISION_KEY);
        window.localStorage.removeItem(LOCAL_DECISIONS_KEY);
        window.localStorage.removeItem(LOCAL_RULES_KEY);
        window.localStorage.removeItem(LOCAL_HOLDINGS_KEY);
        window.localStorage.removeItem(LOCAL_WATCHED_KEY);
        return {};
      }
    };
    const controller = new AbortController();
    const loadSavedState = async () => {
      const local = readLocalSnapshot();
      try {
        const response = await fetch("/api/me/snapshot", { cache: "no-store", signal: controller.signal });
        const payload = await response.json() as { status?: string; snapshot?: CloudSnapshot };
        if (response.ok && payload.status === "ready" && payload.snapshot) {
          applySnapshot(payload.snapshot);
          setSyncStatus("synced");
        } else {
          applySnapshot(local);
          setSyncStatus(response.ok ? "saving" : "local");
        }
      } catch {
        if (!controller.signal.aborted) {
          applySnapshot(local);
          setSyncStatus("local");
        }
      } finally {
        if (!controller.signal.aborted) setStateHydrated(true);
      }
    };
    const onStorage = () => applySnapshot(readLocalSnapshot());
    void loadSavedState();
    window.addEventListener("storage", onStorage);
    return () => { controller.abort(); window.removeEventListener("storage", onStorage); };
  }, []);
  useEffect(() => {
    if (!stateHydrated) return;
    window.localStorage.setItem(LOCAL_DECISIONS_KEY, JSON.stringify(decisionRecords));
    window.localStorage.setItem(LOCAL_RULES_KEY, JSON.stringify(rules));
    window.localStorage.setItem(LOCAL_HOLDINGS_KEY, JSON.stringify(holdings));
    window.localStorage.setItem(LOCAL_WATCHED_KEY, JSON.stringify(watched));
    if (latestDecision) window.localStorage.setItem(LOCAL_DECISION_KEY, JSON.stringify(latestDecision));
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSyncStatus("saving");
      try {
        const response = await fetch("/api/me/snapshot", { method: "PUT", signal: controller.signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ rules, holdings, watched, decisionRecords, latestDecision }) });
        setSyncStatus(response.ok ? "synced" : "local");
      } catch {
        if (!controller.signal.aborted) setSyncStatus("local");
      }
    }, 700);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [stateHydrated, rules, holdings, watched, decisionRecords, latestDecision]);
  const goDecision = (context?: ResearchDecisionContext) => { setResearchDecisionContext(context); setView("decision"); };
  const showNotice = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(""), 3200); };
  const selectResearchStock = (target: Stock) => { setStock(target); setAction(holdingValueFor(holdings, target.code) > 0 ? "补仓" : "买入"); };
  const openResearch = (target?: Stock) => { if (target) selectResearchStock(target); setView("research"); };
  const startDecisionFor = (target: Stock) => { setResearchDecisionContext(undefined); selectResearchStock(target); setView("newDecision"); };
  const startNewDecision = () => { setResearchDecisionContext(undefined); const firstHolding = Object.entries(holdings).sort((a, b) => b[1].value - a[1].value)[0]; const target = firstHolding ? stocks.find((item) => item.code === firstHolding[0]) ?? { ...createCodeStock(firstHolding[0]), name: firstHolding[1].name } : stocks[0]; setStock(target); setAction(firstHolding ? "补仓" : "买入"); setView("newDecision"); };
  const finishDecision = (result: DecisionResult) => { setLatestDecision(result); setDecisionRecords((current) => [result, ...current].slice(0, 100)); setView("decisionResult"); };
  const saveTestFeedback = (feedback: TestFeedback) => { if (!latestDecision) return; const updated = { ...latestDecision, feedback }; setLatestDecision(updated); window.localStorage.setItem(LOCAL_DECISION_KEY, JSON.stringify(updated)); setDecisionRecords((current) => { const next = current.map((record) => record.reviewedAtIso === latestDecision.reviewedAtIso ? updated : record); window.localStorage.setItem(LOCAL_DECISIONS_KEY, JSON.stringify(next)); return next; }); showNotice("匿名测试反馈已保存"); };
  const restoreDecisionRecords = (restored: DecisionResult[]) => { setDecisionRecords(restored); setLatestDecision(restored[0]); window.localStorage.setItem(LOCAL_DECISIONS_KEY, JSON.stringify(restored)); if (restored[0]) window.localStorage.setItem(LOCAL_DECISION_KEY, JSON.stringify(restored[0])); showNotice(`已恢复 ${restored.length} 条决策记录`); };
  const recheckDecision = (record: DecisionResult) => { setResearchDecisionContext(record.reason ? { reason: record.reason, evidence: record.evidence } : undefined); setStock(record.stock); setAction(record.action); setView("decision"); };
  const saveRules = (nextRules: UserRules) => { setRules(nextRules); window.localStorage.setItem(LOCAL_RULES_KEY, JSON.stringify(nextRules)); showNotice("个人提醒规则已更新"); setView("desk"); };
  const saveHoldings = (nextHoldings: HoldingBook) => {
    setHoldings(nextHoldings);
    const held = holdingValueFor(nextHoldings, stock.code) > 0;
    if (held && action === "买入") setAction("补仓");
    if (!held && (action === "补仓" || action === "卖出")) setAction("买入");
    window.localStorage.setItem(LOCAL_HOLDINGS_KEY, JSON.stringify(nextHoldings));
  };
  const saveWatch = (target: Stock, followed: boolean) => { setWatched((current) => { const next = { ...current }; if (followed) next[target.code] = { name: target.name }; else delete next[target.code]; return next; }); showNotice(followed ? `已关注 ${target.name}` : `已取消关注 ${target.name}`); };
  const clearLocalData = async () => { setStateHydrated(false); try { await fetch("/api/me/snapshot", { method: "DELETE" }); } catch { /* Local deletion remains available offline. */ } window.localStorage.removeItem(LOCAL_DECISION_KEY); window.localStorage.removeItem(LOCAL_DECISIONS_KEY); window.localStorage.removeItem(LOCAL_RULES_KEY); window.localStorage.removeItem(LOCAL_HOLDINGS_KEY); window.localStorage.removeItem(LOCAL_WATCHED_KEY); setLatestDecision(undefined); setDecisionRecords([]); setRules(DEFAULT_RULES); setHoldings(DEFAULT_HOLDINGS); setWatched({}); setSyncStatus("synced"); showNotice("个人云端记录和本机备份已清空"); setView("desk"); window.setTimeout(() => setStateHydrated(true), 0); };
  const statusStockCode = view === "desk" ? Object.entries(holdings).sort((a, b) => b[1].value - a[1].value)[0]?.[0] || stock.code : stock.code;
  const syncFreshnessFromDrawer = useCallback((rows: SourceCheck[]) => {
    const quote = rows.find((row) => row.category === "行情");
    const evidence = rows.find((row) => row.category === "公告");
    setFreshnessOverride({ stockCode: statusStockCode, value: { state: quote?.status === "live" && evidence?.status === "live" ? "ready" : "partial", quote: quote ? `行情 ${quote.updatedAt} · ${quote.status === "live" ? "已取得" : quote.status === "partial" ? "部分可用" : "不可用"}` : "行情状态未知", evidence: evidence ? `公告 ${evidence.updatedAt} · ${evidence.status === "live" ? "已取得" : evidence.status === "partial" ? "部分可用" : "不可用"}` : "公告状态未知" } });
  }, [statusStockCode]);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <AppRail view={view} onView={(nextView) => { if (nextView === "decision") { startNewDecision(); return; } if (nextView === "research") setAction(holdingValueFor(holdings, stock.code) > 0 ? "补仓" : "买入"); setView(nextView); }} hasPending={false} />
      <div className="app-body">
        <AppHeader view={view} stockCode={statusStockCode} freshnessOverride={freshnessOverride} userName={authenticatedUser} syncStatus={syncStatus} onNewDecision={startNewDecision} onSelectStock={openResearch} onDataStatus={() => setShowDataStatus(true)} />
        {showDataStatus && <DataStatusDrawer stockCode={statusStockCode} open onClose={() => setShowDataStatus(false)} onStatus={syncFreshnessFromDrawer} />}
        {notice && <div className="toast-notice" role="status"><CheckCircle2 />{notice}<button onClick={() => setNotice("")} aria-label="关闭提示"><X /></button></div>}
        {view === "desk" && <DeskView onDecision={startNewDecision} onResearch={openResearch} onHistory={() => setView("history")} onPortfolio={() => setView("portfolio")} latest={latestDecision} records={decisionRecords} holdings={holdings} watched={watched} rules={rules} />}
        {view === "research" && <ResearchView stock={stock} setStock={selectResearchStock} action={action} setAction={setAction} onDecision={goDecision} holdings={holdings} watched={watched} onWatch={saveWatch} capital={rules.investableCapital} records={decisionRecords} />}
        {view === "newDecision" && <StartDecisionView stock={stock} onSelect={selectResearchStock} action={action} setAction={setAction} onResearch={() => setView("research")} onContinue={goDecision} holdings={holdings} capital={rules.investableCapital} />}
        {view === "decision" && <DecisionView stock={stock} action={action} rules={rules} holdings={holdings} priorDecision={decisionRecords.find((record) => record.stock.code === stock.code)} researchContext={researchDecisionContext} onEditRules={() => setView("rules")} onDone={finishDecision} onBack={() => setView("research")} />}
        {view === "decisionResult" && latestDecision && <DecisionResultView record={latestDecision} holdings={holdings} onDesk={() => setView("desk")} onHistory={() => setView("history")} onResearch={() => { setStock(latestDecision.stock); setView("research"); }} onFeedback={saveTestFeedback} />}
        {view === "history" && <HistoryView records={decisionRecords} onStart={startNewDecision} onResearch={openResearch} onRecheck={recheckDecision} onRestore={restoreDecisionRecords} />}
        {view === "portfolio" && <HoldingsView holdings={holdings} capital={rules.investableCapital} maxSingleStockValue={rules.maxSingleStockValue} maxSingleStockRatio={rules.maxSingleStockRatio} records={decisionRecords} onChange={saveHoldings} onNotice={showNotice} onResearch={openResearch} onReview={startDecisionFor} />}
        {view === "rules" && <RulesView rules={rules} onSave={saveRules} onBack={() => setView("desk")} />}
        {view === "privacy" && <PrivacyView recordCount={decisionRecords.length} holdingCount={Object.keys(holdings).length} syncStatus={syncStatus} onClear={() => { void clearLocalData(); }} onBack={() => setView("desk")} />}
      </div>
    </div>
  );
}
