import { NextResponse } from "next/server";

type EastmoneyIndex = {
  f2?: number;
  f3?: number;
  f4?: number;
  f12?: string;
  f14?: string;
  f124?: number;
};

const INDEXES = [
  { code: "000001", name: "上证指数", secid: "1.000001" },
  { code: "000300", name: "沪深300", secid: "1.000300" },
  { code: "399006", name: "创业板指", secid: "0.399006" },
];

export async function GET() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const url = new URL("https://push2.eastmoney.com/api/qt/ulist.np/get");
    url.searchParams.set("fltt", "2");
    url.searchParams.set("fields", "f2,f3,f4,f12,f14,f124");
    url.searchParams.set("secids", INDEXES.map((item) => item.secid).join(","));
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: { accept: "application/json", "user-agent": "Mozilla/5.0" },
    });
    if (!response.ok) throw new Error(`upstream ${response.status}`);
    const payload = await response.json() as { data?: { diff?: EastmoneyIndex[] } };
    const rows = payload.data?.diff ?? [];
    const items = INDEXES.map((definition) => {
      const row = rows.find((item) => String(item.f12 ?? "") === definition.code);
      if (!row || !Number.isFinite(row.f2) || !Number.isFinite(row.f3)) return undefined;
      return {
        code: definition.code,
        name: definition.name,
        value: Number(row.f2),
        change: Number(row.f3),
        change_value: Number(row.f4 ?? 0),
        updated_at: row.f124 ? new Date(row.f124 * 1_000).toISOString() : undefined,
      };
    }).filter(Boolean);
    if (items.length === 0) throw new Error("empty market response");
    return NextResponse.json({
      status: items.length === INDEXES.length ? "live" : "partial",
      source: "东方财富公开行情",
      fetched_at: new Date().toISOString(),
      items,
    });
  } catch (error) {
    return NextResponse.json({
      status: "unavailable",
      source: "东方财富公开行情",
      fetched_at: new Date().toISOString(),
      message: error instanceof Error && error.name === "AbortError" ? "指数行情请求超时" : "指数行情暂不可用",
      items: [],
    }, { status: 503 });
  } finally {
    clearTimeout(timeout);
  }
}
