"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, CircleHelp, Database, FileChartColumn, RefreshCw, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type FinancialCheck = {
  id: string;
  title: string;
  state: "steady" | "watch" | "attention" | "unknown";
  finding: string;
  evidence: string;
  why_it_matters: string;
};

type FinancialPeriod = {
  report_date: string;
  revenue: number | null;
  net_profit: number | null;
  deducted_net_profit?: number | null;
  operating_cash_flow: number | null;
  accounts_receivable: number | null;
  inventory: number | null;
  debt_ratio: number | null;
};

type FinancialPayload = {
  code: string;
  name: string;
  report_date: string;
  headline: {
    revenue: number | null;
    revenue_yoy: number | null;
    net_profit: number | null;
    profit_yoy: number | null;
    deducted_net_profit?: number | null;
    deducted_profit_yoy?: number | null;
    roe: number | null;
    operating_cash_flow: number | null;
    cash_conversion: number | null;
    debt_ratio: number | null;
  };
  checks: FinancialCheck[];
  periods: FinancialPeriod[];
  coverage: { known_checks: number; total_checks: number };
  data_status: { source: string; is_demo: boolean; updated_at: string; message?: string };
  methodology: { comparison: string; cash_rule: string; disclaimer: string };
};

const stateMeta = {
  steady: { label: "未触发异常", icon: CheckCircle2 },
  watch: { label: "继续观察", icon: CircleHelp },
  attention: { label: "需要核实", icon: AlertCircle },
  unknown: { label: "数据不足", icon: CircleHelp },
};

function money(value: number | null) {
  if (value === null) return "暂无";
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 100_000_000) return `${sign}${(abs / 100_000_000).toFixed(abs >= 10_000_000_000 ? 0 : 1)} 亿`;
  if (abs >= 10_000) return `${sign}${(abs / 10_000).toFixed(1)} 万`;
  return `${sign}${abs.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`;
}

