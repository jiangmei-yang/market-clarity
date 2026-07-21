"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bookmark,
  BriefcaseBusiness,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Database,
  ExternalLink,
  FileSearch,
  Gauge,
  History,
  Inbox,
  LayoutDashboard,
  Layers3,
  Plus,
  Search,
  ReceiptText,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  TimerReset,
  TrendingDown,
  TriangleAlert,
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

type View = "desk" | "research" | "newDecision" | "decision" | "history" | "rules";
type TradeAction = "买入" | "补仓" | "卖出" | "继续观察";
type UserRules = { investableCapital: number; maxSingleStockValue: number; maxSingleStockRatio: number; singleAmountAlert: number; coolingHours: number; requireInvalidation: boolean };
type DecisionResult = { stock: Stock; action: TradeAction; originalAmount: number; finalAmount: number; result: "已修改" | "维持计划" | "已延迟"; message: string; reason?: string; invalidation?: string; horizon?: string; reviewedAt?: string; ruleSnapshot?: UserRules; issues?: string[]; remainingIssues?: string[]; scenarioLoss?: number; originalScenarioLoss?: number; durationSeconds?: number; evidence?: LiveEvidencePayload };

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
  status: "live" | "partial" | "fallback";
  provider?: string;
  fetchedAt?: string;
  message?: string;
  quote?: LiveQuote;
  history?: { data?: LiveHistoryPoint[] };
  evidence?: LiveEvidencePayload;
};
type ResearchEvidenceSnapshot = { requestedCode: string; status: "loading" | "ready" | "fallback"; payload?: LiveEvidencePayload };
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

const TOTAL_ASSETS = 238600;
const LOCAL_DECISION_KEY = "anxin.latestDecision.v1";
const LOCAL_DECISIONS_KEY = "anxin.decisionRecords.v1";
const LOCAL_RULES_KEY = "anxin.userRules.v1";
const DEFAULT_RULES: UserRules = { investableCapital: TOTAL_ASSETS, maxSingleStockValue: 60000, maxSingleStockRatio: 25, singleAmountAlert: 30000, coolingHours: 24, requireInvalidation: true };
const STRONG_RULES: UserRules = { investableCapital: TOTAL_ASSETS, maxSingleStockValue: 48000, maxSingleStockRatio: 20, singleAmountAlert: 20000, coolingHours: 24, requireInvalidation: true };
const holdingValues: Record<string, number> = { "600183": 46800, "600036": 57200 };

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

const reviewRows = [
  { time: "今天 10:24", stock: "生益科技", action: "补仓", before: "¥50,000", after: "¥10,000", result: "已修改", issue: "单股仓位超限" },
  { time: "7月19日 14:18", stock: "中芯国际", action: "买入", before: "¥30,000", after: "稍后再看", result: "已延迟", issue: "信息来源未核实" },
  { time: "7月16日 09:36", stock: "招商银行", action: "买入", before: "¥20,000", after: "¥20,000", result: "维持计划", issue: "未发现规则冲突" },
  { time: "7月12日 13:05", stock: "五粮液", action: "补仓", before: "¥40,000", after: "¥25,000", result: "已修改", issue: "行业集中度接近上限" },
];

const dailyChanges = [
  { id: 1, stockCode: "600183", time: "09:42", scope: "持仓", source: "公司公告", title: "生益科技发布上半年业绩预告", detail: "利润区间好于去年同期，但订单结构和现金流仍需等正式财报确认。", impact: "支持部分判断", tone: "support", priority: "高" },
  { id: 2, stockCode: "688981", time: "10:06", scope: "关注", source: "行情异常", title: "中芯国际放量上涨，板块同步走强", detail: "成交额较 5 日均值增加 31%；暂未发现同时间发布的公司公告。", impact: "原因未确认", tone: "uncertain", priority: "中" },
  { id: 3, stockCode: "600183", time: "08:18", scope: "持仓", source: "社交线索", title: "“海外大订单”说法传播加快", detail: "已检索交易所公告，尚未找到对应披露，不能作为已确认事实。", impact: "需要核实", tone: "weaken", priority: "高" },
  { id: 4, stockCode: "000858", time: "昨晚", scope: "关注", source: "行业数据", title: "白酒渠道价格继续承压", detail: "行业数据与原先的短期需求恢复判断不一致，建议更新观察条件。", impact: "削弱原判断", tone: "weaken", priority: "中" },
];

const navItems = [
  { id: "desk" as const, label: "工作台", icon: LayoutDashboard },
  { id: "research" as const, label: "股票研究", icon: FileSearch },
  { id: "decision" as const, label: "决策验证", icon: ShieldCheck },
  { id: "history" as const, label: "历史记录", icon: History },
  { id: "rules" as const, label: "我的规则", icon: SlidersHorizontal },
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
          <button key={id} className={view === id ? "rail-button active" : "rail-button"} onClick={() => onView(id)} aria-label={label} aria-current={view === id ? "page" : undefined}>
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

function AppHeader({ view, onNewDecision, onSelectStock, onNotice }: { view: View; onNewDecision: () => void; onSelectStock: (stock: Stock) => void; onNotice: (message: string) => void }) {
  const titles: Record<View, string> = { desk: "工作台", research: "股票研究", newDecision: "新建决策", decision: "决策验证", history: "历史记录", rules: "我的规则" };
  const [query, setQuery] = useState("");
  const [remoteMatches, setRemoteMatches] = useState<StockSearchItem[]>([]);
  const [searching, setSearching] = useState(false);
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
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setRemoteMatches([]);
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
    else if (/^\d{6}$/.test(query.trim())) { onSelectStock(createCodeStock(query.trim())); setQuery(""); }
    else if (query.trim() && !searching) onNotice(`暂未找到“${query.trim()}”，可尝试输入 6 位 A 股代码`);
  };
  return (
    <header className="app-header">
      <div className="header-title"><strong>{titles[view]}</strong><span>{view === "research" ? "实时行情以页内更新时间为准" : "7月21日 · 记录保存在本设备"}</span></div>
      <form className="global-search" onSubmit={(event) => { event.preventDefault(); submitSearch(); }}>
        <Search />
        <input value={query} onChange={(event) => { setQuery(event.target.value); setRemoteMatches([]); setSearching(false); }} placeholder="搜索股票、代码或行业" aria-label="搜索股票" autoComplete="off" />
        <kbd>⌘ K</kbd>
        {query && <div className="search-results" role="listbox" aria-label="股票搜索结果">{matches.length > 0 ? matches.map((stock) => <button type="button" role="option" aria-selected="false" key={stock.code} onClick={() => { onSelectStock(stock); setQuery(""); }}><span><b>{stock.name}</b><small>{stock.code}.{stock.market} · {stock.industry}</small></span><span>{stock.price > 0 ? <><b>{stock.price.toFixed(2)}</b><PriceChange value={stock.change} /></> : <small>载入真实资料</small>}</span></button>) : searching ? <div className="search-empty"><strong>正在搜索 A 股列表…</strong><span>支持股票简称和 6 位代码</span></div> : /^\d{6}$/.test(query.trim()) ? <button type="button" role="option" aria-selected="false" onClick={() => { onSelectStock(createCodeStock(query.trim())); setQuery(""); }}><span><b>查询 {query.trim()}</b><small>从真实数据服务载入 A 股资料</small></span><ArrowRight /></button> : <div className="search-empty"><strong>没有匹配结果</strong><span>可尝试输入 6 位 A 股代码</span></div>}</div>}
      </form>
      <div className="header-actions">
        <Button variant="outline" size="lg" onClick={() => onNotice("研究页优先读取真实行情；连接失败时会明确标注样例回退")}><Database data-icon="inline-start" />数据状态</Button>
        <Button size="lg" onClick={onNewDecision}><Plus data-icon="inline-start" />新建决策</Button>
      </div>
    </header>
  );
}

function SectionHeader({ title, meta, action }: { title: string; meta?: string; action?: React.ReactNode }) {
  return <div className="section-header"><div><h2>{title}</h2>{meta && <span>{meta}</span>}</div>{action}</div>;
}

function TaskRail({ onDecision, onResearch, onHistory, latest }: { onDecision: () => void; onResearch: (stock?: Stock) => void; onHistory: () => void; latest?: DecisionResult }) {
  return (
    <aside className="context-rail">
      <div className="context-heading"><div><strong>今日节奏</strong><span>7月21日</span></div><CalendarClock aria-hidden="true" /></div>
      <ol className="day-rhythm">
        <li className="done"><span><Check /></span><div><strong>盘前浏览</strong><small>4 条相关变化已整理</small></div><time>08:55</time></li>
        <li className={latest ? "done" : "active"}><span>{latest ? <Check /> : <Activity />}</span><div><strong>盘中关注</strong><small>{latest ? "本次计划已记录" : "1 项判断需要复核"}</small></div><time>现在</time></li>
        <li><span><Clock3 /></span><div><strong>收盘后回看</strong><small>记录今日选择与结果</small></div><time>15:10</time></li>
      </ol>
      <Separator />
      <div className="context-heading small"><div><strong>我的股票</strong><span>2 持仓 · 3 关注</span></div></div>
      <div className="compact-stock-list">
        {stocks.slice(0, 4).map((stock) => <button key={stock.code} onClick={() => onResearch(stock)}><span><b>{stock.name}</b><small>{stock.code}</small></span><span><b>{stock.price.toFixed(2)}</b><PriceChange value={stock.change} /></span></button>)}
      </div>
      <button className="context-link" onClick={() => onResearch()}>查看全部关注 <ChevronRight /></button>
      {latest ? <button className="rail-pending-decision completed" onClick={onHistory}><CheckCircle2 /><span><strong>本次审查已完成</strong><small>{latest.stock.name} · {latest.result}</small></span><ChevronRight /></button> : <button className="rail-pending-decision" onClick={onDecision}><ShieldCheck /><span><strong>1 项待完成审查</strong><small>生益科技 · 补仓</small></span><ChevronRight /></button>}
    </aside>
  );
}

