"use client";

import { ChangeEvent, useState } from "react";
import { AlertCircle, FileSpreadsheet, ReceiptText, Upload } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type Position = { code: string; name: string; trade_count: number; net_quantity: number; cost_basis: number; cost_weight_pct?: number; realized_pnl: number; fees: number };
type FifoMatch = { code: string; name: string; buy_date: string; sell_date: string; matched_quantity: number; buy_unit_cost: number; net_sell_price: number; realized_pnl: number };
type TradeRecord = { date: string; code: string; name: string; direction: "买入" | "卖出"; price: number; quantity: number; amount: number; fee: number };
type AttributionResult = {
  record_count: number;
  parse_errors: Array<{ line: number; message: string }>;
  attribution: { positions: Position[]; active_positions: number; closed_positions: number; total_buy_amount: number; total_sell_amount: number; realized_pnl: number; total_fees: number; unmatched_sell: unknown[]; fifo_matches: FifoMatch[]; timeline: TradeRecord[] };
  risk_flags: Array<{ id: string; label: string; detail: string }>;
  report: string;
  data_status: { mode: string; notice: string };
};

const signedMoney = (value: number) => value > 0 ? `+¥${value.toLocaleString()}` : value < 0 ? `−¥${Math.abs(value).toLocaleString()}` : "¥0";

