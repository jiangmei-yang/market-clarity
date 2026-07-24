"use client";

import { ChangeEvent, useState } from "react";
import { AlertCircle, FileSpreadsheet, ReceiptText, Upload } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { pick, useI18n } from "@/app/i18n";

type Position = { code: string; name: string; trade_count: number; net_quantity: number; cost_basis: number; cost_weight_pct?: number; realized_pnl: number; fees: number };
type FifoMatch = { code: string; name: string; buy_date: string; sell_date: string; matched_quantity: number; buy_unit_cost: number; net_sell_price: number; realized_pnl: number };
type TradeRecord = { date: string; code: string; name: string; direction: "买入" | "卖出"; price: number; quantity: number; amount: number; fee: number };
type AttributionResult = {
  record_count: number;
  parse_errors: Array<{ line: number; message: string }>;
  attribution: { positions: Position[]; active_positions: number; closed_positions: number; total_buy_amount: number; total_sell_amount: number; realized_pnl: number; total_fees: number; unmatched_sell: unknown[]; unmatched_sell_count:number; fifo_matches: FifoMatch[]; timeline: TradeRecord[] };
  risk_flags: Array<{ id: string; label: string; detail: string }>;
  report: string;
  data_status: { mode: string; notice: string };
};

const signedMoney = (value: number, locale: string) => value > 0 ? `+¥${value.toLocaleString(locale)}` : value < 0 ? `−¥${Math.abs(value).toLocaleString(locale)}` : "¥0";