function PortfolioSnapshot({ latest }: { latest?: DecisionResult }) {
  return (
    <section className="workspace-section portfolio-snapshot">
      <SectionHeader title="持仓暴露" meta="模拟持仓 · 数据截面 10:30" action={<Badge variant="outline">固定样例</Badge>} />
      <div className="portfolio-grid">
        <div className="asset-total"><span>记录资产</span><strong>¥238,600</strong><small>4 个行业 · 6 只股票</small></div>
        <div className="allocation-block"><div className="allocation-bar"><i className="segment electronics" /><i className="segment finance" /><i className="segment consumer" /><i className="segment other" /></div><div className="allocation-legend"><span><i className="electronics" />电子 31%</span><span><i className="finance" />金融 24%</span><span><i className="consumer" />消费 18%</span><span><i className="other" />其他 27%</span></div></div>
        <Alert className="rule-alert">{latest ? <><CheckCircle2 /><AlertTitle>最近的计划已记录</AlertTitle><AlertDescription>{latest.result === "已延迟" ? `${latest.stock.name}${latest.action}原计划 ¥${latest.originalAmount.toLocaleString()}，已选择稍后再看。` : `${latest.stock.name}${latest.action}由 ¥${latest.originalAmount.toLocaleString()} 调整为 ¥${latest.finalAmount.toLocaleString()}。`}</AlertDescription></> : <><TriangleAlert /><AlertTitle>电子行业接近上限</AlertTitle><AlertDescription>若执行当前补仓计划，行业占比将进一步升高。</AlertDescription></>}</Alert>
      </div>
    </section>
  );
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

function RecentTable({ onHistory, latest }: { onHistory?: () => void; latest?: DecisionResult }) {
  const rows = latest ? [{ time: "最近", stock: latest.stock.name, action: latest.action, before: `¥${latest.originalAmount.toLocaleString()}`, after: latest.result === "已延迟" ? "稍后再看" : `¥${latest.finalAmount.toLocaleString()}`, result: latest.result, issue: latest.result === "已修改" ? "仓位与失效条件已更新" : "已完成审查" }, ...reviewRows] : reviewRows;
  return (
    <section className="workspace-section review-table-section">
      <SectionHeader title="最近决策" meta="保留原计划与最终选择" action={onHistory && <Button variant="ghost" size="sm" onClick={onHistory}>全部记录<ChevronRight data-icon="inline-end" /></Button>} />
      <Table>
        <TableHeader><TableRow><TableHead>时间</TableHead><TableHead>股票</TableHead><TableHead>操作</TableHead><TableHead className="numeric">原计划</TableHead><TableHead className="numeric">最终选择</TableHead><TableHead>结果</TableHead></TableRow></TableHeader>
        <TableBody>{rows.slice(0, onHistory ? 3 : 4).map((row) => <TableRow key={row.time + row.stock}><TableCell className="muted-cell">{row.time}</TableCell><TableCell><strong>{row.stock}</strong></TableCell><TableCell>{row.action}</TableCell><TableCell className="numeric">{row.before}</TableCell><TableCell className="numeric">{row.after}</TableCell><TableCell><Badge variant="outline">{row.result}</Badge></TableCell></TableRow>)}</TableBody>
      </Table>
    </section>
  );
}

function DeskView({ onDecision, onResearch, onHistory, latest }: { onDecision: () => void; onResearch: (stock?: Stock) => void; onHistory: () => void; latest?: DecisionResult }) {
  const [filter, setFilter] = useState<"全部" | "持仓" | "关注">("全部");
  const visibleChanges = dailyChanges.filter((item) => filter === "全部" || item.scope === filter);
  return (
    <div className="shell-with-context view-enter">
      <TaskRail onDecision={onDecision} onResearch={onResearch} onHistory={onHistory} latest={latest} />
      <main className="workspace desk-workspace" id="main-content">
        {latest ? <section className="priority-action completed-priority">
          <div className="priority-copy"><div><Badge variant="secondary">最近完成</Badge><span>选择已记录</span></div><h1>{latest.stock.name}{latest.action}计划{latest.result === "已延迟" ? "已暂缓" : latest.result === "已修改" ? "已调整" : "已确认"}</h1><p>原计划 ¥{latest.originalAmount.toLocaleString()}，最终选择 {latest.result === "已延迟" ? "稍后再看" : `¥${latest.finalAmount.toLocaleString()}`}。系统保留原计划、风险检查与最终选择，方便以后复核。</p><div className="priority-reasons"><span><CheckCircle2 />本次审查已完成</span><span><FileSearch />证据与推断已分开</span><span><History />可在历史记录中回看</span></div></div>
          <div className="priority-visual decision-complete-visual" aria-label="计划修改结果"><CheckCircle2 /><strong>{latest.result}</strong><span>¥{latest.originalAmount.toLocaleString()}<ArrowRight />{latest.result === "已延迟" ? "稍后再看" : `¥${latest.finalAmount.toLocaleString()}`}</span><small>原计划与最终选择均已保留</small></div>
          <Button size="lg" variant="outline" onClick={onHistory}>查看记录<ArrowRight data-icon="inline-end" /></Button>
        </section> : <section className="priority-action">
          <div className="priority-copy"><div><Badge variant="outline">现在最需要处理</Badge><span>10:24 保存</span></div><h1>生益科技补仓计划超过你的仓位上限</h1><p>计划补仓 ¥50,000 后，单股占比将从 19.6% 升至 41%。理由中的“海外大订单”尚未在公司公告中找到印证。</p><div className="priority-reasons"><span><ShieldCheck />超过上限 16%</span><span><FileSearch />1 条信息待核实</span><span><TrendingDown />下跌 20% 影响 ¥19,360</span></div></div>
          <div className="priority-visual" aria-label="补仓前后仓位对比"><div className="visual-labels"><span>当前 19.6%</span><b>个人上限 25%</b><span>计划后 41%</span></div><div className="position-scale"><i className="current-position" /><i className="limit-marker" /><i className="planned-position" /></div><small>计划后超过个人上限 16 个百分点</small></div>
          <Button size="lg" onClick={onDecision}>继续审查<ArrowRight data-icon="inline-end" /></Button>
        </section>}
        <section className="daily-brief">
          <div className="brief-heading"><div><span className="eyebrow">自昨天 15:00 以来</span><h1>今天还有 4 条变化值得查看</h1><p>系统从 27 条行情、公告与关注信息中，保留了可能影响持仓或原有判断的内容。</p></div><div className="brief-status"><span><i />数据截面 10:32</span><Badge variant="outline">固定样例</Badge></div></div>
          <div className="brief-metrics"><div><Inbox /><span><small>与持仓直接相关</small><strong>2 条</strong></span></div><div><TimerReset /><span><small>需要更新判断</small><strong>2 项</strong></span></div><div><CalendarClock /><span><small>未来 7 天事件</small><strong>3 个</strong></span></div></div>
        </section>
        <div className="daily-grid">
          <section className="workspace-section change-inbox">
            <SectionHeader title="变化收件箱" meta="按与你的关系和证据可信度排序" action={<div className="inbox-filters" role="group" aria-label="筛选变化">{(["全部", "持仓", "关注"] as const).map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div>} />
            <div className="change-list">{visibleChanges.map((item) => <button key={item.id} className="change-row" onClick={() => onResearch(stocks.find((stock) => stock.code === item.stockCode))}><span className={`change-priority ${item.priority === "高" ? "high" : ""}`}>{item.priority}</span><div className="change-main"><div><Badge variant="outline">{item.scope}</Badge><span>{item.source}</span><time>{item.time}</time></div><strong>{item.title}</strong><p>{item.detail}</p></div><span className={`thesis-impact ${item.tone}`}>{item.impact}</span><ChevronRight /></button>)}</div>
            <div className="inbox-footer">已隐藏 23 条低相关信息</div>
          </section>
          <aside className="daily-side">
            <section className="today-events"><SectionHeader title="今日与近期事件" meta="与你的股票有关" /><div className="event-list"><article><time>今天</time><div><strong>生益科技业绩预告</strong><small>已发布 · 需要更新判断</small></div><span className="event-dot-now" /></article><article><time>7月24日</time><div><strong>中芯国际股东大会</strong><small>3 天后 · 已设提醒</small></div></article><article><time>7月30日</time><div><strong>美联储议息结果</strong><small>可能影响成长股估值</small></div></article></div></section>
            <section className="thesis-watch"><SectionHeader title="待复核判断" meta="不是价格提醒" /><button onClick={() => onResearch(stocks.find((stock) => stock.code === "600183"))}><span><Badge variant="secondary">生益科技</Badge><small>上次更新 12 天前</small></span><strong>海外需求改善会带动订单增长</strong><p>新业绩预告支持利润改善，但尚未说明海外订单来源。</p><span className="review-link">查看证据影响 <ArrowRight /></span></button><button onClick={() => onResearch(stocks.find((stock) => stock.code === "000858"))}><span><Badge variant="secondary">五粮液</Badge><small>上次更新 18 天前</small></span><strong>渠道库存将在三季度改善</strong><p>最新行业数据与该判断不一致。</p><span className="review-link">更新观察条件 <ArrowRight /></span></button></section>
          </aside>
        </div>
        <PortfolioSnapshot latest={latest} />
        <RecentTable onHistory={onHistory} latest={latest} />
      </main>
    </div>
  );
}

function StockRail({ selected, onSelect, followedStocks, liveQuote }: { selected: Stock; onSelect: (stock: Stock) => void; followedStocks: Record<string, boolean>; liveQuote?: LiveQuote }) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<"关注" | "持仓" | "最近">("关注");
  const holdingCodes = new Set(Object.keys(holdingValues));
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
      <div className="stock-rail-list">{filteredStocks.map((stock) => { const isLiveSelection = stock.code === selected.code && liveQuote; const price = isLiveSelection ? liveQuote.current_price : stock.price; const change = isLiveSelection ? liveQuote.change_percent ?? stock.change : stock.change; return <button key={stock.code} className={stock.code === selected.code ? "active" : ""} onClick={() => onSelect(stock)}><span className="stock-ident"><i>{stock.name.slice(0, 1)}</i><span><b>{isLiveSelection && liveQuote.stock_name ? liveQuote.stock_name : stock.name}</b><small>{stock.code}.{stock.market}</small></span></span><span className="stock-quote"><b>{price.toFixed(2)}</b><PriceChange value={change} /></span></button>; })}{filteredStocks.length === 0 && <div className="rail-empty"><Search /><strong>没有匹配股票</strong><span>可尝试输入 6 位代码</span></div>}</div>
      <div className="context-link static">当前列表 {filteredStocks.length} 只 · 已选股票与本地关注</div>
    </aside>
  );
}

