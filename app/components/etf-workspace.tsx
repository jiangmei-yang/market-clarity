"use client";

import { FormEvent, useMemo, useState } from "react";
import { AlertCircle, ArrowRight, CalendarClock, Database, FileSearch, Layers3, Plus, Search, X } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { pick, useI18n } from "@/app/i18n";

type DataStatus = { mode?: string; is_demo?: boolean; notice?: string; message?: string; as_of?: string | null };
type ETFSearchItem = { code: string; name: string; latest_price?: number | null; scale_text?: string };
type SelectedETF = ETFSearchItem & { amount: number };
type ETFDetail = SelectedETF & { allocation_pct: number; tracking_index?: string; holdings_report_date?: string | null; top_holdings?: Array<{ stock_code?: string; stock_name: string; weight?: number | null }>; data_status?: DataStatus };
type Diagnosis = {
  etf_list: ETFDetail[];
  total_etfs: number;
  covered_stocks: number;
  exposure_breakdown: Array<{ name: string; portfolio_weight_pct: number; basis: string }>;
  overlap_risk: string;
  overlap_score_pct: number;
  overlap_stocks: Array<{ stock_code?: string; stock_name: string; etfs: Array<{ etf_code: string; etf_name: string; weight?: number | null }> }>;
  risk_tags: string[];
  suggestion: string;
  data_status: DataStatus;
};

const modeLabel = (status: DataStatus | undefined, isEnglish: boolean) => status?.mode === "live" ? pick(isEnglish, "公开数据可用", "Public data available") : status?.mode === "cache" ? pick(isEnglish, "使用最近缓存", "Using recent cache") : status?.mode === "mixed" ? pick(isEnglish, "部分数据可用", "Partial data available") : status?.mode === "demo" ? pick(isEnglish, "演示数据", "Sample data") : pick(isEnglish, "等待数据", "Waiting for data");
const PAGE_LOADED_AT = Date.now();

