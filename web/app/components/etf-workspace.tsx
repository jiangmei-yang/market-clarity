"use client";

import { FormEvent, useMemo, useState } from "react";
import { AlertCircle, ArrowRight, CalendarClock, Database, FileSearch, Layers3, Plus, Search, X } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

const modeLabel = (status?: DataStatus) => status?.mode === "live" ? "公开数据可用" : status?.mode === "cache" ? "使用最近缓存" : status?.mode === "mixed" ? "部分数据可用" : status?.mode === "demo" ? "演示数据" : "等待数据";
const PAGE_LOADED_AT = Date.now();

export function ETFWorkspace() {
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
  const disclosureLabel = reportDates.length ? [...new Set(reportDates)].sort().join(" / ") : "未取得披露日期";
  const staleDisclosure = oldestDisclosureAge !== null && oldestDisclosureAge > 120;
  const overlapHeadline = diagnosis ? diagnosis.overlap_stocks.length ? `${diagnosis.overlap_stocks.length} 只底层股票重复出现` : "前十大披露持仓未发现重复股票" : "";
  const maxHoldingWeight = useMemo(() => Math.max(1, ...(diagnosis?.etf_list.flatMap((item) => item.top_holdings ?? []).map((item) => item.weight ?? 0) ?? [])), [diagnosis]);

  const search = async (event: FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    setBusy("search"); setError(""); setDiagnosis(undefined);
    try {
      const response = await fetch(`/api/etf/search?keyword=${encodeURIComponent(query.trim())}&limit=8`, { cache: "no-store" });
      const payload = await response.json() as { items?: ETFSearchItem[]; data_status?: DataStatus; detail?: string; message?: string };
      if (!response.ok) throw new Error(payload.detail || payload.message || "ETF 搜索暂不可用");
      setResults(payload.items ?? []); setStatus(payload.data_status);
      if (!(payload.items ?? []).length) setError("没有找到匹配的 ETF，请检查代码或缩短关键词。");
    } catch (cause) { setResults([]); setError(cause instanceof Error ? cause.message : "ETF 搜索暂不可用"); }
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
      if (!response.ok) throw new Error(payload.detail || payload.message || "ETF 诊断暂不可用");
      setDiagnosis(payload); setStatus(payload.data_status);
    } catch (cause) { setDiagnosis(undefined); setError(cause instanceof Error ? cause.message : "ETF 诊断暂不可用"); }
    finally { setBusy(null); }
  };

  return (
    <div className="etf-native-layout">
      <section className="tool-input-pane" aria-label="ETF 组合输入">
        <div className="native-section-heading"><div><h2>添加 ETF</h2><p>代码或名称均可；金额用于估算组合暴露。</p></div><span className="native-heading-badges">{status && <Badge variant="outline">{modeLabel(status)}</Badge>}<Badge variant="outline">{selected.length}/10</Badge></span></div>
        <form className="native-search-form" onSubmit={search}>
          <Search aria-hidden="true" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例如 510300 或 半导体" aria-label="ETF 代码或名称" />
          <Button type="submit" disabled={busy !== null || !query.trim()}>{busy === "search" ? "查询中" : "查找"}</Button>
        </form>
        {results.length > 0 && <div className="etf-search-results" aria-label="ETF 搜索结果">{results.map((item) => <button key={item.code} onClick={() => addETF(item)}><span><strong>{item.name}</strong><small>{item.code}{item.scale_text ? ` · ${item.scale_text}` : ""}</small></span><Plus /></button>)}</div>}
        {error && <Alert className="native-error"><AlertCircle /><AlertTitle>当前无法完成</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        <Separator />
        <div className="native-section-heading compact"><div><h2>待诊断持仓</h2><p>不填金额时按等权计算。</p></div>{selected.length > 0 && <Button variant="ghost" size="sm" onClick={() => { setSelected([]); setDiagnosis(undefined); }}>清空</Button>}</div>
        <div className="selected-etf-list">
          {selected.length === 0 ? <div className="native-empty compact"><Layers3 /><strong>还没有添加 ETF</strong><span>至少添加一只；两只以上才能识别重复底层持仓。</span></div> : selected.map((item) => <article key={item.code}><div><strong>{item.name}</strong><small>{item.code}</small></div><label><span>持有金额</span><Input type="number" min="0" step="100" value={item.amount || ""} placeholder="等权" onChange={(event) => setSelected((current) => current.map((entry) => entry.code === item.code ? { ...entry, amount: Number(event.target.value) || 0 } : entry))} aria-label={`${item.name}持有金额`} /></label><Button variant="ghost" size="icon-sm" aria-label={`移除${item.name}`} onClick={() => { setSelected((current) => current.filter((entry) => entry.code !== item.code)); setDiagnosis(undefined); }}><X /></Button></article>)}
        </div>
        <Button className="native-primary-wide" size="lg" disabled={!selected.length || busy !== null} onClick={runDiagnosis}>{busy === "diagnosis" ? "正在读取披露持仓…" : "检查底层暴露"}<ArrowRight data-icon="inline-end" /></Button>
      </section>

      <section className="tool-report-pane" aria-live="polite">
        {!diagnosis ? <div className="native-empty report"><FileSearch /><strong>底层暴露会显示在这里</strong><span>先添加两只你实际关注的 ETF；结果会显示披露日期、前五大持仓和重复股票。</span></div> : <>
          <header className="native-report-header etf-result-header"><div><Badge variant={hasUnverifiedHoldings || staleDisclosure ? "outline" : "secondary"}>持仓披露截至 {disclosureLabel}</Badge><h2>{overlapHeadline}</h2><p>只比较本次取得的定期披露前十大持仓，不代表基金当前完整组合。{diagnosis.data_status.notice}</p></div><dl><div><dt>比较 ETF</dt><dd>{diagnosis.total_etfs}</dd></div><div><dt>取得持仓条目</dt><dd>{diagnosis.covered_stocks}</dd></div><div><dt>重复股票</dt><dd>{diagnosis.overlap_stocks.length}</dd></div></dl></header>
          <div className="etf-scope-strip"><span><CalendarClock />{oldestDisclosureAge === null ? "披露日期未取得" : `最旧披露距今 ${oldestDisclosureAge} 天`}</span><strong>{diagnosis.suggestion}</strong><small>结论范围：本次返回的定期披露持仓</small></div>
          {hasUnverifiedHoldings && <Alert className="native-source-warning"><AlertCircle /><AlertTitle>当前不能把重合结果当作最新真实持仓</AlertTitle><AlertDescription>至少一只 ETF 没有取得可核实的持仓披露日期，或使用了明确标注的降级数据。下面的结构只用于检查页面流程，不应据此调整真实组合。</AlertDescription></Alert>}
          {!hasUnverifiedHoldings && staleDisclosure && <Alert className="native-source-warning"><CalendarClock /><AlertTitle>持仓披露距离当前时间较久</AlertTitle><AlertDescription>最旧一份持仓披露距今 {oldestDisclosureAge} 天。它可以用于理解已披露结构，但不能代表基金今天仍维持相同股票和权重。</AlertDescription></Alert>}
          <div className="etf-report-grid">
            <section><div className="native-section-heading"><div><h3>名称主题分布</h3><p>按投入金额或等权汇总；这部分是名称推断，不是底层行业分类。</p></div></div><div className="exposure-bars">{diagnosis.exposure_breakdown.length ? diagnosis.exposure_breakdown.slice(0, 8).map((item) => <div key={item.name}><span><strong>{item.name}</strong><b>{item.portfolio_weight_pct.toFixed(1)}%</b></span><i><em style={{ width: `${Math.min(100, item.portfolio_weight_pct)}%` }} /></i><small>{item.basis}</small></div>) : <p>当前持仓资料不足，无法形成主题暴露。</p>}</div></section>
            <section><div className="native-section-heading"><div><h3>重复底层持仓</h3><p>只覆盖本次取得的定期披露持仓。</p></div></div>{diagnosis.overlap_stocks.length ? <Table><TableHeader><TableRow><TableHead>股票</TableHead><TableHead>出现于</TableHead><TableHead className="numeric">披露权重</TableHead></TableRow></TableHeader><TableBody>{diagnosis.overlap_stocks.slice(0, 10).map((item) => <TableRow key={item.stock_code || item.stock_name}><TableCell><strong>{item.stock_name}</strong><small>{item.stock_code}</small></TableCell><TableCell>{item.etfs.map((etf) => etf.etf_name).join("、")}</TableCell><TableCell className="numeric">{item.etfs.map((etf) => etf.weight == null ? "—" : `${etf.weight.toFixed(2)}%`).join(" / ")}</TableCell></TableRow>)}</TableBody></Table> : <div className="native-empty compact"><Database /><strong>未在已取得持仓中发现重合</strong><span>这不代表完整持仓不存在重合；请结合披露覆盖和日期理解。</span></div>}</section>
          </div>
          <section className="etf-top-holdings"><div className="native-section-heading"><div><h3>每只 ETF 的前五大披露持仓</h3><p>先看底层股票，再理解上面的重合结论；条形按本组最大披露权重缩放。</p></div><Badge variant="outline">数字为基金披露权重</Badge></div><div className="etf-holding-columns">{diagnosis.etf_list.map((item) => <article key={item.code}><header><div><strong>{item.name}</strong><small>{item.code}</small></div><span>{item.holdings_report_date || "日期未取得"}</span></header>{item.top_holdings?.length ? <ol>{item.top_holdings.slice(0, 5).map((holding, index) => <li key={`${holding.stock_code || holding.stock_name}-${index}`}><span><i>{index + 1}</i><b>{holding.stock_name}</b><small>{holding.stock_code || "代码未取得"}</small></span><em>{holding.weight == null ? "权重未取得" : `${holding.weight.toFixed(2)}%`}</em><u><b style={{ width: `${Math.min(100, (holding.weight ?? 0) / maxHoldingWeight * 100)}%` }} /></u></li>)}</ol> : <div className="native-empty compact"><Database /><strong>未取得可展示持仓</strong><span>不使用示例股票填充。</span></div>}</article>)}</div></section>
          <section className="etf-disclosure-table"><div className="native-section-heading"><div><h3>数据覆盖与披露日期</h3><p>定期披露不等于当前实时持仓。</p></div></div><Table><TableHeader><TableRow><TableHead>ETF</TableHead><TableHead>组合权重</TableHead><TableHead>跟踪方向</TableHead><TableHead>持仓披露期</TableHead><TableHead>数据状态</TableHead></TableRow></TableHeader><TableBody>{diagnosis.etf_list.map((item) => <TableRow key={item.code}><TableCell><strong>{item.name}</strong><small>{item.code}</small></TableCell><TableCell>{item.allocation_pct.toFixed(1)}%</TableCell><TableCell>{item.tracking_index || "未取得"}</TableCell><TableCell>{item.holdings_report_date || "未取得披露日期"}</TableCell><TableCell><Badge variant="outline">{modeLabel(item.data_status)}</Badge><small>{item.data_status?.message}</small></TableCell></TableRow>)}</TableBody></Table></section>
        </>}
      </section>
    </div>
  );
}