function StartDecisionView({ stock, onSelect, action, setAction, onResearch, onContinue }: { stock: Stock; onSelect: (stock: Stock) => void; action: TradeAction; setAction: (action: TradeAction) => void; onResearch: () => void; onContinue: () => void }) {
  const [query, setQuery] = useState("");
  const [remoteMatches, setRemoteMatches] = useState<StockSearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const holdingValue = holdingValues[stock.code] ?? 0;
  const holdingRatio = holdingValue / TOTAL_ASSETS * 100;
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
  const selectedUsesLiveService = !stocks.some((item) => item.code === stock.code) || stock.price === 0;
  return (
    <main className="start-decision-page view-enter" id="main-content">
      <section className="workspace start-decision-workspace">
        <header className="start-decision-header">
          <div><Badge variant="outline">交易前审查</Badge><h1>选择股票和准备进行的操作</h1><p>系统会使用当前持仓、个人边界和该股票的证据进入下一步。</p></div>
          <span className="data-provenance"><Database /><b>{selectedUsesLiveService ? "真实数据入口" : "样例行情"}</b><small>{selectedUsesLiveService ? "研究页载入最新资料" : "行情截面 10:32"}</small></span>
        </header>
        <div className="start-decision-grid">
          <section className="stock-picker-panel">
            <label className="stock-picker-search"><Search /><input value={query} onChange={(event) => { const next = event.target.value; setQuery(next); setRemoteMatches([]); const normalized = next.trim(); const hasLocal = stocks.some((item) => item.name.includes(normalized) || item.code.includes(normalized) || item.industry.includes(normalized)); setSearching(Boolean(normalized) && !hasLocal); }} placeholder="输入股票名称、代码或行业，例如半导体" aria-label="选择决策股票" /></label>
            <div className="stock-picker-heading"><strong>选择股票</strong><span>{searching ? "正在搜索 A 股列表…" : `${matches.length} 只可用`}</span></div>
            <div className="stock-picker-list">{matches.map((item) => { const held = holdingValues[item.code] ?? 0; return <button key={item.code} className={item.code === stock.code ? "selected" : ""} aria-pressed={item.code === stock.code} onClick={() => onSelect(item)}><span className="stock-picker-ident"><i>{item.name.slice(0, 1)}</i><span><strong>{item.name}</strong><small>{item.code}.{item.market} · {item.industry}</small></span></span><span className="stock-picker-quote">{item.price > 0 ? <><strong>{item.price.toFixed(2)}</strong><PriceChange value={item.change} /></> : <small>研究页载入</small>}</span><span className="holding-state">{held > 0 ? `持仓 ¥${held.toLocaleString()}` : "未持仓"}</span><CheckCircle2 /></button>; })}{matches.length === 0 && <div className="stock-picker-empty"><Search /><strong>{searching ? "正在搜索 A 股列表…" : "没有找到匹配股票"}</strong><span>{searching ? "支持股票简称和 6 位代码" : "可输入股票简称、6 位代码或行业关键词"}</span></div>}</div>
          </section>
          <aside className="decision-setup-panel">
            <div className="selected-stock-summary"><span><i>{stock.name.slice(0, 1)}</i><span><small>当前选择</small><strong>{stock.name}</strong><em>{stock.code}.{stock.market}</em></span></span><PriceChange value={stock.change} /></div>
            <dl><div><dt>当前持仓</dt><dd>{holdingValue > 0 ? `¥${holdingValue.toLocaleString()}` : "尚无持仓"}</dd></div><div><dt>占记录资产</dt><dd>{holdingValue > 0 ? `${holdingRatio.toFixed(1)}%` : "0.0%"}</dd></div><div><dt>数据状态</dt><dd>{selectedUsesLiveService ? "进入研究页后载入真实资料" : "样例行情 · 10:32"}</dd></div></dl>
            <div className="setup-action"><strong>准备做什么？</strong><div className="action-segments" role="radiogroup" aria-label="新决策操作">{actions.map((item) => { const unavailable = holdingValue === 0 && (item === "补仓" || item === "卖出"); return <button key={item} role="radio" aria-checked={action === item} className={action === item ? "active" : ""} disabled={unavailable} onClick={() => setAction(item)}>{action === item && <Check />}{item}</button>; })}</div></div>
            <div className="setup-note"><ShieldCheck /><p><strong>下一步会检查</strong><span>计划金额、仓位上限、下跌情景和理由证据。</span></p></div>
            <div className="setup-actions"><Button variant="outline" size="lg" onClick={onResearch}>先查看研究</Button><Button size="lg" onClick={action === "继续观察" ? onResearch : onContinue}>{action === "继续观察" ? "进入股票研究" : "继续填写计划"}<ArrowRight data-icon="inline-end" /></Button></div>
          </aside>
        </div>
      </section>
    </main>
  );
}