function percent(value: number | null, digits = 1) {
  return value === null ? "暂无" : `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function updatedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function auditMeta(check: FinancialCheck, payload: FinancialPayload) {
  if (check.id === "cash_quality") return { formula: "经营活动现金流净额 ÷ 归母净利润", fields: `经营现金流 ${money(payload.headline.operating_cash_flow)} · 归母净利润 ${money(payload.headline.net_profit)}`, threshold: "低于 0.50 需核实；0.50–0.80 继续观察" };
  if (check.id === "receivables") return { formula: "应收账款同比 − 营业收入同比", fields: check.evidence, threshold: "差值超过 10 个百分点需核实" };
  if (check.id === "inventory") return { formula: "存货同比 − 营业收入同比", fields: check.evidence, threshold: "差值超过 15 个百分点继续观察" };
  return { formula: "总负债 ÷ 总资产", fields: check.evidence, threshold: "高于 70% 需核实；仍需结合行业解释" };
}

function MetricTrend({ values, label }: { values: Array<number | null | undefined>; label: string }) {
  const usable = values.map((value) => typeof value === "number" && Number.isFinite(value) ? value : null);
  const known = usable.filter((value): value is number => value !== null);
  if (known.length < 2) return <span className="metric-trend-empty">趋势数据不足</span>;
  const minimum = Math.min(...known);
  const maximum = Math.max(...known);
  const spread = Math.max(maximum - minimum, 1);
  const path = usable.map((value, index) => value === null ? null : `${index === 0 ? "M" : "L"}${(index / Math.max(usable.length - 1, 1) * 112).toFixed(1)} ${(27 - (value - minimum) / spread * 22).toFixed(1)}`).filter(Boolean).join(" ");
  return <svg className="metric-trend" viewBox="0 0 112 30" role="img" aria-label={`${label}最近报告期趋势`} preserveAspectRatio="none"><path d={path} /></svg>;
}

export function FinancialHealthPanel({ code, name, judgment }: { code: string; name: string; judgment?: { reason?: string; invalidation?: string; reviewedAt?: string } }) {
  const [snapshot, setSnapshot] = useState<{ requestedCode: string; payload?: FinancialPayload; error?: string }>({ requestedCode: code });
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/financial/${code}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json() as FinancialPayload & { message?: string; detail?: string };
        if (!response.ok) throw new Error(result.message || result.detail || "暂时无法读取财报");
        setSnapshot({ requestedCode: code, payload: result });
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setSnapshot({ requestedCode: code, error: reason instanceof Error ? reason.message : "暂时无法读取财报" });
      });
    return () => controller.abort();
  }, [code, reloadKey]);

  const current = snapshot.requestedCode === code ? snapshot : { requestedCode: code };
  const payload = current.payload;
  const error = current.error ?? "";

  const chartPeriods = useMemo(() => payload?.periods.slice(0, 5).reverse() ?? [], [payload]);
  const chartMax = useMemo(() => Math.max(1, ...chartPeriods.flatMap((period) => [Math.abs(period.net_profit ?? 0), Math.abs(period.operating_cash_flow ?? 0)])), [chartPeriods]);

  if (error) {
    return <section className="financial-empty"><FileChartColumn /><div><strong>{name} 的财报体检暂未完成</strong><p>{error}</p><small>系统没有用演示数据或 AI 猜测填补缺失结果。</small></div><Button variant="outline" onClick={() => { setSnapshot({ requestedCode: code }); setReloadKey((value) => value + 1); }}><RefreshCw data-icon="inline-start" />重试</Button></section>;
  }
  if (!payload) {
    return <section className="financial-loading"><span className="financial-loader" /><div><strong>正在读取三张财务报表</strong><p>按相同报告日合并资产负债表、利润表和现金流量表，通常需要数秒。</p></div></section>;
  }

  const attentionChecks = payload.checks.filter((check) => check.state === "attention" || check.state === "watch");
  const metrics = [
    { label: "营业收入", value: money(payload.headline.revenue), change: percent(payload.headline.revenue_yoy), values: chartPeriods.map((period) => period.revenue) },
    { label: "归母净利润", value: money(payload.headline.net_profit), change: percent(payload.headline.profit_yoy), values: chartPeriods.map((period) => period.net_profit) },
    { label: "扣非净利润", value: money(payload.headline.deducted_net_profit ?? null), change: percent(payload.headline.deducted_profit_yoy ?? null), values: chartPeriods.map((period) => period.deducted_net_profit) },
    { label: "经营现金流", value: money(payload.headline.operating_cash_flow), change: payload.headline.cash_conversion === null ? "转化率暂无" : `利润转化 ${payload.headline.cash_conversion.toFixed(2)}×`, values: chartPeriods.map((period) => period.operating_cash_flow) },
  ];

  return (
    <section className="financial-health">
      <header className="financial-health-header">
        <div><span className="financial-source-line"><Database />{payload.data_status.source}<i />更新于 {updatedAt(payload.data_status.updated_at)}</span><h2>{name} · {payload.report_date} 财报体检</h2><p>同报告期勾稽利润、现金流、应收、存货和负债。</p></div>
        <div className="financial-coverage"><strong>{payload.coverage.known_checks}/{payload.coverage.total_checks}</strong><span>规则可判断</span></div>
      </header>

      {payload.data_status.is_demo && <div className="financial-demo-warning"><AlertCircle /><span><strong>当前是演示财务数据</strong>不能用于判断真实公司；请等待公开报表服务恢复。</span></div>}

      <section className={attentionChecks.length ? "financial-verdict attention" : "financial-verdict steady"}><span>{attentionChecks.length ? <AlertCircle /> : <CheckCircle2 />}</span><div><small>本期规则检查</small><h3>{attentionChecks.length ? `${attentionChecks.length} 项需要展开核实` : "未触发四项预设异常线"}</h3><p>{attentionChecks.length ? attentionChecks.map((check) => `${check.title}：${check.finding}`).join("；") : "这只表示当前四条规则未触发，仍需结合行业、附注和公司经营解释。"}</p></div><div><strong>{payload.report_date}</strong><small>最新报告期</small></div></section>

      {judgment?.reason && <section className="financial-judgment-link"><div><span>与你最近记录的判断</span><strong>{judgment.reason}</strong><small>{judgment.reviewedAt ?? "已保存"}</small></div><div><span>失效条件</span><strong>{judgment.invalidation || "尚未记录"}</strong><small>{attentionChecks.length ? `当前有 ${attentionChecks.length} 项财务异常需要人工对照；系统不自动判定支持或推翻。` : "当前规则结果不足以自动证明判断成立。"}</small></div></section>}

      <div className="financial-headlines">{metrics.map((metric) => <article key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><small className={metric.change.startsWith("−") ? "down" : ""}>{metric.change}{metric.change === "暂无" ? " · 源未返回" : metric.change.includes("转化") ? "" : " 同比"}</small><MetricTrend values={metric.values} label={metric.label} /></article>)}</div>

      <section className="financial-check-list">
        <div className="financial-check-heading"><div><h3>异常勾稽明细</h3><p>展开可查看公式、字段、阈值和解释边界。</p></div><Badge variant="outline">规则引擎 · 无需 AI Key</Badge></div>
        {payload.checks.map((check) => {
          const meta = stateMeta[check.state];
          const Icon = meta.icon;
          const audit = auditMeta(check, payload);
          return <details key={check.id} className={`financial-check-row ${check.state}`} open={check.state === "attention" || check.state === "watch"}><summary><span className="check-state-icon"><Icon /></span><span><b>{check.title}</b><small>{check.finding}</small></span><strong>{check.evidence}</strong><Badge variant="outline">{meta.label}</Badge><i /></summary><div className="financial-check-audit"><dl><div><dt>公式</dt><dd>{audit.formula}</dd></div><div><dt>本期字段</dt><dd>{audit.fields}</dd></div><div><dt>触发阈值</dt><dd>{audit.threshold}</dd></div><div><dt>结果边界</dt><dd>{check.why_it_matters}</dd></div><div><dt>来源 / 报告期</dt><dd>{payload.data_status.source} · {payload.report_date}</dd></div></dl></div></details>;
        })}
      </section>

      <div className="financial-lower-grid">
        <section className="financial-trend-card">
          <div className="financial-section-title"><span><TrendingUp /><strong>利润与现金流</strong></span><small>各报告期累计值 · 不直接比较相邻柱</small></div>
          <div className="financial-bars" role="img" aria-label="最近报告期净利润与经营现金流比较">
            {chartPeriods.map((period) => <div key={period.report_date} className="financial-bar-group"><div className="financial-bar-stage"><i className="profit" style={{ height: `${Math.max(4, Math.abs(period.net_profit ?? 0) / chartMax * 100)}%` }} title={`净利润 ${money(period.net_profit)}`} /><i className="cash" style={{ height: `${Math.max(4, Math.abs(period.operating_cash_flow ?? 0) / chartMax * 100)}%` }} title={`经营现金流 ${money(period.operating_cash_flow)}`} /></div><span>{period.report_date.slice(2, 7).replace("-", "/")}</span></div>)}
          </div>
          <div className="financial-legend"><span><i className="profit" />净利润</span><span><i className="cash" />经营现金流</span></div>
          <div className="financial-period-table"><span>报告期</span><span>营业收入</span><span>归母净利润</span><span>经营现金流</span>{chartPeriods.slice().reverse().map((period) => <div key={period.report_date}><strong>{period.report_date}</strong><span>{money(period.revenue)}</span><span>{money(period.net_profit)}</span><span>{money(period.operating_cash_flow)}</span></div>)}</div>
        </section>
        <section className="financial-method-card">
          <div className="financial-section-title"><span><Database /><strong>数据与口径</strong></span><Badge variant="outline">{payload.data_status.is_demo ? "演示" : "公开报表"}</Badge></div>
          <dl><div><dt>来源</dt><dd>{payload.data_status.source}</dd></div><div><dt>同比方法</dt><dd>{payload.methodology.comparison}</dd></div><div><dt>现金口径</dt><dd>{payload.methodology.cash_rule}</dd></div></dl>
          <div className="financial-peer-unavailable"><strong>同行比较暂不展示</strong><p>尚未取得同一行业、同一报告期、同一字段口径的完整可比样本，因此不生成假排名。</p></div>
          <p>{payload.data_status.message}</p><small>{payload.methodology.disclaimer}</small>
        </section>
      </div>
    </section>
  );
}