export function TradeReviewWorkspace() {
  const { isEnglish, locale } = useI18n();
  const [content, setContent] = useState("");
  const [filename, setFilename] = useState("");
  const [result, setResult] = useState<AttributionResult>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const largestPosition = result ? [...result.attribution.positions].filter((item) => item.net_quantity > 0).sort((left, right) => (right.cost_weight_pct ?? 0) - (left.cost_weight_pct ?? 0))[0] : undefined;
  const primaryMatch = result ? [...result.attribution.fifo_matches].sort((left, right) => Math.abs(right.realized_pnl) - Math.abs(left.realized_pnl))[0] : undefined;
  const formatDate = (value: string) => {
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(locale, { month: "short", day: "numeric" });
  };

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError(pick(isEnglish, "CSV 文件不能超过 5MB。", "CSV files must be 5 MB or smaller.")); return; }
    try { setContent(await file.text()); setFilename(file.name); setError(""); setResult(undefined); }
    catch { setError(pick(isEnglish, "无法读取这个文件，请另存为 UTF-8 CSV 后重试。", "This file could not be read. Save it as a UTF-8 CSV and try again.")); }
  };

  const run = async () => {
    if (!content.trim()) return;
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/trade/attribution", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ file_content: content, delimiter: "," }) });
      const payload = await response.json() as AttributionResult & { detail?: string; message?: string };
      if (!response.ok) throw new Error(isEnglish ? "Trade review is temporarily unavailable." : payload.detail || payload.message || "交易记录复盘暂不可用");
      setResult(payload);
    } catch (cause) { setResult(undefined); setError(cause instanceof Error ? cause.message : pick(isEnglish, "交易记录复盘暂不可用", "Trade review is temporarily unavailable.")); }
    finally { setLoading(false); }
  };

  return (
    <div className="trade-native-layout">
      <section className="trade-import-pane">
        <div className="native-section-heading"><div><h2>{pick(isEnglish, "导入交易记录", "Import trade records")}</h2><p>{pick(isEnglish, "支持券商导出的 CSV，也可以直接粘贴。", "Upload a broker CSV or paste its contents.")}</p></div><Badge variant="outline">{pick(isEnglish, "仅在本次页面处理", "Processed only on this page")}</Badge></div>
        <label className="native-file-upload"><input type="file" accept=".csv,text/csv,.txt" onChange={chooseFile} /><Upload /><span><strong>{filename || pick(isEnglish, "选择 CSV 文件", "Choose CSV file")}</strong><small>{pick(isEnglish, "最大 5MB；不会要求券商账户或密码", "Up to 5 MB; no brokerage login or password required")}</small></span></label>
        <div className="native-divider"><Separator /><span>{pick(isEnglish, "或者粘贴内容", "or paste CSV")}</span><Separator /></div>
        <label className="trade-textarea-label"><span>{pick(isEnglish, "字段：日期,代码,名称,方向,价格,数量,金额,费用", "Columns: date,code,name,side,price,quantity,amount,fee")}</span><Textarea value={content} onChange={(event) => { setContent(event.target.value); setResult(undefined); }} placeholder={pick(isEnglish, "日期,代码,名称,方向,价格,数量,金额,费用", "date,code,name,side,price,quantity,amount,fee")} spellCheck={false} /></label>
        {error && <Alert className="native-error"><AlertCircle /><AlertTitle>{pick(isEnglish, "当前无法复盘", "Review unavailable")}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        <Button className="native-primary-wide" size="lg" disabled={!content.trim() || loading} onClick={run}>{loading ? pick(isEnglish, "正在匹配买卖记录…", "Matching trades…") : pick(isEnglish, "开始复盘", "Run review")}</Button>
        <div className="trade-method-note"><strong>{pick(isEnglish, "计算口径", "Method")}</strong><p>{pick(isEnglish, "买入费用计入持仓成本，卖出费用从成交收入扣除；卖出按 FIFO 与最早买入批次匹配。", "Buy fees are included in cost basis and sell fees are deducted from proceeds. Sells are matched to the earliest buys using FIFO.")}</p></div>
      </section>
      <section className="tool-report-pane trade-report" aria-live="polite">
        {!result ? <div className="native-empty report"><FileSpreadsheet /><strong>{pick(isEnglish, "复盘结果会显示在这里", "Your review will appear here")}</strong><span>{pick(isEnglish, "不会自动填入示例记录，也不会在缺少最新市价时计算未实现盈亏。", "No sample trades are inserted, and unrealized P&L is not calculated without current prices.")}</span></div> : <>
          <header className="trade-result-summary"><div><Badge variant="secondary">{pick(isEnglish, "交易文件已解析", "Trade file parsed")}</Badge><h2>{result.record_count} {pick(isEnglish, "条记录", "records")}</h2><p>{result.data_status.notice}</p></div><dl><div><dt>{pick(isEnglish, "已实现盈亏", "Realized P&L")}</dt><dd className={result.attribution.realized_pnl > 0 ? "price-up" : result.attribution.realized_pnl < 0 ? "price-down" : ""}>{signedMoney(result.attribution.realized_pnl, locale)}</dd></div><div><dt>{pick(isEnglish, "交易费用", "Fees")}</dt><dd>¥{result.attribution.total_fees.toLocaleString(locale)}</dd></div><div><dt>{pick(isEnglish, "未平仓标的", "Open positions")}</dt><dd>{result.attribution.active_positions}</dd></div><div><dt>{pick(isEnglish, "无法匹配卖出", "Unmatched sells")}</dt><dd>{result.attribution.unmatched_sell.length}</dd></div></dl></header>
          {result.parse_errors.length > 0 && <Alert className="native-error"><AlertCircle /><AlertTitle>{result.parse_errors.length} {pick(isEnglish, "行未计入", "rows excluded")}</AlertTitle><AlertDescription>{result.parse_errors.slice(0, 3).map((item) => pick(isEnglish, `第 ${item.line} 行：${item.message}`, `Row ${item.line}: ${item.message}`)).join(pick(isEnglish, "；", "; "))}</AlertDescription></Alert>}
          <div className="trade-result-grid"><section><div className="native-section-heading"><div><h3>{pick(isEnglish, "持仓与已实现结果", "Positions and realized results")}</h3><p>{pick(isEnglish, "成本口径，不包含当前市价。", "Cost-basis view; current prices are not included.")}</p></div></div><Table><TableHeader><TableRow><TableHead>{pick(isEnglish, "标的", "Asset")}</TableHead><TableHead className="numeric">{pick(isEnglish, "剩余数量", "Open quantity")}</TableHead><TableHead className="numeric">{pick(isEnglish, "持仓成本", "Cost basis")}</TableHead><TableHead className="numeric">{pick(isEnglish, "成本占比", "Cost weight")}</TableHead><TableHead className="numeric">{pick(isEnglish, "已实现盈亏", "Realized P&L")}</TableHead><TableHead className="numeric">{pick(isEnglish, "交易次数", "Trades")}</TableHead></TableRow></TableHeader><TableBody>{result.attribution.positions.map((item) => <TableRow key={item.code}><TableCell><strong>{item.name}</strong><small>{item.code}</small></TableCell><TableCell className="numeric">{item.net_quantity.toLocaleString(locale)}</TableCell><TableCell className="numeric">¥{item.cost_basis.toLocaleString(locale)}</TableCell><TableCell className="numeric">{item.cost_weight_pct == null ? "—" : `${item.cost_weight_pct.toFixed(1)}%`}</TableCell><TableCell className={`numeric ${item.realized_pnl > 0 ? "price-up" : item.realized_pnl < 0 ? "price-down" : ""}`}>{signedMoney(item.realized_pnl, locale)}</TableCell><TableCell className="numeric">{item.trade_count}</TableCell></TableRow>)}</TableBody></Table></section><aside><div className="native-section-heading"><div><h3>{pick(isEnglish, "需要复核", "Review flags")}</h3><p>{pick(isEnglish, "只描述本次记录触发的规则。", "Only rules triggered by this import are shown.")}</p></div></div>{result.risk_flags.length ? <div className="trade-risk-list">{result.risk_flags.map((flag) => <article key={flag.id}><ReceiptText /><div><strong>{flag.label}</strong><p>{flag.detail}</p></div></article>)}</div> : <div className="native-empty compact"><ReceiptText /><strong>{pick(isEnglish, "未触发预设规则", "No preset rules triggered")}</strong><span>{pick(isEnglish, "这不代表交易没有风险，只表示当前记录未触发集中度、频率或完整性规则。", "This does not mean the trades were risk-free; this import simply did not trigger concentration, frequency, or completeness rules.")}</span></div>}</aside></div>
          <section className="trade-audit-grid">
            <div><div className="native-section-heading"><div><h3>{pick(isEnglish, "FIFO 匹配明细", "FIFO match details")}</h3><p>{pick(isEnglish, "每一笔已实现盈亏都能追溯到买入批次和卖出价格。", "Each realized result is traceable to a buy lot and net sell price.")}</p></div><Badge variant="outline">{result.attribution.fifo_matches.length} {pick(isEnglish, "个匹配", "matches")}</Badge></div>{result.attribution.fifo_matches.length ? <Table><TableHeader><TableRow><TableHead>{pick(isEnglish, "标的", "Asset")}</TableHead><TableHead>{pick(isEnglish, "买入 → 卖出", "Bought → sold")}</TableHead><TableHead className="numeric">{pick(isEnglish, "匹配数量", "Matched quantity")}</TableHead><TableHead className="numeric">{pick(isEnglish, "单位成本 → 卖出净价", "Unit cost → net sell")}</TableHead><TableHead className="numeric">{pick(isEnglish, "已实现盈亏", "Realized P&L")}</TableHead></TableRow></TableHeader><TableBody>{result.attribution.fifo_matches.map((item, index) => <TableRow key={`${item.code}-${item.sell_date}-${index}`}><TableCell><strong>{item.name}</strong><small>{item.code}</small></TableCell><TableCell>{formatDate(item.buy_date)} → {formatDate(item.sell_date)}</TableCell><TableCell className="numeric">{item.matched_quantity.toLocaleString(locale)}</TableCell><TableCell className="numeric">¥{item.buy_unit_cost.toFixed(4)} → ¥{item.net_sell_price.toFixed(4)}</TableCell><TableCell className={`numeric ${item.realized_pnl > 0 ? "price-up" : item.realized_pnl < 0 ? "price-down" : ""}`}>{signedMoney(item.realized_pnl, locale)}</TableCell></TableRow>)}</TableBody></Table> : <div className="native-empty compact"><ReceiptText /><strong>{pick(isEnglish, "没有可匹配的卖出记录", "No sell records could be matched")}</strong><span>{pick(isEnglish, "当前文件只包含买入，或卖出缺少此前买入记录。", "This file contains only buys, or a sell has no earlier buy lot.")}</span></div>}</div>
            <aside><div className="native-section-heading"><div><h3>{pick(isEnglish, "交易时间线", "Trade timeline")}</h3><p>{pick(isEnglish, "按日期排列本次导入记录。", "Imported records in date order.")}</p></div></div><ol className="trade-timeline">{result.attribution.timeline.map((item, index) => <li key={`${item.date}-${item.code}-${index}`}><time>{formatDate(item.date)}</time><i data-side={item.direction} /><span><strong>{item.name} · {pick(isEnglish, item.direction, item.direction === "买入" ? "Buy" : "Sell")}</strong><small>{item.quantity.toLocaleString(locale)} {pick(isEnglish, "份", "units")} · ¥{item.amount.toLocaleString(locale)} · {pick(isEnglish, "费用", "fee")} ¥{item.fee.toLocaleString(locale)}</small></span></li>)}</ol></aside>
          </section>
          <section className="trade-review-conclusion"><div><span>{pick(isEnglish, "已实现盈亏来自", "Largest realized driver")}</span><strong>{primaryMatch ? `${primaryMatch.name} · ${primaryMatch.sell_date}` : pick(isEnglish, "本次没有完成卖出匹配", "No completed sell match")}</strong><small>{primaryMatch ? pick(isEnglish, `FIFO 匹配 ${primaryMatch.matched_quantity.toLocaleString(locale)} 份，结果 ${signedMoney(primaryMatch.realized_pnl, locale)}`, `FIFO matched ${primaryMatch.matched_quantity.toLocaleString(locale)} units; result ${signedMoney(primaryMatch.realized_pnl, locale)}`) : pick(isEnglish, "当前没有可归因的已实现盈亏", "No realized P&L can be attributed")}</small></div><div><span>{pick(isEnglish, "当前成本最集中", "Largest cost concentration")}</span><strong>{largestPosition ? `${largestPosition.name} · ${(largestPosition.cost_weight_pct ?? 0).toFixed(1)}%` : pick(isEnglish, "没有未平仓持仓", "No open positions")}</strong><small>{largestPosition ? pick(isEnglish, `成本 ¥${largestPosition.cost_basis.toLocaleString(locale)}，按本次导入记录计算`, `Cost basis ¥${largestPosition.cost_basis.toLocaleString(locale)}, calculated from this import`) : result.attribution.unmatched_sell_count > 0 ? pick(isEnglish, "没有可计算的未平仓买入批次", "No open buy lot can be calculated") : pick(isEnglish, "本次导入记录中没有剩余持仓", "No remaining positions in this import")}</small></div><div><span>{pick(isEnglish, "本次不能回答", "Not answered by this review")}</span><strong>{pick(isEnglish, "未实现盈亏与当前市值", "Unrealized P&L and market value")}</strong><small>{pick(isEnglish, "没有接入最新市价，不用历史成交价代替。", "Current prices are unavailable, so historical trade prices are not substituted.")}</small></div></section>
        </>}
      </section>
    </div>
  );
}
