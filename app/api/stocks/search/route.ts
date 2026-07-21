import { NextResponse } from "next/server";

type EastmoneySuggestion = {
  Code?: string;
  Name?: string;
  Classify?: string;
  SecurityTypeName?: string;
};

async function searchPublicAStocks(query: string, limit: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(query)}&type=14&token=D43BF722C8E33BDC906FB84D85E326E8&count=${limit * 2}`, {
      cache: "no-store",
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error(`public search ${response.status}`);
    const payload = await response.json() as { QuotationCodeTable?: { Data?: EastmoneySuggestion[] } };
    return (payload.QuotationCodeTable?.Data ?? [])
      .filter((item) => item.Classify === "AStock" && /^\d{6}$/.test(item.Code ?? ""))
      .slice(0, limit)
      .map((item) => ({ code: item.Code, name: item.Name || item.Code, industry: `${item.SecurityTypeName || "A股"} · 行业待载入` }));
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim().slice(0, 30) || "";
  const limit = Math.min(10, Math.max(1, Number(url.searchParams.get("limit")) || 5));
  if (!query) return NextResponse.json({ query, items: [] });

  const baseUrl = (process.env.ANXIN_API_URL || "http://127.0.0.1:8001").replace(/\/$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${baseUrl}/stocks/search?q=${encodeURIComponent(query)}&limit=${limit}`, {
      cache: "no-store",
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error(`upstream ${response.status}`);
    const payload = await response.json() as { items?: unknown[]; source?: string; is_demo?: boolean };
    return NextResponse.json({ query, items: Array.isArray(payload.items) ? payload.items : [], source: payload.source, is_demo: payload.is_demo });
  } catch (error) {
    try {
      const items = await searchPublicAStocks(query, limit);
      return NextResponse.json({ query, items, source: "东方财富公开股票搜索", is_demo: false, status: items.length ? "live_fallback" : "empty" });
    } catch {
      return NextResponse.json({ query, items: [], status: "unavailable", message: error instanceof Error ? error.message : "股票搜索暂不可用" }, { status: 503 });
    }
  } finally {
    clearTimeout(timeout);
  }
}