export function ETFWorkspace() {
  const { isEnglish, locale } = useI18n();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ETFSearchItem[]>([]);
  const [selected, setSelected] = useState<SelectedETF[]>([]);
  const [status, setStatus] = useState<DataStatus>();
  const [diagnosis, setDiagnosis] = useState<Diagnosis>();
  const [busy, setBusy] = useState<"search" | "diagnosis" | null>(null);
  const [error, setError] = useState("");

  const selectedCodes = useMemo(() => new Set(selected.map((item) => item.code)), [selected]);
  const hasUnverifiedHoldings = Boolean(diagnosis?.etf_list.some((item) => !item.holdings_report_date || item.data_status?.is_demo || item.tracking_index?.includes("演示")));
  const reportDates = useMemo(() => diagnosis?.etf_list.map((item) => item.holdings_report_date).filter((value): value is string => Boolean(value)) ?? [], [diagnosis]);
  const oldestDisclosureAge = useMemo(() => reportDates.length ? Math.max(...reportDates.map((value) => Math.max(0, Math.floor((PAGE_LOADED_AT - new Date(`${value}T00:00:00`).getTime()) / 86400000)))) : null, [reportDates]);
  const formatDate = (value: string) => {
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
  };
  const disclosureLabel = reportDates.length ? [...new Set(reportDates)].sort().map(formatDate).join(" / ") : pick(isEnglish, "未取得披露日期", "Disclosure date unavailable");
  const staleDisclosure = oldestDisclosureAge !== null && oldestDisclosureAge > 120;
  const overlapHeadline = diagnosis ? diagnosis.overlap_stocks.length ? pick(isEnglish, `${diagnosis.overlap_stocks.length} 只底层股票重复出现`, `${diagnosis.overlap_stocks.length} underlying stocks overlap`) : pick(isEnglish, "前十大披露持仓未发现重复股票", "No overlap found in disclosed top holdings") : "";
  const maxHoldingWeight = useMemo(() => Math.max(1, ...(diagnosis?.etf_list.flatMap((item) => item.top_holdings ?? []).map((item) => item.weight ?? 0) ?? [])), [diagnosis]);

  const search = async (event: FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    setBusy("search"); setError(""); setDiagnosis(undefined);
    try {
      const response = await fetch(`/api/etf/search?keyword=${encodeURIComponent(query.trim())}&limit=8`, { cache: "no-store" });
      const payload = await response.json() as { items?: ETFSearchItem[]; data_status?: DataStatus; detail?: string; message?: string };
      if (!response.ok) throw new Error(isEnglish ? "ETF search is temporarily unavailable." : payload.detail || payload.message || "ETF 搜索暂不可用");
      setResults(payload.items ?? []); setStatus(payload.data_status);
      if (!(payload.items ?? []).length) setError(pick(isEnglish, "没有找到匹配的 ETF，请检查代码或缩短关键词。", "No matching ETF was found. Check the code or shorten the search term."));
    } catch (cause) { setResults([]); setError(cause instanceof Error ? cause.message : pick(isEnglish, "ETF 搜索暂不可用", "ETF search is temporarily unavailable.")); }
    finally { setBusy(null); }
  };

  const addETF = (item: ETFSearchItem) => {
    if (selectedCodes.has(item.code) || selected.length >= 10) return;
    setSelected((current) => [...current, { ...item, amount: 0 }]);
    setResults((current) => current.filter((result) => result.code !== item.code));
    setDiagnosis(undefined); setError("");
  };

  const runDiagnosis = async () => {
    if (!selected.length) return;
    setBusy("diagnosis"); setError("");
    try {
      const response = await fetch("/api/etf/diagnosis", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ etfs: selected.map(({ code, amount }) => ({ code, amount })) }) });
      const payload = await response.json() as Diagnosis & { detail?: string; message?: string };
      if (!response.ok) throw new Error(isEnglish ? "ETF diagnosis is temporarily unavailable." : payload.detail || payload.message || "ETF 诊断暂不可用");
      setDiagnosis(payload); setStatus(payload.data_status);
    } catch (cause) { setDiagnosis(undefined); setError(cause instanceof Error ? cause.message : pick(isEnglish, "ETF 诊断暂不可用", "ETF diagnosis is temporarily unavailable.")); }
    finally { setBusy(null); }
  };

  return (
    <div className="etf-native-layout">
      <section className="tool-input-pane" aria-label={pick(isEnglish, "ETF 组合输入", "ETF portfolio input")}>
        <div className="native-section-heading"><div><h2>{pick(isEnglish, "添加 ETF", "Add ETFs")}</h2><p>{pick(isEnglish, "代码或名称均可；金额用于估算组合暴露。", "Search by code or name. Amounts are used to estimate portfolio exposure.")}</p></div><span className="native-heading-badges">{status && <Badge variant="outline">{modeLabel(status, isEnglish)}</Badge>}<Badge variant="outline">{selected.length}/10</Badge></span></div>
        <form className="native-search-form" onSubmit={search}>
          <Search aria-hidden="true" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={pick(isEnglish, "例如 510300 或 半导体", "e.g. 510300 or semiconductor")} aria-label={pick(isEnglish, "ETF 代码或名称", "ETF code or name")} />
          <Button type="submit" disabled={busy !== null || !query.trim()}>{busy === "search" ? pick(isEnglish, "查询中", "Searching") : pick(isEnglish, "查找", "Search")}</Button>
        </form>
        {results.length > 0 && <div className="etf-search-results" aria-label={pick(isEnglish, "ETF 搜索结果", "ETF search results")}>{results.map((item) => <button key={item.code} onClick={() => addETF(item)}><span><strong>{item.name}</strong><small>{item.code}{item.scale_text ? ` · ${item.scale_text}` : ""}</small></span><Plus /></button>)}</div>}
        {error && <Alert className="native-error"><AlertCircle /><AlertTitle>{pick(isEnglish, "当前无法完成", "Unable to complete")}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        <Separator />
        <div className="native-section-heading compact"><div><h2>{pick(isEnglish, "待诊断持仓", "ETFs to diagnose")}</h2><p>{pick(isEnglish, "不填金额时按等权计算。", "Leave amounts blank to use equal weights.")}</p></div>{selected.length > 0 && <Button variant="ghost" size="sm" onClick={() => { setSelected([]); setDiagnosis(undefined); }}>{pick(isEnglish, "清空", "Clear")}</Button>}</div>
        <div className="selected-etf-list">
          {selected.length === 0 ? <div className="native-empty compact"><Layers3 /><strong>{pick(isEnglish, "还没有添加 ETF", "No ETFs added")}</strong><span>{pick(isEnglish, "至少添加一只；两只以上才能识别重复底层持仓。", "Add at least one. Two or more are needed to detect overlapping holdings.")}</span></div> : selected.map((item) => <article key={item.code}><div><strong>{item.name}</strong><small>{item.code}</small></div><label><span>{pick(isEnglish, "持有金额", "Amount held")}</span><Input type="number" min="0" step="100" value={item.amount || ""} placeholder={pick(isEnglish, "等权", "Equal weight")} onChange={(event) => setSelected((current) => current.map((entry) => entry.code === item.code ? { ...entry, amount: Number(event.target.value) || 0 } : entry))} aria-label={pick(isEnglish, `${item.name}持有金额`, `Amount held in ${item.name}`)} /></label><Button variant="ghost" size="icon-sm" aria-label={pick(isEnglish, `移除${item.name}`, `Remove ${item.name}`)} onClick={() => { setSelected((current) => current.filter((entry) => entry.code !== item.code)); setDiagnosis(undefined); }}><X /></Button></article>)}
        </div>
        <Button className="native-primary-wide" size="lg" disabled={!selected.length || busy !== null} onClick={runDiagnosis}>{busy === "diagnosis" ? pick(isEnglish, "正在读取披露持仓…", "Loading disclosed holdings…") : pick(isEnglish, "检查底层暴露", "Check underlying exposure")}<ArrowRight data-icon="inline-end" /></Button>
      </section>

      <section className="tool-report-pane" aria-live="polite">
        {!diagnosis ? <div className="native-empty report"><FileSearch /><strong>{pick(isEnglish, "底层暴露会显示在这里", "Underlying exposure will appear here")}</strong><span>{pick(isEnglish, "先添加两只你实际关注的 ETF；结果会显示披露日期、前五大持仓和重复股票。", "Add two ETFs you actually follow to compare disclosure dates, top holdings, and overlaps.")}</span></div> : <>
          <header className="native-report-header etf-result-header"><div><Badge variant={hasUnverifiedHoldings || staleDisclosure ? "outline" : "secondary"}>{pick(isEnglish, `持仓披露截至 ${disclosureLabel}`, `Holdings disclosed as of ${disclosureLabel}`)}</Badge><h2>{overlapHeadline}</h2><p>{pick(isEnglish, "只比较本次取得的定期披露前十大持仓，不代表基金当前完整组合。", "This compares only the top ten holdings returned from periodic disclosures, not each fund’s complete current portfolio.")}{!isEnglish && diagnosis.data_status.notice}</p></div><dl><div><dt>{pick(isEnglish, "比较 ETF", "ETFs compared")}</dt><dd>{diagnosis.total_etfs}</dd></div><div><dt>{pick(isEnglish, "取得持仓条目", "Holdings retrieved")}</dt><dd>{diagnosis.covered_stocks}</dd></div><div><dt>{pick(isEnglish, "重复股票", "Overlapping stocks")}</dt><dd>{diagnosis.overlap_stocks.length}</dd></div></dl></header>
          <div className="etf-scope-strip"><span><CalendarClock />{oldestDisclosureAge === null ? pick(isEnglish, "披露日期未取得", "Disclosure date unavailable") : pick(isEnglish, `最旧披露距今 ${oldestDisclosureAge} 天`, `Oldest disclosure is ${oldestDisclosureAge} days old`)}</span><strong>{isEnglish ? overlapHeadline : diagnosis.suggestion}</strong><small>{pick(isEnglish, "结论范围：本次返回的定期披露持仓", "Scope: periodic holdings returned in this request")}</small></div>
          {hasUnverifiedHoldings && <Alert className="native-source-warning"><AlertCircle /><AlertTitle>{pick(isEnglish, "当前不能把重合结果当作最新真实持仓", "Do not treat this overlap as current verified holdings")}</AlertTitle><AlertDescription>{pick(isEnglish, "至少一只 ETF 没有取得可核实的持仓披露日期，或使用了明确标注的降级数据。下面的结构只用于检查页面流程，不应据此调整真实组合。", "At least one ETF lacks a verifiable disclosure date or uses explicitly degraded data. This output is suitable for testing the workflow, not for changing a real portfolio.")}</AlertDescription></Alert>}
          {!hasUnverifiedHoldings && staleDisclosure && <Alert className="native-source-warning"><CalendarClock /><AlertTitle>{pick(isEnglish, "持仓披露距离当前时间较久", "Holdings disclosures are old")}</AlertTitle><AlertDescription>{pick(isEnglish, `最旧一份持仓披露距今 ${oldestDisclosureAge} 天。它可以用于理解已披露结构，但不能代表基金今天仍维持相同股票和权重。`, `The oldest disclosure is ${oldestDisclosureAge} days old. It can explain the disclosed structure but does not show today’s exact stocks or weights.`)}</AlertDescription></Alert>}
          <div className="etf-report-grid">
            <section><div className="native-section-heading"><div><h3>{pick(isEnglish, "名称主题分布", "Name-based theme mix")}</h3><p>{pick(isEnglish, "按投入金额或等权汇总；这部分是名称推断，不是底层行业分类。", "Aggregated by amount or equal weight. Themes are inferred from names, not classified from underlying industries.")}</p></div></div><div className="exposure-bars">{diagnosis.exposure_breakdown.length ? diagnosis.exposure_breakdown.slice(0, 8).map((item) => <div key={item.name}><span><strong>{item.name}</strong><b>{item.portfolio_weight_pct.toFixed(1)}%</b></span><i><em style={{ width: `${Math.min(100, item.portfolio_weight_pct)}%` }} /></i><small>{item.basis}</small></div>) : <p>{pick(isEnglish, "当前持仓资料不足，无法形成主题暴露。", "There is not enough holdings data to calculate theme exposure.")}</p>}</div></section>
            <section><div className="native-section-heading"><div><h3>{pick(isEnglish, "重复底层持仓", "Overlapping underlying holdings")}</h3><p>{pick(isEnglish, "只覆盖本次取得的定期披露持仓。", "Covers only the periodic holdings returned in this request.")}</p></div></div>{diagnosis.overlap_stocks.length ? <Table><TableHeader><TableRow><TableHead>{pick(isEnglish, "股票", "Stock")}</TableHead><TableHead>{pick(isEnglish, "出现于", "Appears in")}</TableHead><TableHead className="numeric">{pick(isEnglish, "披露权重", "Disclosed weights")}</TableHead></TableRow></TableHeader><TableBody>{diagnosis.overlap_stocks.slice(0, 10).map((item) => <TableRow key={item.stock_code || item.stock_name}><TableCell><strong>{item.stock_name}</strong><small>{item.stock_code}</small></TableCell><TableCell>{item.etfs.map((etf) => etf.etf_name).join(isEnglish ? ", " : "、")}</TableCell><TableCell className="numeric">{item.etfs.map((etf) => etf.weight == null ? "—" : `${etf.weight.toFixed(2)}%`).join(" / ")}</TableCell></TableRow>)}</TableBody></Table> : <div className="native-empty compact"><Database /><strong>{pick(isEnglish, "未在已取得持仓中发现重合", "No overlap found in retrieved holdings")}</strong><span>{pick(isEnglish, "这不代表完整持仓不存在重合；请结合披露覆盖和日期理解。", "This does not prove that complete holdings do not overlap. Interpret it with the disclosure coverage and dates.")}</span></div>}</section>
          </div>
          <section className="etf-top-holdings"><div className="native-section-heading"><div><h3>{pick(isEnglish, "每只 ETF 的前五大披露持仓", "Top five disclosed holdings by ETF")}</h3><p>{pick(isEnglish, "先看底层股票，再理解上面的重合结论；条形按本组最大披露权重缩放。", "Inspect the underlying stocks before interpreting overlap. Bars are scaled to the largest disclosed weight in this group.")}</p></div><Badge variant="outline">{pick(isEnglish, "数字为基金披露权重", "Figures are disclosed fund weights")}</Badge></div><div className="etf-holding-columns">{diagnosis.etf_list.map((item) => <article key={item.code}><header><div><strong>{item.name}</strong><small>{item.code}</small></div><span>{item.holdings_report_date ? formatDate(item.holdings_report_date) : pick(isEnglish, "日期未取得", "Date unavailable")}</span></header>{item.top_holdings?.length ? <ol>{item.top_holdings.slice(0, 5).map((holding, index) => <li key={`${holding.stock_code || holding.stock_name}-${index}`}><span><i>{index + 1}</i><b>{holding.stock_name}</b><small>{holding.stock_code || pick(isEnglish, "代码未取得", "Code unavailable")}</small></span><em>{holding.weight == null ? pick(isEnglish, "权重未取得", "Weight unavailable") : `${holding.weight.toFixed(2)}%`}</em><u><b style={{ width: `${Math.min(100, (holding.weight ?? 0) / maxHoldingWeight * 100)}%` }} /></u></li>)}</ol> : <div className="native-empty compact"><Database /><strong>{pick(isEnglish, "未取得可展示持仓", "No displayable holdings retrieved")}</strong><span>{pick(isEnglish, "不使用示例股票填充。", "Sample stocks are not inserted.")}</span></div>}</article>)}</div></section>
          <section className="etf-disclosure-table"><div className="native-section-heading"><div><h3>{pick(isEnglish, "数据覆盖与披露日期", "Data coverage and disclosure dates")}</h3><p>{pick(isEnglish, "定期披露不等于当前实时持仓。", "Periodic disclosures are not live current holdings.")}</p></div></div><Table><TableHeader><TableRow><TableHead>ETF</TableHead><TableHead>{pick(isEnglish, "组合权重", "Portfolio weight")}</TableHead><TableHead>{pick(isEnglish, "跟踪方向", "Tracking focus")}</TableHead><TableHead>{pick(isEnglish, "持仓披露期", "Holdings period")}</TableHead><TableHead>{pick(isEnglish, "数据状态", "Data status")}</TableHead></TableRow></TableHeader><TableBody>{diagnosis.etf_list.map((item) => <TableRow key={item.code}><TableCell><strong>{item.name}</strong><small>{item.code}</small></TableCell><TableCell>{item.allocation_pct.toFixed(1)}%</TableCell><TableCell>{item.tracking_index || pick(isEnglish, "未取得", "Unavailable")}</TableCell><TableCell>{item.holdings_report_date ? formatDate(item.holdings_report_date) : pick(isEnglish, "未取得披露日期", "Disclosure date unavailable")}</TableCell><TableCell><Badge variant="outline">{modeLabel(item.data_status, isEnglish)}</Badge><small>{isEnglish ? modeLabel(item.data_status, true) : item.data_status?.message}</small></TableCell></TableRow>)}</TableBody></Table></section>
        </>}
      </section>
    </div>
  );
}
