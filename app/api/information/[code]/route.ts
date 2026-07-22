import { NextResponse } from "next/server";

const DEFAULT_DSA_URL = "http://127.0.0.1:8000";

type UpstreamResult = {
  quote?: unknown;
  history?: unknown;
  quoteError?: string;
  historyError?: string;
  fallbackHistoryError?: string;
};

type HistoryPoint = { date?: string; close?: number; volume?: number };
type StockSearchPayload = { items?: Array<{ code?: string }>; is_demo?: boolean };

function marketPrefix(code: string) {
  if (code.startsWith("6")) return "sh";
  if (code.startsWith("4") || code.startsWith("8")) return "bj";
  return "sz";
}

function eastmoneySecid(code: string) {
  return `${code.startsWith("6") ? "1" : "0"}.${code}`;
}

function normalizeTencentHistory(payload: unknown, code: string): { data: HistoryPoint[]; source: string; is_demo: false } | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const key = `${marketPrefix(code)}${code}`;
  const record = (payload as { data?: Record<string, { qfqday?: unknown[][]; day?: unknown[][] }> }).data?.[key];
  const rows = record?.qfqday ?? record?.day ?? [];
  const data = rows.map((row) => ({ date: String(row[0] ?? ""), close: Number(row[2]), volume: Number(row[5]) }))
    .filter((point) => point.date && Number.isFinite(point.close));
  return data.length ? { data, source: "腾讯证券公开行情", is_demo: false } : undefined;
}

function normalizeEastmoneyHistory(payload: unknown): { data: HistoryPoint[]; source: string; is_demo: false } | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const rows = (payload as { data?: { klines?: string[] } }).data?.klines ?? [];
  const data = rows.map((row) => {
    const fields = row.split(",");
    return { date: fields[0], close: Number(fields[2]), volume: Number(fields[5]) };
  }).filter((point) => point.date && Number.isFinite(point.close));
  return data.length ? { data, source: "东方财富公开历史行情", is_demo: false } : undefined;
}

function normalizeHistory(payload: unknown): { data: HistoryPoint[]; source?: string; is_demo?: boolean } | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const record = payload as { data?: unknown[]; items?: unknown[]; source?: string; is_demo?: boolean };
  const points = Array.isArray(record.data) ? record.data : Array.isArray(record.items) ? record.items : [];
  if (!points.length) return undefined;
  return { data: points.slice(-260) as HistoryPoint[], source: record.source, is_demo: record.is_demo };
}

function quoteFromHistory(history: { data: HistoryPoint[] } | undefined, code: string) {
  if (!history?.data.length) return undefined;
  const latest = history.data.at(-1);
  const previous = history.data.at(-2);
  if (typeof latest?.close !== "number") return undefined;
  const change = typeof previous?.close === "number" && previous.close !== 0
    ? (latest.close / previous.close - 1) * 100
    : 0;
  return {
    stock_code: code,
    current_price: latest.close,
    change_percent: change,
    update_time: latest.date,
  };
}