function buildLiveChartPath(points: LiveHistoryPoint[]) {
  if (points.length < 2) return "";
  const values = points.map((point) => Number(point.close)).filter(Number.isFinite);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const spread = Math.max(maximum - minimum, 0.01);
  return points.map((point, index) => {
    const x = index / (points.length - 1) * 690;
    const y = 174 - ((Number(point.close) - minimum) / spread) * 148;
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
}

function PriceChart({ stock, liveHistory }: { stock: Stock; liveHistory?: LiveHistoryPoint[] }) {
  const [range, setRange] = useState<"1月" | "3月" | "1年">("1月");
  const paths = {
    "1月": stock.change >= 0 ? "M0 142 C70 149 108 124 168 131 S260 96 318 112 S410 76 475 80 S594 50 690 42" : "M0 62 C90 70 122 88 185 82 S284 108 350 104 S462 139 520 132 S624 154 690 148",
    "3月": stock.change >= 0 ? "M0 168 C55 162 74 130 126 143 S206 112 254 120 S336 72 388 86 S462 44 532 58 S615 21 690 31" : "M0 46 C62 53 88 78 138 69 S221 102 270 94 S350 128 410 119 S506 150 560 141 S629 165 690 158",
    "1年": stock.change >= 0 ? "M0 133 C58 101 98 152 150 124 S238 147 292 108 S380 129 433 76 S516 100 573 56 S638 66 690 31" : "M0 42 C68 82 110 55 162 88 S251 73 310 111 S394 96 448 130 S548 118 605 153 S654 143 690 162",
  };
  const livePoints = range === "1月" && liveHistory && liveHistory.length > 1 ? liveHistory : undefined;
  const chartPath = livePoints ? buildLiveChartPath(livePoints) : paths[range];
  const chartHigh = livePoints ? Math.max(...livePoints.map((point) => Number(point.close))) : Number(stock.chartHigh);
  const chartLow = livePoints ? Math.min(...livePoints.map((point) => Number(point.close))) : Number(stock.chartLow);
  const axisPrecision = stock.price >= 100 ? 0 : 2;
  const axisValues = [0, 1 / 3, 2 / 3, 1].map((step) => (chartHigh - (chartHigh - chartLow) * step).toFixed(axisPrecision));
  const dateLabels = livePoints ? [livePoints[0].date, livePoints[Math.floor(livePoints.length / 3)].date, livePoints[Math.floor(livePoints.length * 2 / 3)].date, livePoints.at(-1)?.date ?? ""] : { "1月": ["6月21日", "7月1日", "7月11日", "7月21日"], "3月": ["4月21日", "5月21日", "6月20日", "7月21日"], "1年": ["2025年7月", "11月", "2026年3月", "7月"] }[range];
  const liveVolumes = livePoints?.map((point) => Number(point.volume ?? 0)) ?? [];
  const maxVolume = Math.max(...liveVolumes, 1);
  const volumes = livePoints ? liveVolumes.map((value) => Math.max(8, value / maxVolume * 100)) : [38, 54, 33, 68, 44, 71, 56, 82, 63, 88, 72, 95];
  return (
    <div className="chart-block">
      <div className="chart-toolbar"><div><strong>{livePoints ? `${livePoints.length} 个交易日` : range === "1月" ? stock.oneMonth : range === "3月" ? stock.momentum : stock.oneYear}</strong><span>{livePoints ? "真实历史数据" : "区间表现"}</span><small>{livePoints ? `数据区间：最高 ${chartHigh.toFixed(axisPrecision)} · 最低 ${chartLow.toFixed(axisPrecision)}` : `当前样例区间：最高 ${stock.chartHigh} · 最低 ${stock.chartLow}`}</small></div><div className="range-selector">{(["1月", "3月", "1年"] as const).map((item) => <button key={item} className={range === item ? "active" : ""} onClick={() => setRange(item)}>{item}</button>)}</div></div>
      <div className="chart-wrap">
      <div className="chart-grid">{axisValues.map((value) => <span key={value}>{value}</span>)}</div>
      <svg viewBox="0 0 690 190" role="img" aria-label={`${stock.name}${range}价格走势`} preserveAspectRatio="none">
        <defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity=".2"/><stop offset="100%" stopColor="var(--primary)" stopOpacity="0"/></linearGradient></defs>
        <path className="chart-area" d={`${chartPath} L690 190 L0 190 Z`} />
        <path className="chart-line" d={chartPath} />
        <line className="event-line" x1="418" x2="418" y1="20" y2="178" /><circle className="event-dot" cx="418" cy="82" r="5" />
      </svg>
      <div className="chart-dates">{dateLabels.map((date) => <span key={date}>{date}</span>)}</div>
      </div>
      <div className="volume-strip" aria-label="成交量变化">{volumes.map((value, index) => <i key={index} style={{ height: `${value}%` }} />)}</div>
      <div className="chart-legend"><span><i className="price-line-key" />收盘价</span><span><i className="event-key" />公司事件</span><span><i className="volume-key" />成交量</span></div>
    </div>
  );
}

function ResearchActionPanel({ stock, action, setAction, onDecision, saved, onSave, dataStatus }: { stock: Stock; action: TradeAction; setAction: (action: TradeAction) => void; onDecision: () => void; saved: boolean; onSave: () => void; dataStatus: InformationSnapshot["status"] | "loading" }) {
  const actions: TradeAction[] = ["买入", "补仓", "卖出", "继续观察"];
  const holdingValue = holdingValues[stock.code] ?? 0;
  const holdingRatio = holdingValue / TOTAL_ASSETS * 100;
  return (
    <aside className="research-aside">
      <div className="aside-heading"><Target /><div><h2>准备做什么</h2><p>针对 {stock.name}</p></div></div>
      <div className="action-segments" role="radiogroup" aria-label="选择操作">{actions.map((item) => { const unavailable = holdingValue === 0 && (item === "补仓" || item === "卖出"); return <button key={item} role="radio" aria-checked={action === item} className={action === item ? "active" : ""} disabled={unavailable} title={unavailable ? "当前没有这只股票的持仓" : undefined} onClick={() => setAction(item)}>{action === item && <Check />}{item}</button>; })}</div>
      <div className="action-summary"><span>当前持仓</span><strong>{holdingValue > 0 ? `¥${holdingValue.toLocaleString()}` : "尚无持仓"}</strong><small>{holdingValue > 0 ? `占记录资产 ${holdingRatio.toFixed(1)}%` : "可从买入或继续观察开始"}</small></div>
      <Separator />
      <div className="aside-checks"><h3>进入决策前</h3><p><CheckCircle2 />{dataStatus === "live" ? "实时行情与历史价格已载入" : dataStatus === "partial" ? "部分实时数据已载入" : dataStatus === "loading" ? "正在连接行情服务" : "当前使用明确标注的样例数据"}</p><p><TriangleAlert />1 条外部信息待核实</p><p><Gauge />进入后计算仓位与下跌情景</p></div>
      <Button size="lg" onClick={onDecision} disabled={action === "继续观察"}>{action === "继续观察" ? "已加入观察" : `开始${action}审查`}<ArrowRight data-icon="inline-end" /></Button>
      <button className={saved ? "aside-secondary saved" : "aside-secondary"} onClick={onSave}>{saved ? <CheckCircle2 /> : <Bookmark />}{saved ? "已保存在本次会话" : "保存研究档案"}</button>
    </aside>
  );
}

function ResearchView({ stock, setStock, action, setAction, onDecision }: { stock: Stock; setStock: (stock: Stock) => void; action: TradeAction; setAction: (action: TradeAction) => void; onDecision: () => void }) {
  const [panel, setPanel] = useState<"概览" | "价格与事件" | "证据链" | "待验证问题">("概览");
  const [followedStocks, setFollowedStocks] = useState<Record<string, boolean>>({ "600183": true, "688981": true, "000858": true });
  const [savedResearch, setSavedResearch] = useState<Record<string, boolean>>({});
  const [information, setInformation] = useState<InformationSnapshot>();
  const [researchEvidence, setResearchEvidence] = useState<ResearchEvidenceSnapshot>();
  const profile = researchProfiles[stock.code] ?? genericResearchProfile;
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
    const timer = window.setTimeout(() => setResearchEvidence({ requestedCode, status: "loading" }), 0);
    fetch(`/api/evidence/${stock.code}?reason=${encodeURIComponent(profile.rumor)}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as LiveEvidencePayload;
        setResearchEvidence({ requestedCode, status: response.ok ? "ready" : "fallback", payload: response.ok ? payload : undefined });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setResearchEvidence({ requestedCode, status: "fallback" });
      });
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [stock.code, profile.rumor]);
  const hasResearchProfile = Boolean(researchProfiles[stock.code]);
  const followed = followedStocks[stock.code] ?? false;
  const saved = savedResearch[stock.code] ?? false;
  const currentInformation = information?.requestedCode === stock.code ? information : undefined;
  const currentEvidence = researchEvidence?.requestedCode === stock.code ? researchEvidence : undefined;
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
  const displayPrice = quote?.current_price ?? stock.price;
  const displayChange = quote?.change_percent ?? stock.change;
  const displayTurnover = quote ? quote.amount ? `${(quote.amount / 100_000_000).toFixed(1)} 亿` : "暂无" : stock.turnover;
  const displayIndustry = quote && stock.industry.includes("正在载入") ? "A股" : stock.industry;
  const updateLabel = quote?.update_time
    ? `最近交易日 ${new Date(quote.update_time).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}`
    : "样例截面 10:32";
  const statusLabel = dataStatus === "live" ? "实时数据" : dataStatus === "partial" ? "部分实时" : dataStatus === "loading" ? "连接数据源" : "样例回退";
  const effectiveStock = { ...stock, name: displayName, price: displayPrice, change: displayChange, turnover: displayTurnover };
  const researchSummary = liveEvidence?.assessment?.summary
    ?? (dataStatus === "live" || dataStatus === "partial"
      ? `已载入 ${historyPoints.length} 个价格点；${currentEvidence?.status === "loading" ? "公开资料仍在并行核实。" : "当前未取得与理由相关的正式披露。"}缺失的基本面和外部说法不会由系统补写。`
      : dataStatus === "loading"
        ? "正在连接公开行情与披露来源，暂不显示未经核实的研究结论。"
        : "实时资料暂不可用。下方判断档案仅用于演示工作流，不代表当前事实。 ");
  return (
    <div className="shell-with-context view-enter">
      <StockRail selected={stock} onSelect={setStock} followedStocks={followedStocks} liveQuote={quote} />
      <main className="research-layout" id="main-content">
        <article className="workspace research-dossier">
          <header className="stock-dossier-header">
            <div><div className="stock-title-line"><h1>{displayName}</h1><Badge variant="outline">{stock.code}.{stock.market}</Badge><Button variant="ghost" size="icon-sm" className={followed ? "active" : ""} aria-label={followed ? "取消关注股票" : "关注股票"} aria-pressed={followed} onClick={() => setFollowedStocks((current) => ({ ...current, [stock.code]: !followed }))}>{followed ? <Check /> : <Bookmark />}</Button></div><p>{displayIndustry} · {updateLabel}</p><span className={`live-data-status ${dataStatus}`}><i />{statusLabel}<small>{currentInformation?.provider ?? "daily_stock_analysis"}</small></span></div>
            <div className="stock-live-price"><strong>{displayPrice.toFixed(2)}</strong><PriceChange value={displayChange} /><small>成交额 {displayTurnover}</small></div>
          </header>
          <section className="since-last-strip"><div><TimerReset /><span><strong>当前资料状态</strong><small>{currentEvidence?.status === "loading" ? "公开资料核实中" : `${officialCount} 条正式披露 · ${sourceCount} 个独立来源`} · {currentInformation?.history?.data?.length ?? 0} 个价格点</small></span></div><button onClick={() => setPanel("证据链")}>查看证据来源 <ChevronRight /></button></section>
          <nav className="research-tabs" aria-label="研究视图">{(["概览", "价格与事件", "证据链", "待验证问题"] as const).map((item) => <button key={item} className={panel === item ? "active" : ""} onClick={() => setPanel(item)}>{item}{item === "证据链" && <i>{evidenceCount}</i>}{item === "待验证问题" && <i>3</i>}</button>)}</nav>
          {panel === "概览" && <div className="research-panel overview-panel">
            <section className="research-verdict"><div className="verdict-heading"><div><Badge variant="secondary"><Sparkles data-icon="inline-start" />研究摘要</Badge><span>{liveEvidence ? "来自本次公开资料检索" : "仅展示已取得的数据"}</span></div><span className="verdict-state"><i />关键证据仍缺失</span></div><p>{researchSummary}</p><div className="verdict-points">{liveEvidence ? <><span><CheckCircle2 /><b>本次核实</b>{liveEvidence.assessment?.status ?? "已返回公开资料"}</span><span><TriangleAlert /><b>来源覆盖</b>{officialCount} 条正式披露 / {sourceCount} 个来源</span><span><Gauge /><b>仍需验证</b>{profile.gap}</span></> : <><span><CheckCircle2 /><b>价格数据</b>{historyReady ? `${historyPoints.length} 个交易日已载入` : "尚未载入"}</span><span><TriangleAlert /><b>正式披露</b>当前未取得</span><span><Gauge /><b>下一步</b>先查看来源，再形成判断</span></>}</div></section>
            {historyReady ? <section className="signal-board"><SectionHeader title="市场信号" meta="由本次取得的历史价格计算" /><div className="signal-list"><div><span><b>近20日变化</b><em>{liveMomentum >= 0 ? "+" : ""}{liveMomentum.toFixed(1)}%</em></span><i><b style={{ width: `${Math.max(0, Math.min(100, 50 + liveMomentum * 3))}%` }} /></i><small>起止收盘价计算，不代表未来方向</small></div><div><span><b>估值位置</b><em>未接入</em></span><i><b style={{ width: "0%" }} /></i><small>没有统一可比口径时不展示样例分位</small></div><div><span><b>成交活跃度</b><em>{liveActivity ? `${liveActivity.toFixed(0)}%` : "暂无"}</em></span><i><b style={{ width: `${Math.max(0, Math.min(100, liveActivity))}%` }} /></i><small>最近一日成交量 / 近20日均量</small></div></div></section> : <section className="signal-board data-readiness"><SectionHeader title="资料完整度" meta="缺失的数据不会由 AI 猜测" /><div className="readiness-list"><span><CheckCircle2 /><b>实时行情</b><em>{quote ? "已载入" : dataStatus === "loading" ? "连接中" : "暂无"}</em></span><span><CheckCircle2 /><b>历史价格</b><em>{historyPoints.length ? `${historyPoints.length} 个交易日` : dataStatus === "loading" ? "连接中" : "暂无"}</em></span><span><CheckCircle2 /><b>正式披露</b><em>{officialCount ? `${officialCount} 条` : "暂无"}</em></span><span><TriangleAlert /><b>财务基本面</b><em>待接入</em></span></div></section>}
            {hasResearchProfile ? <section className="thesis-card">
              <div className="thesis-card-heading"><div><span className="eyebrow">演示判断档案</span><h2>{profile.thesis}</h2></div><div><Badge variant="outline">需由用户确认</Badge><span>不是当前事实</span></div></div>
              <div className="thesis-impact-map"><div><span>本次公开资料</span><strong>{liveEvidence?.assessment?.summary ?? "尚未取得可核实证据"}</strong></div><ArrowRight /><div className="active"><span>对判断的影响</span><strong>{liveEvidence?.assessment?.status ?? "暂不能判断"}</strong></div><ArrowRight /><div><span>仍缺少</span><strong>{profile.gap}</strong></div></div>
              <div className="thesis-fields"><div><span>判断失效条件</span><strong>{profile.invalidation}</strong></div><div><span>下一次复核</span><strong>下一期正式财报发布后</strong></div></div>
              <button onClick={() => setPanel("待验证问题")}>查看判断条件 <ChevronRight /></button>
            </section> : <section className="thesis-card empty-thesis"><div className="thesis-card-heading"><div><span className="eyebrow">我的判断</span><h2>尚未为 {displayName} 建立判断</h2></div><Badge variant="outline">等待用户输入</Badge></div><p>先写清为什么关注、需要核实哪条说法，以及什么情况会推翻判断，再进入交易前审查。</p><button onClick={onDecision}>开始建立判断 <ChevronRight /></button></section>}
          </div>}
          {panel === "价格与事件" && <section className="research-panel chart-panel"><SectionHeader title="价格、成交量与公司事件" meta="前复权 · 日线；事件不等同于价格原因" action={<Badge variant="outline">{statusLabel}</Badge>} /><PriceChart stock={stock} liveHistory={currentInformation?.history?.data} /><div className="event-explorer">{stockEvents.length > 0 ? stockEvents.map((event) => <article key={`${event.url}-${event.title}`}><time>{event.date}</time><Badge variant={event.type === "公司披露" || event.type === "公司公告" ? "secondary" : "outline"}>{event.type}</Badge><a href={event.url} target="_blank" rel="noreferrer"><strong>{event.title}</strong><ExternalLink /></a><p>{event.detail}</p><small>{event.source}</small></article>) : <div className="event-empty"><FileSearch /><strong>尚未取得可核实的公司事件</strong><span>系统不会把演示事件混入真实股票研究。</span></div>}</div></section>}
          {panel === "证据链" && <section className="research-panel evidence-panel"><div className="evidence-summary"><div><BarChart3 /><span><strong>{currentEvidence?.status === "loading" ? "正在核实来源" : `${sourceCount} 个独立来源`}</strong><small>{currentEvidence?.status === "loading" ? "行情已经独立载入，无需等待证据检索" : `正式披露 ${officialCount} · 共 ${evidenceCount} 条公开资料`}</small></span></div><div><strong>{officialCount} / {evidenceCount}</strong><span>正式披露</span></div><div className="attention"><strong>{currentEvidence?.status === "loading" ? "检索中" : assessmentStatus}</strong><span>{liveEvidence?.assessment?.mode === "openai" ? "AI 受限于当前证据" : "规则核实结果"}</span></div></div><SectionHeader title="证据如何影响判断" meta={liveEvidence?.assessment?.summary ?? (currentEvidence?.status === "loading" ? "正在检索公司公告与公开报道" : "先看来源，再看结论")} action={<Badge variant="outline">{currentEvidence?.status === "loading" ? "核实中" : liveEvidence?.feed?.data_mode === "live" ? "实时公开资料" : "资料降级"}</Badge>} />{currentEvidence?.status === "loading" ? <div className="evidence-loading-state"><FileSearch /><strong>公开资料正在并行核实</strong><span>你可以先查看行情，结果返回后会自动更新。</span></div> : <EvidenceList stockCode={stock.code} liveEvidence={liveEvidence} />}</section>}
          {panel === "待验证问题" && <section className="research-panel questions-section"><SectionHeader title="下一步要验证什么" meta="这些问题会带入决策审查" /><ol><li><span>01</span><p><strong>{profile.gap}何时能够得到确认？</strong><small>优先使用公司公告和下一期财报验证。</small></p><Badge variant="outline">财报发布后</Badge></li><li><span>02</span><p><strong>当前价格是否已经计入主要预期？</strong><small>当前估值位置为 {stock.valuation}。</small></p><Badge variant="outline">持续观察</Badge></li><li><span>03</span><p><strong>什么变化会推翻当前判断？</strong><small>{profile.invalidation}。</small></p><Badge variant="secondary">已设置</Badge></li></ol></section>}
        </article>
        <ResearchActionPanel stock={effectiveStock} action={action} setAction={setAction} onDecision={() => { setStock(effectiveStock); onDecision(); }} saved={saved} dataStatus={dataStatus} onSave={() => setSavedResearch((current) => ({ ...current, [stock.code]: !saved }))} />
      </main>
    </div>
  );
}

function pickReasonClause(text: string, keywords: string[]) {
  const clauses = text.split(/[，。；;！!？?\n]/).map((item) => item.trim()).filter(Boolean);
  return clauses.find((clause) => keywords.some((keyword) => clause.includes(keyword))) ?? "";
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
  const [description, setDescription] = useState("我大约拿24万元投资股票，单只股票最多6万元。单笔超过3万元时提醒我，亏损后希望隔一天再看。每笔交易都要写什么情况说明判断可能错了。");
  const [draft, setDraft] = useState(rules);
  const [parsed, setParsed] = useState(false);
  const applyTemplate = (template: UserRules) => { setDraft(template); setParsed(true); };
  const updateNumber = (key: keyof UserRules, value: number) => setDraft((current) => ({ ...current, [key]: Math.max(0, value) }));
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
              <label className="rule-toggle"><input type="checkbox" checked={draft.requireInvalidation} onChange={(event) => setDraft((current) => ({ ...current, requireInvalidation: event.target.checked }))} /><span><b>每笔计划填写判断失效条件</b><small>帮助以后判断依据是否已经变化</small></span></label>
            </div>
            <div className="rule-confirm-summary"><span>当前边界</span><strong>单股不超过 ¥{Math.min(draft.maxSingleStockValue, draft.investableCapital * draft.maxSingleStockRatio / 100).toLocaleString()}</strong><small>同时受金额上限和 {draft.maxSingleStockRatio}% 比例上限约束</small></div>
            <Button size="lg" disabled={!parsed} onClick={() => onSave(draft)}>确认并使用这些规则<Check data-icon="inline-end" /></Button>
          </section>
        </div>
      </section>
    </main>
  );
}

function DecisionView({ stock, action, rules, onEditRules, onDone, onBack }: { stock: Stock; action: TradeAction; rules: UserRules; onEditRules: () => void; onDone: (result: DecisionResult) => void; onBack: () => void }) {
  const profile = researchProfiles[stock.code] ?? genericResearchProfile;
  const currentHolding = holdingValues[stock.code] ?? 0;
  const currentRatio = currentHolding / rules.investableCapital * 100;
  const initialAmount = profile.suggestedAmount;
  const [amount, setAmount] = useState(initialAmount);
  const [reason, setReason] = useState(profile.suggestedReason);
  const [invalid, setInvalid] = useState("");
  const [horizon, setHorizon] = useState("1个月");
  const [durationSeconds, setDurationSeconds] = useState(1);
  const [evidenceCheck, setEvidenceCheck] = useState<LiveEvidencePayload>();
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState("");
  useEffect(() => {
    const timer = window.setInterval(() => setDurationSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const ratio = useMemo(() => Math.round(((currentHolding + amount) / rules.investableCapital) * 100), [amount, currentHolding, rules.investableCapital]);
  const scenarioLoss = Math.round((currentHolding + amount) * 0.2);
  const effectiveMaxHolding = Math.min(rules.maxSingleStockValue, rules.investableCapital * rules.maxSingleStockRatio / 100);
  const effectiveMaxRatio = effectiveMaxHolding / rules.investableCapital * 100;
  const isOverPosition = currentHolding + amount > effectiveMaxHolding;
  const over = Math.max(0, Math.ceil(ratio - effectiveMaxRatio));
  const maxAllowedAmount = Math.max(0, Math.floor((effectiveMaxHolding - currentHolding) / 1000) * 1000);
  const overSingleAlert = amount > rules.singleAmountAlert;
  const externalClaim = useMemo(() => pickReasonClause(reason, ["新闻", "朋友", "群", "听说", "小红书", "媒体", "网传", "消息", "政策"]), [reason]);
  const personalInference = useMemo(() => pickReasonClause(reason, ["觉得", "担心", "应该", "会涨", "反弹", "赚钱", "挣钱", "错过", "看好", "想先"]), [reason]);
  const evidenceStatus = evidenceCheck?.assessment?.status;
  const hasFormalMatch = evidenceStatus === "找到相关正式披露";
  const evidenceItems = evidenceCheck?.feed?.items?.length ?? 0;
  const officialEvidence = evidenceCheck?.radar?.official_count ?? 0;
  const evidenceIssue = externalClaim ? hasFormalMatch ? "外部说法找到相关正式披露，仍需阅读原文" : "理由包含待核实外部信息" : "";
  const reviewIssues = [isOverPosition ? "单股仓位超过个人边界" : "", overSingleAlert ? "单笔金额超过提醒值" : "", evidenceIssue, rules.requireInvalidation && !invalid ? "尚未填写判断失效条件" : ""].filter(Boolean);
  const issueCount = reviewIssues.length;
  const originalPositionOver = currentHolding + initialAmount > effectiveMaxHolding;
  const originalAlertOver = initialAmount > rules.singleAmountAlert;
  const originalIssues = [originalPositionOver ? "单股仓位超过个人边界" : "", originalAlertOver ? "单笔金额超过提醒值" : "", externalClaim ? "理由包含待核实外部信息" : "", rules.requireInvalidation ? "原计划未填写判断失效条件" : ""].filter(Boolean);
  const verifyReason = async () => {
    if (!reason.trim()) {
      setEvidenceError("请先写下需要核实的交易理由。");
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
  const completeReview = (result: DecisionResult["result"], finalAmount: number, message: string) => onDone({ stock, action, originalAmount: initialAmount, finalAmount, result, message, reason, invalidation: invalid, horizon, reviewedAt: new Date().toLocaleString("zh-CN", { month: "numeric", day: "2-digit", hour: "2-digit", minute: "2-digit" }), ruleSnapshot: rules, issues: originalIssues, remainingIssues: reviewIssues, scenarioLoss, originalScenarioLoss: Math.round((currentHolding + initialAmount) * .2), durationSeconds, evidence: evidenceCheck });
  return (
    <main className="decision-layout view-enter" id="main-content">
      <article className="workspace decision-canvas">
        <header className="decision-canvas-header">
          <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft data-icon="inline-start" />返回研究</Button>
          <div><Badge variant="outline">{stock.code}.{stock.market}</Badge><span>{stock.name}</span><ChevronRight /><span>{action}审查</span></div>
          <span className="saved-indicator"><Check />本次会话草稿</span>
        </header>
        <section className="decision-focus">
          <div className="decision-focus-heading"><div><Badge variant="outline">审查结果预览</Badge><h1>当前计划有 {issueCount} 项需要先确认</h1><p>{reviewIssues.length ? `当前需确认：${reviewIssues.join("；")}。` : "当前没有触发已设置的提醒边界。"}系统不预测股票涨跌。</p></div><Badge variant="outline"><Clock3 data-icon="inline-start" />约 1 分钟</Badge></div>
          <div className="decision-risk-grid">
            <article className="exposure-visual"><div className="visual-title"><span>单股仓位</span><strong>{ratio}%</strong><Badge variant="outline">{isOverPosition ? `超过上限 ${over}%` : "符合当前上限"}</Badge></div><div className="exposure-track"><i className="exposure-current" style={{ width: `${currentRatio}%` }} /><i className="exposure-added" style={{ left: `${currentRatio}%`, width: `${Math.max(0, ratio - currentRatio)}%` }} /><i className="exposure-limit" style={{ left: `${effectiveMaxRatio}%` }} /></div><div className="track-labels"><span>当前 {currentRatio.toFixed(1)}%</span><b>上限 {effectiveMaxRatio.toFixed(1)}%</b><span>计划后 {ratio}%</span></div></article>
            <article className="scenario-visual"><div className="visual-title"><span>下跌情景金额影响</span><strong>−¥{scenarioLoss.toLocaleString()}</strong><small>价格下跌 20%</small></div><div className="scenario-bars"><div><span>−10%</span><i><b style={{ width: "33%" }} /></i><em>−¥{Math.round((currentHolding + amount) * .1).toLocaleString()}</em></div><div className="active"><span>−20%</span><i><b style={{ width: "66%" }} /></i><em>−¥{scenarioLoss.toLocaleString()}</em></div><div><span>−30%</span><i><b style={{ width: "100%" }} /></i><em>−¥{Math.round((currentHolding + amount) * .3).toLocaleString()}</em></div></div></article>
            <article className="evidence-readiness"><div className="visual-title"><span>正式披露覆盖</span><strong>{officialEvidence} / {evidenceItems}</strong><small>{evidenceCheck ? "正式披露 / 全部资料" : "等待核实"}</small></div><div className="evidence-dots"><i className={officialEvidence > 0 ? "verified" : ""}>{officialEvidence > 0 ? <Check /> : <FileSearch />}</i><i><TriangleAlert /></i><i><Sparkles /></i></div><dl><div><dt>正式披露</dt><dd>{evidenceCheck ? officialEvidence : "—"}</dd></div><div><dt>公开资料</dt><dd>{evidenceCheck ? evidenceItems : "—"}</dd></div><div><dt>核实结论</dt><dd>{evidenceStatus ?? "尚未检索"}</dd></div></dl></article>
          </div>
        </section>
        {isOverPosition && <Alert className="decision-alert"><TriangleAlert /><AlertTitle>当前计划超过你设定的单股边界</AlertTitle><AlertDescription>计划金额 ¥{amount.toLocaleString()} 会使单股占比达到 {ratio}%。将金额降至约 ¥{maxAllowedAmount.toLocaleString()}，可同时满足 ¥{rules.maxSingleStockValue.toLocaleString()} 和 {rules.maxSingleStockRatio}% 两项上限。</AlertDescription></Alert>}
        {overSingleAlert && <Alert className="decision-alert amount-alert"><Gauge /><AlertTitle>本次金额达到你的单笔提醒线</AlertTitle><AlertDescription>计划金额 ¥{amount.toLocaleString()} 高于提醒值 ¥{rules.singleAmountAlert.toLocaleString()}。这不是禁止操作，只是提醒再次核对理由和下跌情景。</AlertDescription></Alert>}
        <section className="decision-work-grid">
          <div className="plan-form">
            <SectionHeader title="你的计划" meta="修改后风险数字会立即更新" />
            <label><span>股票与操作</span><div className="read-only-field"><b>{stock.name}</b><Badge variant="secondary">{action}</Badge></div></label>
            <label><span>计划金额</span><div className="money-input"><span>¥</span><Input type="number" min="0" step="1000" value={amount} onChange={(event) => setAmount(Number(event.target.value))} /></div><small>你的单笔提醒金额：¥{rules.singleAmountAlert.toLocaleString()}</small></label>
            <label><span>为什么现在想操作？</span><Textarea value={reason} onChange={(event) => { setReason(event.target.value); setEvidenceCheck(undefined); setEvidenceError(""); }} rows={4} /><small>写出新闻、朋友说法或社交平台观点，系统会按你当前的原话检索公开资料。</small></label>
            <div className="reason-verification-action"><Button variant="outline" onClick={verifyReason} disabled={evidenceLoading || !reason.trim()}><FileSearch data-icon="inline-start" />{evidenceLoading ? "正在检索公开资料…" : "核实这条说法"}</Button><span>{evidenceCheck ? `${evidenceItems} 条资料 · ${officialEvidence} 条正式披露` : "不会把搜索结果自动当作事实"}</span></div>
            {evidenceError && <Alert className="evidence-check-result error"><TriangleAlert /><AlertTitle>暂时无法完成核实</AlertTitle><AlertDescription>{evidenceError}</AlertDescription></Alert>}
            {evidenceCheck?.assessment && <Alert className={`evidence-check-result ${hasFormalMatch ? "matched" : "unconfirmed"}`}><FileSearch /><AlertTitle>{evidenceCheck.assessment.status}</AlertTitle><AlertDescription>{evidenceCheck.assessment.summary}<span>{evidenceCheck.assessment.mode === "openai" ? "AI 结论，仅限当前检索范围" : "规则核实结果，未使用付费 AI"}</span></AlertDescription></Alert>}
            <label><span>什么情况说明判断可能错了？</span><Textarea value={invalid} onChange={(event) => setInvalid(event.target.value)} placeholder="例如：下一期收入没有改善，且公司公告未出现订单增长" rows={3} /><small className={invalid ? "complete" : rules.requireInvalidation ? "needed" : ""}>{invalid ? "已填写失效条件" : rules.requireInvalidation ? "你的个人规则要求填写这一项" : "当前规则允许稍后补充"}</small></label>
            <div className="followup-settings"><div><span>预计观察期限</span><div className="horizon-options">{["1周", "1个月", "3个月"].map((item) => <button key={item} className={horizon === item ? "active" : ""} onClick={() => setHorizon(item)}>{item}</button>)}</div></div><div><span>下次复核</span><strong>正式半年报发布后</strong><small>到时会回到这条判断，而不是只看盈亏。</small></div></div>
          </div>
          <div className="reason-map" aria-live="polite">
            <SectionHeader title="理由拆解" meta="随你的输入更新；不把原话自动当作事实" />
            <article><Badge variant="secondary"><CheckCircle2 data-icon="inline-start" />相关公开背景</Badge><p>“{evidenceCheck?.assessment?.summary ?? "尚未按你的原话完成公开资料核实"}”</p><small>{evidenceCheck ? "来自本次公开资料检索；结论只覆盖当前返回的来源与时间范围。" : "点击核实后才会显示公开资料结果；这里不会预填样例事实。"}</small></article>
            <article><Badge variant="outline"><TriangleAlert data-icon="inline-start" />待核实外部信息</Badge><p>“{externalClaim || "当前表达没有说明可核实的信息来源"}”</p><small>{externalClaim ? "需要回到公告、财报或可追溯来源确认。" : "可以补充在哪里看到、谁发布以及对应日期。"}</small></article>
            <article><Badge variant="outline"><Sparkles data-icon="inline-start" />个人推断或动机</Badge><p>“{personalInference || "当前表达没有明确说明预期或紧迫感"}”</p><small>{personalInference ? "这是需要设定时间范围和失效条件的个人判断。" : "可以补充为什么必须现在操作，以及什么情况会改变判断。"}</small></article>
          </div>
        </section>
        <footer className="decision-action-bar">
          <div><strong>修改后预览</strong><span>金额 ¥{amount.toLocaleString()} · 单股占比 {ratio}% · 观察 {horizon} · {isOverPosition ? `仍超上限 ${over}%` : "符合当前上限"}</span></div>
          <div><Button variant="ghost" size="lg" onClick={() => completeReview("已延迟", amount, "已保存，稍后再看")}>稍后再看</Button><Button variant="outline" size="lg" onClick={() => completeReview("维持计划", initialAmount, "已记录：维持原计划")}>维持原计划</Button><Button size="lg" onClick={() => completeReview("已修改", amount, `已记录修改：¥${amount.toLocaleString()}`)} disabled={rules.requireInvalidation && !invalid}>确认修改<ArrowRight data-icon="inline-end" /></Button></div>
        </footer>
      </article>
      <aside className="decision-context">
        <section><SectionHeader title="个人提醒边界" action={<Button variant="ghost" size="sm" onClick={onEditRules}>调整规则</Button>} /><dl><div><dt>单股金额 / 比例上限</dt><dd>¥{rules.maxSingleStockValue.toLocaleString()} / {rules.maxSingleStockRatio}%</dd></div><div><dt>单笔提醒金额</dt><dd>¥{rules.singleAmountAlert.toLocaleString()}</dd></div><div><dt>亏损后冷静期</dt><dd>{rules.coolingHours} 小时</dd></div><div><dt>失效条件</dt><dd>{rules.requireInvalidation ? "需要填写" : "可选"}</dd></div></dl></section>
        <section><SectionHeader title="证据时间线" meta={evidenceCheck ? "本次实时公开资料" : "等待核实当前理由"} /><EvidenceList stockCode={stock.code} compact liveEvidence={evidenceCheck} /></section>
        <section className="position-note"><BriefcaseBusiness /><div><strong>当前持仓</strong><span>{currentHolding > 0 ? `${stock.name} · ¥${currentHolding.toLocaleString()}` : `${stock.name} · 尚无持仓`}</span><small>{currentHolding > 0 ? `占记录资产 ${currentRatio.toFixed(1)}%` : "本次计划将新建仓位"}</small></div></section>
      </aside>
    </main>
  );
}

function HistoryView({ records }: { records: DecisionResult[] }) {
  const latest = records[0];
  const savedRows = records.map((record) => ({ time: record.reviewedAt ?? "最近", stock: record.stock.name, action: record.action, before: `¥${record.originalAmount.toLocaleString()}`, after: record.result === "已延迟" ? "稍后再看" : `¥${record.finalAmount.toLocaleString()}`, result: record.result, issue: record.issues?.join("；") || "已完成审查" }));
  const rows = [...savedRows, ...reviewRows];
  const totalReviews = 8 + records.length;
  const changedReviews = 5 + records.filter((record) => record.result !== "维持计划").length;
  const changedRate = Math.round(changedReviews / totalReviews * 100);
  const timedRecords = records.filter((record) => typeof record.durationSeconds === "number");
  const averageDuration = timedRecords.length > 0 ? Math.round(timedRecords.reduce((sum, record) => sum + (record.durationSeconds ?? 0), 0) / timedRecords.length) : 0;
  const durationLabel = averageDuration > 0 ? `${Math.floor(averageDuration / 60)}′${String(averageDuration % 60).padStart(2, "0")}″` : "—";
  const exportCsv = () => {
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const savedLines = records.map((record) => [record.reviewedAt ?? "最近", record.stock.name, record.action, record.originalAmount, record.result === "已延迟" ? "稍后再看" : record.finalAmount, record.issues?.join("；") ?? "", record.remainingIssues?.join("；") ?? "", record.result, record.reason ?? "", record.invalidation ?? "", record.horizon ?? "", record.originalScenarioLoss ?? "", record.scenarioLoss ?? "", record.durationSeconds ?? "", record.ruleSnapshot?.investableCapital ?? "", record.ruleSnapshot?.maxSingleStockValue ?? "", record.ruleSnapshot?.maxSingleStockRatio ?? "", record.ruleSnapshot?.singleAmountAlert ?? "", record.evidence?.assessment?.status ?? "未核实", record.evidence?.assessment?.summary ?? "", record.evidence?.radar?.official_count ?? "", record.evidence?.feed?.items?.length ?? "", record.evidence?.feed?.items?.map((item) => item.url).filter(Boolean).join("；") ?? ""]);
    const legacyLines = reviewRows.map((row) => [row.time, row.stock, row.action, row.before, row.after, row.issue, "", row.result, "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]);
    const lines = [["时间", "股票", "操作", "原计划", "最终选择", "原计划发现的问题", "完成后仍需注意", "结果", "原始理由", "判断失效条件", "观察期限", "原计划下跌20%情景", "最终计划下跌20%情景", "完成耗时秒", "记录资金", "单股金额上限", "单股比例上限", "单笔提醒金额", "证据核实结论", "证据核实摘要", "正式披露数", "公开资料数", "证据来源链接"], ...savedLines, ...legacyLines];
    const csv = `\uFEFF${lines.map((line) => line.map((value) => escape(String(value))).join(",")).join("\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "安心看股-决策记录.csv";
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <main className="workspace history-workspace view-enter" id="main-content">
      <section className="history-overview"><div><span>过去 30 天</span><strong>{totalReviews}</strong><small>完成决策审查</small></div><div><span>修改或延迟</span><strong>{changedReviews}</strong><small>占全部审查 {changedRate}%</small></div><div><span>平均审查耗时</span><strong>{durationLabel}</strong><small>{timedRecords.length > 0 ? `基于 ${timedRecords.length} 条完整记录` : "完成下一次审查后开始统计"}</small></div><div><span>最常见缺失</span><strong>失效条件</strong><small>出现在 5 次计划中</small></div></section>
      {latest && <section className="history-latest-context"><div className="latest-context-heading"><div><span>最近一次完整记录</span><h2>{latest.stock.name} · {latest.action}</h2></div><Badge variant="outline">{latest.result}</Badge></div><div className="latest-context-grid"><div><span>当时的理由</span><p>{latest.reason || "未记录"}</p></div><div><span>判断失效条件</span><p>{latest.invalidation || "尚未填写"}</p></div><div><span>原计划发现的问题</span><p>{latest.issues?.join("；") || "未发现已记录的问题"}</p><small>完成后仍需注意：{latest.remainingIssues?.join("；") || "无"}</small></div></div><div className="history-evidence-snapshot"><div><span>当时的证据核实</span><strong>{latest.evidence?.assessment?.status ?? "未在记录中保存证据"}</strong><small>{latest.evidence?.assessment?.summary ?? "旧记录可能没有证据快照；新完成的审查会保留当时的核实结论和来源。"}</small></div><div className="history-evidence-links">{latest.evidence?.feed?.items?.slice(0, 3).map((item) => <a key={`${item.url}-${item.title}`} href={item.url} target="_blank" rel="noreferrer"><Badge variant="outline">{item.category}</Badge><span>{item.title}</span><ExternalLink /></a>)}</div></div><div className="latest-rule-snapshot"><span>当时使用的规则</span><strong>{latest.ruleSnapshot ? `记录资金 ¥${latest.ruleSnapshot.investableCapital.toLocaleString()} · 单股上限 ¥${latest.ruleSnapshot.maxSingleStockValue.toLocaleString()} / ${latest.ruleSnapshot.maxSingleStockRatio}% · 单笔提醒 ¥${latest.ruleSnapshot.singleAmountAlert.toLocaleString()}` : "旧记录未保存规则快照"}</strong><small>{latest.horizon ? `观察期限 ${latest.horizon}` : ""}{latest.originalScenarioLoss ? ` · 原计划下跌 20% −¥${latest.originalScenarioLoss.toLocaleString()}` : ""}{latest.scenarioLoss ? ` · 最终计划 −¥${latest.scenarioLoss.toLocaleString()}` : ""}{latest.durationSeconds ? ` · 用时 ${latest.durationSeconds} 秒` : ""}</small></div></section>}
      <section className="history-body"><div className="history-table"><SectionHeader title="决策记录" meta="最新记录保存在本设备，可导出备份" action={<div className="table-actions"><Badge variant="outline">过去 30 天</Badge><Button variant="outline" size="sm" onClick={exportCsv}>导出 CSV</Button></div>} /><Table><TableHeader><TableRow><TableHead>时间</TableHead><TableHead>股票 / 操作</TableHead><TableHead className="numeric">原计划</TableHead><TableHead className="numeric">最终选择</TableHead><TableHead>发现的问题</TableHead><TableHead>结果</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.time + row.stock}><TableCell className="muted-cell">{row.time}</TableCell><TableCell><strong>{row.stock}</strong><small className="cell-subtext">{row.action}</small></TableCell><TableCell className="numeric">{row.before}</TableCell><TableCell className="numeric">{row.after}</TableCell><TableCell>{row.issue}</TableCell><TableCell><Badge variant="outline">{row.result}</Badge></TableCell></TableRow>)}</TableBody></Table></div><aside className="pattern-summary"><SectionHeader title="近期模式" meta="仅描述记录，不作心理判断" /><div className="pattern-item"><span><b>连续下跌后补仓</b><em>3 / 4 次修改金额</em></span><i><b style={{ width: "75%" }} /></i></div><div className="pattern-item"><span><b>来自朋友或社交平台</b><em>3 次出现</em></span><i><b style={{ width: "58%" }} /></i></div><div className="pattern-item"><span><b>未写失效条件</b><em>5 次出现</em></span><i><b style={{ width: "68%" }} /></i></div><p>下次遇到相似计划时，系统会优先展示这些历史记录。</p></aside></section>
    </main>
  );
}

export default function Home() {
  const [view, setView] = useState<View>("desk");
  const [stock, setStock] = useState(stocks[0]);
  const [action, setAction] = useState<TradeAction>("补仓");
  const [notice, setNotice] = useState("");
  const [latestDecision, setLatestDecision] = useState<DecisionResult>();
  const [decisionRecords, setDecisionRecords] = useState<DecisionResult[]>([]);
  const [rules, setRules] = useState<UserRules>(DEFAULT_RULES);
  useEffect(() => {
    const loadSavedState = () => {
      try {
        const saved = window.localStorage.getItem(LOCAL_DECISION_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as DecisionResult;
          if (parsed?.stock?.code && parsed?.result) {
            setLatestDecision(parsed);
          }
        }
        const savedRecords = window.localStorage.getItem(LOCAL_DECISIONS_KEY);
        if (savedRecords) {
          const parsedRecords = JSON.parse(savedRecords) as DecisionResult[];
          const completeRecords = Array.isArray(parsedRecords) ? parsedRecords.filter((record) => Boolean(record.reviewedAt)) : [];
          if (completeRecords.length > 0) {
            setDecisionRecords(completeRecords);
            setLatestDecision(completeRecords[0]);
          }
        }
        const savedRules = window.localStorage.getItem(LOCAL_RULES_KEY);
        if (savedRules) {
          const parsedRules = JSON.parse(savedRules) as UserRules;
          if (parsedRules?.investableCapital > 0 && parsedRules?.maxSingleStockRatio > 0) setRules(parsedRules);
        }
      } catch {
        window.localStorage.removeItem(LOCAL_DECISION_KEY);
        window.localStorage.removeItem(LOCAL_DECISIONS_KEY);
        window.localStorage.removeItem(LOCAL_RULES_KEY);
      }
    };
    const frame = window.requestAnimationFrame(loadSavedState);
    window.addEventListener("storage", loadSavedState);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener("storage", loadSavedState); };
  }, []);
  const goDecision = () => setView("decision");
  const showNotice = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(""), 3200); };
  const selectResearchStock = (target: Stock) => { setStock(target); setAction((holdingValues[target.code] ?? 0) > 0 ? "补仓" : "买入"); };
  const openResearch = (target?: Stock) => { if (target) selectResearchStock(target); setView("research"); };
  const startNewDecision = () => { setStock(stocks[0]); setAction("补仓"); setView("newDecision"); };
  const finishDecision = (result: DecisionResult) => { setLatestDecision(result); window.localStorage.setItem(LOCAL_DECISION_KEY, JSON.stringify(result)); setDecisionRecords((current) => { const next = [result, ...current].slice(0, 20); window.localStorage.setItem(LOCAL_DECISIONS_KEY, JSON.stringify(next)); return next; }); showNotice(result.message); setView("desk"); };
  const saveRules = (nextRules: UserRules) => { setRules(nextRules); window.localStorage.setItem(LOCAL_RULES_KEY, JSON.stringify(nextRules)); showNotice("个人提醒规则已更新"); setView("desk"); };
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <AppRail view={view} onView={setView} hasPending={!latestDecision} />
      <div className="app-body">
        <AppHeader view={view} onNewDecision={startNewDecision} onSelectStock={openResearch} onNotice={showNotice} />
        {notice && <div className="toast-notice" role="status"><CheckCircle2 />{notice}<button onClick={() => setNotice("")} aria-label="关闭提示"><X /></button></div>}
        {view === "desk" && <DeskView onDecision={goDecision} onResearch={openResearch} onHistory={() => setView("history")} latest={latestDecision} />}
        {view === "research" && <ResearchView stock={stock} setStock={selectResearchStock} action={action} setAction={setAction} onDecision={goDecision} />}
        {view === "newDecision" && <StartDecisionView stock={stock} onSelect={selectResearchStock} action={action} setAction={setAction} onResearch={() => setView("research")} onContinue={goDecision} />}
        {view === "decision" && <DecisionView stock={stock} action={action} rules={rules} onEditRules={() => setView("rules")} onDone={finishDecision} onBack={() => setView("research")} />}
        {view === "history" && <HistoryView records={decisionRecords} />}
        {view === "rules" && <RulesView rules={rules} onSave={saveRules} onBack={() => setView("desk")} />}
      </div>
    </div>
  );
}
