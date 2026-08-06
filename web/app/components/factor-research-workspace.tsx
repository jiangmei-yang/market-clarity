"use client";

import { useMemo, useState } from "react";

type FactorId = "momentum_60" | "low_volatility_20" | "reversal_5";
type Plan = { candidate_factor_ids: FactorId[]; candidate_factors: Array<{ id: FactorId; name: string; rationale: string; lookback_days: number }>; warnings: string[] };
type Result = { status: "ready" | "insufficient" | "blocked"; universe: { symbols: string[]; common_dates: number }; evaluations: Array<{ id: string; name: string; status: string; in_sample: { observations: number; mean_ic: number | null; net_excess_return_pct: number | null }; out_of_sample: { observations: number; mean_ic: number | null; net_excess_return_pct: number | null; positive_period_ratio: number | null; average_turnover_pct: number | null }; warnings: string[] }>; warnings: string[]; disclaimer: string };

function parseCsv(text: string) {
  const bySymbol = new Map<string, Array<{ date: string; close: number }>>();
  const rows = text.trim().split(/\r?\n/).map((line) => line.split(",").map((value) => value.trim()));
  for (const row of rows) {
    if (row.length < 3 || row[0].toLowerCase() === "symbol") continue;
    const [symbol, date, rawClose] = row;
    const close = Number(rawClose);
    if (!symbol || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(close) || close <= 0) continue;
    bySymbol.set(symbol, [...(bySymbol.get(symbol) ?? []), { date, close }]);
  }
  return [...bySymbol.entries()].map(([symbol, prices]) => ({ symbol, prices }));
}

const format = (value: number | null, suffix = "") => value === null ? "—" : `${value > 0 ? "+" : ""}${value}${suffix}`;

export function FactorResearchWorkspace() {
  const [question, setQuestion] = useState("验证动量和低波动特征在我选定的 A 股历史样本中是否稳定。");
  const [csv, setCsv] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [chosen, setChosen] = useState<FactorId[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<"plan" | "evaluate" | null>(null);
  const universe = useMemo(() => parseCsv(csv), [csv]);

  async function makePlan() {
    setBusy("plan"); setMessage(""); setResult(null);
    try {
      const response = await fetch("/quant/factors/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "暂时无法生成研究计划。");
      setPlan(body.plan); setChosen(body.plan.candidate_factor_ids); setConfirmed(false);
    } catch (error) { setMessage(error instanceof Error ? error.message : "暂时无法生成研究计划。"); }
    finally { setBusy(null); }
  }

  async function evaluate() {
    setBusy("evaluate"); setMessage("");
    try {
      const response = await fetch("/quant/factors/evaluate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ universe, factor_ids: chosen, confirmed, rebalance_every: 20, holding_days: 20, train_ratio: 0.7, cost_bps: 20 }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "暂时无法运行历史研究。");
      setResult(body.result);
    } catch (error) { setMessage(error instanceof Error ? error.message : "暂时无法运行历史研究。"); }
    finally { setBusy(null); }
  }

  return <section className="factor-research">
    <div className="factor-research-intro"><div><h2>因子研究与历史验证</h2><p>把常见的市场特征放进同一套历史检验里，看看它们在你确认的样本中是否稳定。结果只描述过去，不选股、不预测、更不生成交易指令。</p></div><span>需人工复核</span></div>
    <div className="factor-grid">
      <article className="factor-card"><h3>1. 说明你想验证什么</h3><label>研究问题<textarea value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={800} /></label><p>系统只会从固定、可解释的因子目录中挑选候选项，不会凭空生成复杂公式。</p><button className="primary-action" disabled={busy !== null} onClick={makePlan}>{busy === "plan" ? "正在生成…" : "生成研究计划"}</button></article>
      <article className="factor-card"><h3>2. 提供历史价格</h3><p>粘贴至少 3 只股票、100 个共同交易日的日收盘价。格式：<code>symbol,date,close</code>。只会使用你提供或获授权的数据。</p><textarea className="factor-csv" value={csv} onChange={(event) => setCsv(event.target.value)} placeholder={"symbol,date,close\n000001.SZ,2024-01-02,10.25\n600000.SH,2024-01-02,7.80\n..."} /><small>已识别 {universe.length} 只股票；无效行会被忽略，缺失交易日会在对齐时排除。</small></article>
    </div>
    {plan && <article className="factor-card factor-plan"><h3>3. 确认候选因子，再运行验证</h3><p>你可以取消不想验证的候选项。每一个因子都会使用相同的价格样本、再平衡频率和成本假设进行比较。</p><div className="factor-options">{plan.candidate_factors.map((factor) => <label key={factor.id}><input type="checkbox" checked={chosen.includes(factor.id)} onChange={() => setChosen((current) => current.includes(factor.id) ? current.filter((id) => id !== factor.id) : [...current, factor.id])} /> <span><b>{factor.name}</b><small>{factor.rationale} · 回看 {factor.lookback_days} 个交易日</small></span></label>)}</div><label className="factor-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> 我确认：这只是对已提供历史样本的检验，不代表未来表现，也不是交易建议。</label><button className="primary-action" disabled={busy !== null || !confirmed || chosen.length === 0} onClick={evaluate}>{busy === "evaluate" ? "正在验证…" : "运行历史验证"}</button></article>}
    {message && <p className="factor-message">{message}</p>}
    {result && <article className="factor-results"><header><div><h3>历史验证结果</h3><p>{result.status === "ready" ? "最低历史样本检查已通过，但仍需要结合数据来源与现实适用性人工复核。" : "目前证据不足，不应因为这次结果保留或采用该因子。"}</p></div><span className={`factor-status ${result.status}`}>{result.status === "ready" ? "可供复核" : result.status === "blocked" ? "未确认" : "证据不足"}</span></header><div className="factor-meta"><span>{result.universe.symbols.length} 只股票</span><span>{result.universe.common_dates} 个对齐交易日</span><span>已计入 20 bps 假设成本</span></div>{result.evaluations.map((evaluation) => <div className="factor-result" key={evaluation.id}><div><b>{evaluation.name}</b><small>{evaluation.status === "ready" ? "达到当前设定的最低样本规则" : "样本外证据仍不足"}</small></div><dl><div><dt>样本外期数</dt><dd>{evaluation.out_of_sample.observations}</dd></div><div><dt>样本外排序相关性</dt><dd>{format(evaluation.out_of_sample.mean_ic)}</dd></div><div><dt>样本外每期净超额</dt><dd>{format(evaluation.out_of_sample.net_excess_return_pct, "%")}</dd></div><div><dt>平均换手率</dt><dd>{format(evaluation.out_of_sample.average_turnover_pct, "%")}</dd></div></dl>{evaluation.warnings.length > 0 && <ul>{evaluation.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}</div>)}<ul className="factor-warnings">{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul><p className="factor-disclaimer">{result.disclaimer}</p></article>}
  </section>;
}
