import { NextResponse } from "next/server";
import { readCached, storeCached } from "../../../lib/data-cache";

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
type SourceStatus = {
  id: string;
  name: string;
  status: "available" | "failed" | "not_configured" | "authorization_required";
  detail: string;
};

function marketPrefix(code: string) {
  if (code.startsWith("5") || code.startsWith("6") || code.startsWith("9")) return "sh";
  if (code.startsWith("4") || code.startsWith("8")) return "bj";
  return "sz";
}

function eastmoneySecid(code: string) {
  return `${code.startsWith("5") || code.startsWith("6") || code.startsWith("9") ? "1" : "0"}.${code}`;
}

function ifindCode(code: string) {
  return `${code}.${code.startsWith("5") || code.startsWith("6") || code.startsWith("9") ? "SH" : code.startsWith("4") || code.startsWith("8") ? "BJ" : "SZ"}`;
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

function normalizeIfindHistory(payload: unknown): { data: HistoryPoint[]; source: string; is_demo: false } | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const table = (payload as { tables?: Array<{ time?: unknown[]; table?: Record<string, unknown[]> }> }).tables?.[0];
  const dates = Array.isArray(table?.time) ? table.time : [];
  const closes = Array.isArray(table?.table?.close) ? table.table.close : [];
  const volumes = Array.isArray(table?.table?.volume) ? table.table.volume : [];
  const data = closes.map((value, index) => ({
    date: String(dates[index] ?? "").slice(0, 10),
    close: Number(value),
    volume: Number(volumes[index]) || undefined,
  })).filter((point) => /^\d{4}-\d{2}-\d{2}$/.test(point.date) && Number.isFinite(point.close));
  return data.length ? { data: data.slice(-260), source: "同花顺 iFinD 官方接口", is_demo: false } : undefined;
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

async function requestJson(url: string, timeoutMs: number, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      ...init,
      headers: { accept: "application/json", ...init.headers },
    });
    if (!response.ok) throw new Error(`upstream ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function getIfindAccessToken() {
  if (process.env.IFIND_ACCESS_TOKEN) return process.env.IFIND_ACCESS_TOKEN;
  if (!process.env.IFIND_REFRESH_TOKEN) throw new Error("iFinD 未配置授权 Token");
  const cached = readCached<string>("ifind:access-token", 6 * 24 * 60 * 60 * 1000);
  if (cached?.value) return cached.value;
  const payload = await requestJson("https://quantapi.51ifind.com/api/v1/get_access_token", 8_000, {
    method: "POST",
    headers: { "content-type": "application/json", refresh_token: process.env.IFIND_REFRESH_TOKEN },
  }) as { data?: { access_token?: string } };
  const token = payload.data?.access_token;
  if (!token) throw new Error("iFinD 授权失败或当前账号无数据接口权限");
  return storeCached("ifind:access-token", token);
}

async function requestIfindHistory(code: string) {
  const accessToken = await getIfindAccessToken();
  const end = new Date();
  const start = new Date(end.getTime() - 460 * 24 * 60 * 60 * 1000);
  const format = (date: Date) => date.toISOString().slice(0, 10);
  return requestJson("https://quantapi.51ifind.com/api/v1/cmd_history_quotation", 12_000, {
    method: "POST",
    headers: { "content-type": "application/json", access_token: accessToken, ifindlang: "cn" },
    body: JSON.stringify({
      codes: ifindCode(code),
      indicators: "close,volume",
      startdate: format(start),
      enddate: format(end),
      functionpara: { Interval: "D", CPS: "1", Fill: "Omit" },
    }),
  });
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
  const cacheKey = `information:${code}:v2`;

  const baseUrl = (process.env.DAILY_STOCK_ANALYSIS_URL || DEFAULT_DSA_URL).replace(/\/$/, "");
  const dataBaseUrl = (process.env.ANXIN_API_URL || "http://127.0.0.1:8001").replace(/\/$/, "");
  const quoteUrl = `${baseUrl}/api/v1/stocks/${code}/quote`;
  const historyUrl = `${baseUrl}/api/v1/stocks/${code}/history?period=daily&days=260`;
  const fallbackHistoryUrl = `${dataBaseUrl}/stocks/${code}/prices?days=260`;
  const validationUrl = `${dataBaseUrl}/stocks/search?q=${encodeURIComponent(code)}&limit=5`;
  const publicHistoryUrl = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${marketPrefix(code)}${code},day,,,260,qfq`;
  const eastmoneyHistoryUrl = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${eastmoneySecid(code)}&klt=101&fqt=1&lmt=260&end=20500101&iscca=1&fields1=f1,f2,f3,f4,f5,f6,f7,f8&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61`;
  const useLocalDefaults = process.env.NODE_ENV !== "production";
  const ifindConfigured = Boolean(process.env.IFIND_ACCESS_TOKEN || process.env.IFIND_REFRESH_TOKEN);
  const [validationResult, quoteResult, historyResult, fallbackHistoryResult, publicHistoryResult, eastmoneyHistoryResult, ifindHistoryResult] = await Promise.allSettled([
    process.env.ANXIN_API_URL || useLocalDefaults ? requestJson(validationUrl, 4_000) : Promise.reject(new Error("FastAPI not configured")),
    process.env.DAILY_STOCK_ANALYSIS_URL || useLocalDefaults ? requestJson(quoteUrl, 4_000) : Promise.reject(new Error("daily_stock_analysis not configured")),
    process.env.DAILY_STOCK_ANALYSIS_URL || useLocalDefaults ? requestJson(historyUrl, 6_000) : Promise.reject(new Error("daily_stock_analysis not configured")),
    process.env.ANXIN_API_URL || useLocalDefaults ? requestJson(fallbackHistoryUrl, 12_000) : Promise.reject(new Error("FastAPI not configured")),
    requestJson(publicHistoryUrl, 10_000),
    requestJson(eastmoneyHistoryUrl, 10_000),
    ifindConfigured ? requestIfindHistory(code) : Promise.reject(new Error("iFinD 未配置授权 Token")),
  ]);

  let rejectedByLocalStockList = false;
  if (validationResult.status === "fulfilled") {
    const validation = validationResult.value as StockSearchPayload;
    const exactMatch = validation.items?.some((item) => String(item.code ?? "").padStart(6, "0") === code);
    rejectedByLocalStockList = !validation.is_demo && !exactMatch;
  }

  const result: UpstreamResult = {};
  if (quoteResult.status === "fulfilled") result.quote = quoteResult.value;
  else result.quoteError = quoteResult.reason instanceof Error ? quoteResult.reason.message : "quote unavailable";
  const historyCandidates: Array<{ data: HistoryPoint[]; source?: string; is_demo?: boolean; priority: number }> = [];
  if (historyResult.status === "fulfilled") {
    const normalized = normalizeHistory(historyResult.value);
    if (normalized?.is_demo) result.historyError = "演示价格不会进入正式研究";
    else if (normalized) historyCandidates.push({ ...normalized, source: normalized.source || "daily_stock_analysis", priority: 5 });
  } else result.historyError = historyResult.reason instanceof Error ? historyResult.reason.message : "history unavailable";
  if (fallbackHistoryResult.status === "fulfilled") {
    const normalized = normalizeHistory(fallbackHistoryResult.value);
    if (normalized?.is_demo) result.fallbackHistoryError = "演示价格不会进入正式研究";
    else if (normalized) historyCandidates.push({ ...normalized, source: normalized.source || "安心看股 FastAPI", priority: 3 });
  } else {
    result.fallbackHistoryError = fallbackHistoryResult.reason instanceof Error ? fallbackHistoryResult.reason.message : "fallback history unavailable";
  }
  if (publicHistoryResult.status === "fulfilled") {
    const normalized = normalizeTencentHistory(publicHistoryResult.value, code);
    if (normalized) historyCandidates.push({ ...normalized, priority: 2 });
  }
  if (eastmoneyHistoryResult.status === "fulfilled") {
    const normalized = normalizeEastmoneyHistory(eastmoneyHistoryResult.value);
    if (normalized) historyCandidates.push({ ...normalized, priority: 1 });
  }
  if (ifindHistoryResult.status === "fulfilled") {
    const normalized = normalizeIfindHistory(ifindHistoryResult.value);
    if (normalized) historyCandidates.push({ ...normalized, priority: 4 });
  }
  result.history = historyCandidates.sort((left, right) => right.data.length - left.data.length || right.priority - left.priority)[0];
  if (!result.quote && result.history) result.quote = quoteFromHistory(result.history as { data: HistoryPoint[] }, code);

  if (!result.quote && !result.history) {
    const cached = readCached<Record<string, unknown>>(cacheKey, 24 * 60 * 60 * 1000);
    if (cached) return NextResponse.json({ ...cached.value, status: "cached", cachedAt: cached.cachedAt, cacheAgeSeconds: cached.ageSeconds, message: "实时行情源暂不可用，当前显示最近一次成功读取的数据。" });
    if (rejectedByLocalStockList) {
      return NextResponse.json(
        { status: "invalid", message: `没有从已连接的数据源找到代码 ${code}，请检查代码后重试。` },
        { status: 404 },
      );
    }
    return NextResponse.json(
      {
        status: "fallback",
        provider: "daily_stock_analysis",
        message: "实时数据服务暂不可用；没有使用样例行情代替。",
        diagnostics: { quote: result.quoteError, history: result.historyError, fallbackHistory: result.fallbackHistoryError },
      },
      { status: 503 },
    );
  }

  const payload = {
    status: quoteResult.status === "fulfilled" && historyResult.status === "fulfilled" ? "live" : "partial",
    provider: (result.history as { source?: string } | undefined)?.source || (quoteResult.status === "fulfilled" ? "daily_stock_analysis · 公开行情" : "公开行情备用源"),
    fetchedAt: new Date().toISOString(),
    sources: [
      { id: "daily_stock_analysis", name: "daily_stock_analysis", status: historyResult.status === "fulfilled" && Boolean(normalizeHistory(historyResult.value)) ? "available" : process.env.DAILY_STOCK_ANALYSIS_URL || useLocalDefaults ? "failed" : "not_configured", detail: process.env.DAILY_STOCK_ANALYSIS_URL || useLocalDefaults ? "自托管分析底座" : "未配置服务地址" },
      { id: "ifind", name: "同花顺 iFinD", status: !ifindConfigured ? "authorization_required" : ifindHistoryResult.status === "fulfilled" && Boolean(normalizeIfindHistory(ifindHistoryResult.value)) ? "available" : "failed", detail: !ifindConfigured ? "需 iFinD 账号授权，Token 仅保存在服务器" : "官方 HTTP 数据接口" },
      { id: "tencent", name: "腾讯证券公开行情", status: publicHistoryResult.status === "fulfilled" && Boolean(normalizeTencentHistory(publicHistoryResult.value, code)) ? "available" : "failed", detail: "公开日线备用源" },
      { id: "eastmoney", name: "东方财富公开行情", status: eastmoneyHistoryResult.status === "fulfilled" && Boolean(normalizeEastmoneyHistory(eastmoneyHistoryResult.value)) ? "available" : "failed", detail: "公开日线备用源；非 Choice 商用数据授权" },
    ] satisfies SourceStatus[],
    ...result,
  };
  storeCached(cacheKey, payload);
  return NextResponse.json(payload, { headers: { "cache-control": "public, max-age=30, stale-while-revalidate=300" } });
}
