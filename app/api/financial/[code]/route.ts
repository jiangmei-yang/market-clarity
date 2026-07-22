import { NextResponse } from "next/server";
import { readCached, storeCached } from "../../../lib/data-cache";

const DEFAULT_ANXIN_API_URL = "http://127.0.0.1:8001";
const SINA_FINANCE_URL = "https://quotes.sina.cn/cn/api/openapi.php/CompanyFinanceService.getFinanceReport2022";

type RawItem = { item_title?: string; item_value?: string | number | null };
type RawReport = { data?: RawItem[] };
type SinaPayload = { result?: { data?: { report_date?: Array<{ date_value?: string }>; report_list?: Record<string, RawReport> } } };
type Values = Record<string, number | null>;
type Period = Values & { report_date: string };

const numeric = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const change = (current: number | null, previous: number | null) => current !== null && previous !== null && previous !== 0 ? (current / previous - 1) * 100 : null;
const dateLabel = (value: string) => /^\d{8}$/.test(value) ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}` : value.slice(0, 10);
const evidence = (value: number | null, suffix = "%") => value === null ? "数据不足" : `${value.toFixed(1)}${suffix}`;

async function statement(code: string, source: "fzb" | "lrb" | "llb", signal: AbortSignal) {
  const marketCode = code.startsWith("6") ? `sh${code}` : code.startsWith("0") || code.startsWith("3") ? `sz${code}` : `bj${code}`;
  const url = new URL(SINA_FINANCE_URL);
  url.searchParams.set("paperCode", marketCode);
  url.searchParams.set("source", source);
  url.searchParams.set("type", "0");
  url.searchParams.set("page", "1");
  url.searchParams.set("num", "1000");
  const response = await fetch(url, { cache: "no-store", signal, headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`公开财报源返回 ${response.status}`);
  const payload = await response.json() as SinaPayload;
  const data = payload.result?.data;
  if (!data?.report_date?.length || !data.report_list) throw new Error("公开财报源没有返回报告期");
  const result = new Map<string, Values>();
  for (const date of data.report_date) {
    const key = date.date_value;
    if (!key) continue;
    const values: Values = {};
    for (const item of data.report_list[key]?.data ?? []) {
      if (item.item_title && values[item.item_title] === undefined) values[item.item_title] = numeric(item.item_value);
    }
    result.set(key, values);
  }
  return result;
}

function check(id: string, title: string, state: "steady" | "watch" | "attention" | "unknown", finding: string, proof: string, why: string) {
  return { id, title, state, finding, evidence: proof, why_it_matters: why };
}

async function publicFinancialHealth(code: string, signal: AbortSignal) {
  const [balance, income, cash] = await Promise.all([statement(code, "fzb", signal), statement(code, "lrb", signal), statement(code, "llb", signal)]);
  const dates = [...new Set([...balance.keys(), ...income.keys(), ...cash.keys()])].sort();
  const periods: Period[] = dates.map((rawDate) => {
    const b = balance.get(rawDate) ?? {};
    const i = income.get(rawDate) ?? {};
    const c = cash.get(rawDate) ?? {};
    return {
      report_date: dateLabel(rawDate),
      revenue: i["营业总收入"] ?? i["营业收入"] ?? null,
      net_profit: i["归属于母公司所有者的净利润"] ?? i["归属于母公司股东的净利润"] ?? i["净利润"] ?? null,
      deducted_net_profit: i["扣除非经常性损益后的净利润"] ?? i["扣除非经常性损益后归属于母公司所有者的净利润"] ?? null,
      operating_cash_flow: c["经营活动产生的现金流量净额"] ?? null,
      accounts_receivable: b["应收账款"] ?? b["应收票据及应收账款"] ?? null,
      inventory: b["存货"] ?? null,
      total_assets: b["资产总计"] ?? null,
      total_liabilities: b["负债合计"] ?? null,
    };
  }).filter((period) => period.revenue !== null || period.net_profit !== null || period.total_assets !== null);
  if (!periods.length) throw new Error("没有取得可用于体检的财务报表");
  const latest = periods.at(-1)!;
  const latestDate = new Date(latest.report_date);
  const priorDate = `${latestDate.getUTCFullYear() - 1}-${String(latestDate.getUTCMonth() + 1).padStart(2, "0")}-${String(latestDate.getUTCDate()).padStart(2, "0")}`;
  const prior = periods.find((period) => period.report_date === priorDate);
  const revenueGrowth = change(latest.revenue, prior?.revenue ?? null);
  const profitGrowth = change(latest.net_profit, prior?.net_profit ?? null);
  const deductedProfitGrowth = change(latest.deducted_net_profit, prior?.deducted_net_profit ?? null);
  const cashConversion = latest.operating_cash_flow !== null && latest.net_profit !== null && latest.net_profit > 0 ? latest.operating_cash_flow / latest.net_profit : null;
  const receivableGrowth = change(latest.accounts_receivable, prior?.accounts_receivable ?? null);
  const inventoryGrowth = change(latest.inventory, prior?.inventory ?? null);
  const receivableGap = receivableGrowth !== null && revenueGrowth !== null ? receivableGrowth - revenueGrowth : null;
  const inventoryGap = inventoryGrowth !== null && revenueGrowth !== null ? inventoryGrowth - revenueGrowth : null;
  const debtRatio = latest.total_assets && latest.total_liabilities !== null ? latest.total_liabilities / latest.total_assets * 100 : null;

  const checks = [
    cashConversion === null
      ? check("cash_quality", "利润含金量", "unknown", "无法判断", "缺少经营现金流净额或净利润金额", "利润增长不一定意味着现金真正流入。")
      : cashConversion < .5
        ? check("cash_quality", "利润含金量", "attention", "经营现金流明显低于净利润", `经营现金流 / 净利润 = ${cashConversion.toFixed(2)}`, "需要结合应收、存货和行业结算周期核实。")
        : cashConversion < .8
          ? check("cash_quality", "利润含金量", "watch", "现金转化低于净利润", `经营现金流 / 净利润 = ${cashConversion.toFixed(2)}`, "单一报告期可能受季节性影响，应与同季度历史值比较。")
          : check("cash_quality", "利润含金量", "steady", "现金转化未触发预设异常线", `经营现金流 / 净利润 = ${cashConversion.toFixed(2)}`, "规则未触发不代表盈利质量没有其他风险。"),
    receivableGap === null
      ? check("receivables", "回款压力", "unknown", "无法判断", "缺少去年同期应收账款或营业收入", "应收增长显著快于收入时，可能需要核实回款质量。")
      : receivableGap > 10
        ? check("receivables", "回款压力", "attention", "应收账款增长快于收入", `应收同比 ${evidence(receivableGrowth)} · 收入同比 ${evidence(revenueGrowth)}`, "差值超过预设的 10 个百分点，需阅读附注确认原因。")
        : check("receivables", "回款压力", "steady", "应收增速未明显快于收入", `应收同比 ${evidence(receivableGrowth)} · 收入同比 ${evidence(revenueGrowth)}`, "规则未触发不等于没有信用或回款风险。"),
    inventoryGap === null
      ? check("inventory", "存货变化", "unknown", "无法判断", "缺少去年同期存货或营业收入", "存货增长快于收入可能来自备货，也可能反映销售压力。")
      : inventoryGap > 15
        ? check("inventory", "存货变化", "watch", "存货增长快于收入", `存货同比 ${evidence(inventoryGrowth)} · 收入同比 ${evidence(revenueGrowth)}`, "需要结合行业周期和跌价准备核实。")
        : check("inventory", "存货变化", "steady", "存货增速未明显快于收入", `存货同比 ${evidence(inventoryGrowth)} · 收入同比 ${evidence(revenueGrowth)}`, "仍应关注存货结构和减值，而不只看总额。"),
    debtRatio === null
      ? check("debt", "财务压力", "unknown", "无法判断", "缺少总资产或总负债", "资产负债率需要结合行业商业模式解释。")
      : debtRatio > 70
        ? check("debt", "财务压力", "attention", "资产负债率高于预设关注线", `资产负债率 ${debtRatio.toFixed(1)}%`, "高负债并非自动等于高风险，需要检查利息、期限和现金流。")
        : check("debt", "财务压力", "steady", "资产负债率未触发预设关注线", `资产负债率 ${debtRatio.toFixed(1)}%`, "不同行业的合理负债水平不同，本工具不替代同行比较。"),
  ];
  const publicPeriods = periods.slice(-8).reverse().map((period) => ({ ...period, debt_ratio: period.total_assets && period.total_liabilities !== null ? period.total_liabilities / period.total_assets * 100 : null }));
  return {
    code, name: code, report_date: latest.report_date,
    headline: { revenue: latest.revenue, revenue_yoy: revenueGrowth, net_profit: latest.net_profit, profit_yoy: profitGrowth, deducted_net_profit: latest.deducted_net_profit, deducted_profit_yoy: deductedProfitGrowth, roe: null, operating_cash_flow: latest.operating_cash_flow, cash_conversion: cashConversion, debt_ratio: debtRatio },
    checks, periods: publicPeriods,
    coverage: { known_checks: checks.filter((item) => item.state !== "unknown").length, total_checks: checks.length },
    data_status: { source: "新浪财经公开财务报表", indicator_source: null, is_demo: false, updated_at: new Date().toISOString(), message: "三张公开报表按相同报告日合并；季度累计值不可直接与上一季度比较。" },
    methodology: { comparison: "同比使用相同报告日；季度累计值不与上一季度直接比较", cash_rule: "经营现金流净额 ÷ 净利润金额；不会用现金流占收入百分比代替", disclaimer: "财报体检仅做数据勾稽和异常提示，不构成盈利预测或买卖建议。" },
  };
}

export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await context.params;
  const code = rawCode.trim();
  if (!/^\d{6}$/.test(code)) return NextResponse.json({ message: "请输入 6 位 A 股代码" }, { status: 400 });
  const cacheKey = `financial:${code}:v1`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const useBackend = Boolean(process.env.ANXIN_API_URL) || process.env.NODE_ENV !== "production";
    if (useBackend) {
      try {
        const baseUrl = (process.env.ANXIN_API_URL || DEFAULT_ANXIN_API_URL).replace(/\/$/, "");
        const response = await fetch(`${baseUrl}/stocks/${code}/financial-health`, { cache: "no-store", signal: controller.signal, headers: { accept: "application/json" } });
        if (response.ok) { const payload = await response.json(); storeCached(cacheKey, payload); return NextResponse.json(payload); }
      } catch { /* Continue to the public server-side fallback. */ }
    }
    const payload = await publicFinancialHealth(code, controller.signal); storeCached(cacheKey, payload); return NextResponse.json(payload, { headers: { "cache-control": "public, max-age=3600, stale-while-revalidate=86400" } });
  } catch (error) {
    const cached = readCached<Record<string, unknown>>(cacheKey, 7 * 24 * 60 * 60 * 1000);
    if (cached) return NextResponse.json({ ...cached.value, data_status: { ...((cached.value.data_status as Record<string, unknown> | undefined) ?? {}), mode: "cached", cached_at: cached.cachedAt, message: "公开财报源暂不可用，当前显示最近一次成功读取的报表。" } });
    return NextResponse.json({ message: error instanceof Error && error.name === "AbortError" ? "财报读取超时，请稍后重试" : `财报服务暂不可用；没有使用演示结果代替。${error instanceof Error ? ` ${error.message}` : ""}` }, { status: 503 });
  } finally { clearTimeout(timeout); }
}
