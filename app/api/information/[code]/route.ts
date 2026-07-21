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

function normalizeHistory(payload: unknown): { data: HistoryPoint[]; source?: string; is_demo?: boolean } | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const record = payload as { data?: unknown[]; items?: unknown[]; source?: string; is_demo?: boolean };
  const points = Array.isArray(record.data) ? record.data : Array.isArray(record.items) ? record.items : [];
  if (!points.length) return undefined;
  return { data: points.slice(-30) as HistoryPoint[], source: record.source, is_demo: record.is_demo };
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
  const historyUrl = `${baseUrl}/api/v1/stocks/${code}/history?period=daily&days=30`;
  const fallbackHistoryUrl = `${dataBaseUrl}/stocks/${code}/prices?days=30`;
  const [quoteResult, historyResult, fallbackHistoryResult] = await Promise.allSettled([
    requestJson(quoteUrl, 4_000),
    requestJson(historyUrl, 6_000),
    requestJson(fallbackHistoryUrl, 12_000),
  ]);

  const result: UpstreamResult = {};
  if (quoteResult.status === "fulfilled") result.quote = quoteResult.value;
  else result.quoteError = quoteResult.reason instanceof Error ? quoteResult.reason.message : "quote unavailable";
  if (historyResult.status === "fulfilled") {
    result.history = normalizeHistory(historyResult.value);
  }
  else result.historyError = historyResult.reason instanceof Error ? historyResult.reason.message : "history unavailable";
  if (!result.history && fallbackHistoryResult.status === "fulfilled") {
    result.history = normalizeHistory(fallbackHistoryResult.value);
  } else if (fallbackHistoryResult.status === "rejected") {
    result.fallbackHistoryError = fallbackHistoryResult.reason instanceof Error ? fallbackHistoryResult.reason.message : "fallback history unavailable";
  }
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
    provider: result.quote && historyResult.status === "fulfilled"
      ? "daily_stock_analysis · AKShare / 东方财富等上游"
      : "安心看股 FastAPI · AKShare 公开数据",
    fetchedAt: new Date().toISOString(),
    ...result,
  });
}