export function TradeReviewWorkspace() {
  const [content, setContent] = useState("");
  const [filename, setFilename] = useState("");
  const [result, setResult] = useState<AttributionResult>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const largestPosition = result ? [...result.attribution.positions].filter((item) => item.net_quantity > 0).sort((left, right) => (right.cost_weight_pct ?? 0) - (left.cost_weight_pct ?? 0))[0] : undefined;
  const primaryMatch = result ? [...result.attribution.fifo_matches].sort((left, right) => Math.abs(right.realized_pnl) - Math.abs(left.realized_pnl))[0] : undefined;

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError("CSV 文件不能超过 5MB。"); return; }
    try { setContent(await file.text()); setFilename(file.name); setError(""); setResult(undefined); }
    catch { setError("无法读取这个文件，请另存为 UTF-8 CSV 后重试。"); }
  };

  const run = async () => {
    if (!content.trim()) return;
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/trade/attribution", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ file_content: content, delimiter: "," }) });
      const payload = await response.json() as AttributionResult & { detail?: string; message?: string };
      if (!response.ok) throw new Error(payload.detail || payload.message || "交易记录复盘暂不可用");
      setResult(payload);
    } catch (cause) { setResult(undefined); setError(cause instanceof Error ? cause.message : "交易记录复盘暂不可用"); }
    finally { setLoading(false); }
  };

  return (
    <div className="trade-native-layout">
      <section className="trade-import-pane">
        <div className="native-section-heading"><div><h2>导入交易记录</h2><p>支持券商导出的 CSV，也可以直接粘贴。</p></div><Badge variant="outline">仅在本次页面处理</Badge></div>
        <label className="native-file-upload"><input type="file" accept=".csv,text/csv,.txt" onChange={chooseFile} /><Upload /><span><strong>{filename || "选择 CSV 文件"}</strong><small>最大 5MB；不会要求券商账户或密码</small></span></label>
        <div className="native-divider"><Separator /><span>或者粘贴内容</span><Separator /></div>
        <label className="trade-textarea-label"><span>字段：日期,代码,名称,方向,价格,数量,金额,费用</span><Textarea value={content} onChange={(event) => { setContent(event.target.value); setResult(undefined); }} placeholder="日期,代码,名称,方向,价格,数量,金额,费用" spellCheck={false} /></label>
        {error && <Alert className="native-error"><AlertCircle /><AlertTitle>当前无法复盘</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        <Button className="native-primary-wide" size="lg" disabled={!content.trim() || loading} onClick={run}>{loading ? "正在匹配买卖记录…" : "开始复盘"}</Button>
        <div className="trade-method-note"><strong>计算口径</strong><p>买入费用计入持仓成本，卖出费用从成交收入扣除；卖出按 FIFO 与最早买入批次匹配。</p></div>
      </section>
      <section className="tool-report-pane trade-report" aria-live="polite">
        {!result ? <div className="native-empty report"><FileSpreadsheet /><strong>复盘结果会显示在这里</strong><span>不会自动填入示例记录，也不会在缺少最新市价时计算未实现盈亏。</span></div> : <>
          <header className="trade-result-summary"><div><Badge variant="secondary">交易文件已解析</Badge><h2>{result.record_count} 条记录</h2><p>{result.data_status.notice}</p></div><dl><div><dt>已实现盈亏</dt><dd className={result.attribution.realized_pnl > 0 ? "price-up" : result.attribution.realized_pnl < 0 ? "price-down" : ""}>{signedMoney(result.attribution.realized_pnl)}</dd></div><div><dt>交易费用</dt><dd>¥{result.attribution.total_fees.toLocaleString()}</dd></div><div><dt>未平仓标的</dt><dd>{result.attribution.active_positions}</dd></div><div><dt>无法匹配卖出</dt><dd>{result.attribution.unmatched_sell.length}</dd></div></dl></header>
          {result.parse_errors.length > 0 && <Alert className="native-error"><AlertCircle /><AlertTitle>{result.parse_errors.length} 行未计入</AlertTitle><AlertDescription>{result.parse_errors.slice(0, 3).map((item) => `第 ${item.line} 行：${item.message}`).join("；")}</AlertDescription></Alert>}
          <div className="trade-result-grid"><section><div className="native-section-heading"><div><h3>持仓与已实现结果</h3><p>成本口径，不包含当前市价。</p></div></div><Table><TableHeader><TableRow><TableHead>标的</TableHead><TableHead className="numeric">剩余数量</TableHead><TableHead className="numeric">持仓成本</TableHead><TableHead className="numeric">成本占比</TableHead><TableHead className="numeric">已实现盈亏</TableHead><TableHead className="numeric">交易次数</TableHead></TableRow></TableHeader><TableBody>{result.attribution.positions.map((item) => <TableRow key={item.code}><TableCell><strong>{item.name}</strong><small>{item.code}</small></TableCell><TableCell className="numeric">{item.net_quantity.toLocaleString()}</TableCell><TableCell className="numeric">¥{item.cost_basis.toLocaleString()}</TableCell><TableCell className="numeric">{item.cost_weight_pct == null ? "—" : `${item.cost_weight_pct.toFixed(1)}%`}</TableCell><TableCell className={`numeric ${item.realized_pnl > 0 ? "price-up" : item.realized_pnl < 0 ? "price-down" : ""}`}>{signedMoney(item.realized_pnl)}</TableCell><TableCell className="numeric">{item.trade_count}</TableCell></TableRow>)}</TableBody></Table></section><aside><div className="native-section-heading"><div><h3>需要复核</h3><p>只描述本次记录触发的规则。</p></div></div>{result.risk_flags.length ? <div className="trade-risk-list">{result.risk_flags.map((flag) => <article key={flag.id}><ReceiptText /><div><strong>{flag.label}</strong><p>{flag.detail}</p></div></article>)}</div> : <div className="native-empty compact"><ReceiptText /><strong>未触发预设规则</strong><span>这不代表交易没有风险，只表示当前记录未触发集中度、频率或完整性规则。</span></div>}</aside></div>
          <section className="trade-audit-grid">
            <div><div className="native-section-heading"><div><h3>FIFO 匹配明细</h3><p>每一笔已实现盈亏都能追溯到买入批次和卖出价格。</p></div><Badge variant="outline">{result.attribution.fifo_matches.length} 个匹配</Badge></div>{result.attribution.fifo_matches.length ? <Table><TableHeader><TableRow><TableHead>标的</TableHead><TableHead>买入 → 卖出</TableHead><TableHead className="numeric">匹配数量</TableHead><TableHead className="numeric">单位成本 → 卖出净价</TableHead><TableHead className="numeric">已实现盈亏</TableHead></TableRow></TableHeader><TableBody>{result.attribution.fifo_matches.map((item, index) => <TableRow key={`${item.code}-${item.sell_date}-${index}`}><TableCell><strong>{item.name}</strong><small>{item.code}</small></TableCell><TableCell>{item.buy_date.slice(5)} → {item.sell_date.slice(5)}</TableCell><TableCell className="numeric">{item.matched_quantity.toLocaleString()}</TableCell><TableCell className="numeric">¥{item.buy_unit_cost.toFixed(4)} → ¥{item.net_sell_price.toFixed(4)}</TableCell><TableCell className={`numeric ${item.realized_pnl > 0 ? "price-up" : item.realized_pnl < 0 ? "price-down" : ""}`}>{signedMoney(item.realized_pnl)}</TableCell></TableRow>)}</TableBody></Table> : <div className="native-empty compact"><ReceiptText /><strong>没有可匹配的卖出记录</strong><span>当前文件只包含买入，或卖出缺少此前买入记录。</span></div>}</div>
            <aside><div className="native-section-heading"><div><h3>交易时间线</h3><p>按日期排列本次导入记录。</p></div></div><ol className="trade-timeline">{result.attribution.timeline.map((item, index) => <li key={`${item.date}-${item.code}-${index}`}><time>{item.date.slice(5)}</time><i data-side={item.direction} /><span><strong>{item.name} · {item.direction}</strong><small>{item.quantity.toLocaleString()} 份 · ¥{item.amount.toLocaleString()} · 费用 ¥{item.fee.toLocaleString()}</small></span></li>)}</ol></aside>
          </section>
          <section className="trade-review-conclusion"><div><span>已实现盈亏来自</span><strong>{primaryMatch ? `${primaryMatch.name} · ${primaryMatch.sell_date}` : "本次没有完成卖出匹配"}</strong><small>{primaryMatch ? `FIFO 匹配 ${primaryMatch.matched_quantity.toLocaleString()} 份，结果 ${signedMoney(primaryMatch.realized_pnl)}` : "当前没有可归因的已实现盈亏"}</small></div><div><span>当前成本最集中</span><strong>{largestPosition ? `${largestPosition.name} · ${(largestPosition.cost_weight_pct ?? 0).toFixed(1)}%` : "没有未平仓持仓"}</strong><small>{largestPosition ? `成本 ¥${largestPosition.cost_basis.toLocaleString()}，按本次导入记录计算` : result.attribution.unmatched_sell_count > 0 ? "没有可计算的未平仓买入批次" : "本次导入记录中没有剩余持仓"}</small></div><div><span>本次不能回答</span><strong>未实现盈亏与当前市值</strong><small>没有接入最新市价，不用历史成交价代替。</small></div></section>
        </>}
      </section>
    </div>
  );
}