async function requestJson(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error(`upstream ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code: rawCode } = await context.params;
  const code = rawCode.trim();
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json(
      { status: "invalid", message: "请输入 6 位 A 股代码" },
      { status: 400 },
    );
  }

  const baseUrl = (process.env.DAILY_STOCK_ANALYSIS_URL || DEFAULT_DSA_URL).replace(/\/$/, "");
  const dataBaseUrl = (process.env.ANXIN_API_URL || "http://127.0.0.1:8001").replace(/\/$/, "");
  const quoteUrl = `${baseUrl}/api/v1/stocks/${code}/quote`;
  const historyUrl = `${baseUrl}/api/v1/stocks/${code}/history?period=daily&days=260`;
  const fallbackHistoryUrl = `${dataBaseUrl}/stocks/${code}/prices?days=260`;
  const validationUrl = `${dataBaseUrl}/stocks/search?q=${encodeURIComponent(code)}&limit=5`;
  const publicHistoryUrl = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${marketPrefix(code)}${code},day,,,260,qfq`;
  const eastmoneyHistoryUrl = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${eastmoneySecid(code)}&klt=101&fqt=1&lmt=260&end=20500101&iscca=1&fields1=f1,f2,f3,f4,f5,f6,f7,f8&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61`;
  const useLocalDefaults = process.env.NODE_ENV !== "production";
  const [validationResult, quoteResult, historyResult, fallbackHistoryResult, publicHistoryResult, eastmoneyHistoryResult] = await Promise.allSettled([
    process.env.ANXIN_API_URL || useLocalDefaults ? requestJson(validationUrl, 4_000) : Promise.reject(new Error("FastAPI not configured")),
    process.env.DAILY_STOCK_ANALYSIS_URL || useLocalDefaults ? requestJson(quoteUrl, 4_000) : Promise.reject(new Error("daily_stock_analysis not configured")),
    process.env.DAILY_STOCK_ANALYSIS_URL || useLocalDefaults ? requestJson(historyUrl, 6_000) : Promise.reject(new Error("daily_stock_analysis not configured")),
    process.env.ANXIN_API_URL || useLocalDefaults ? requestJson(fallbackHistoryUrl, 12_000) : Promise.reject(new Error("FastAPI not configured")),
    requestJson(publicHistoryUrl, 10_000),
    requestJson(eastmoneyHistoryUrl, 10_000),
  ]);

  if (validationResult.status === "fulfilled") {
    const validation = validationResult.value as StockSearchPayload;
    const exactMatch = validation.items?.some((item) => String(item.code ?? "").padStart(6, "0") === code);
    if (!validation.is_demo && !exactMatch) {
      return NextResponse.json(
        { status: "invalid", message: `没有在最近的 A 股证券名单中找到代码 ${code}，请检查代码后重试。` },
        { status: 404 },
      );
    }
  }

  const result: UpstreamResult = {};
  if (quoteResult.status === "fulfilled") result.quote = quoteResult.value;
  else result.quoteError = quoteResult.reason instanceof Error ? quoteResult.reason.message : "quote unavailable";
  const historyCandidates: Array<{ data: HistoryPoint[]; source?: string; is_demo?: boolean }> = [];
  if (historyResult.status === "fulfilled") {
    const normalized = normalizeHistory(historyResult.value);
    if (normalized?.is_demo) result.historyError = "演示价格不会进入正式研究";
    else if (normalized) historyCandidates.push({ ...normalized, source: normalized.source || "daily_stock_analysis" });
  } else result.historyError = historyResult.reason instanceof Error ? historyResult.reason.message : "history unavailable";
  if (fallbackHistoryResult.status === "fulfilled") {
    const normalized = normalizeHistory(fallbackHistoryResult.value);
    if (normalized?.is_demo) result.fallbackHistoryError = "演示价格不会进入正式研究";
    else if (normalized) historyCandidates.push({ ...normalized, source: normalized.source || "安心看股 FastAPI" });
  } else {
    result.fallbackHistoryError = fallbackHistoryResult.reason instanceof Error ? fallbackHistoryResult.reason.message : "fallback history unavailable";
  }
  if (publicHistoryResult.status === "fulfilled") {
    const normalized = normalizeTencentHistory(publicHistoryResult.value, code);
    if (normalized) historyCandidates.push(normalized);
  }
  if (eastmoneyHistoryResult.status === "fulfilled") {
    const normalized = normalizeEastmoneyHistory(eastmoneyHistoryResult.value);
    if (normalized) historyCandidates.push(normalized);
  }
  result.history = historyCandidates.sort((left, right) => right.data.length - left.data.length)[0];
  if (!result.quote && result.history) result.quote = quoteFromHistory(result.history as { data: HistoryPoint[] }, code);

  if (!result.quote && !result.history) {
    return NextResponse.json(
      {
        status: "fallback",
        provider: "daily_stock_analysis",
        message: "实时数据服务暂不可用，前端将保留样例数据并明确标注。",
        diagnostics: { quote: result.quoteError, history: result.historyError, fallbackHistory: result.fallbackHistoryError },
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    status: quoteResult.status === "fulfilled" && historyResult.status === "fulfilled" ? "live" : "partial",
    provider: (result.history as { source?: string } | undefined)?.source || (quoteResult.status === "fulfilled" ? "daily_stock_analysis · 公开行情" : "公开行情备用源"),
    fetchedAt: new Date().toISOString(),
    ...result,
  });
}
