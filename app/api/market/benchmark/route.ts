import { NextResponse } from "next/server";
import { readCached, storeCached } from "../../../lib/data-cache";
import { freshness, reliabilityFromFreshness, reliability } from "../../../lib/failure-control";

type Point = { date: string; close: number };

export async function GET() {
  const cacheKey = "market:benchmark:000300:v1";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const url = "https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=1.000300&klt=101&fqt=1&lmt=260&end=20500101&iscca=1&fields1=f1,f2,f3,f4,f5,f6,f7,f8&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61";
    const response = await fetch(url, { cache: "no-store", signal: controller.signal, headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`upstream ${response.status}`);
    const payload = await response.json() as { data?: { klines?: string[] } };
    const data: Point[] = (payload.data?.klines ?? []).map((row) => { const fields = row.split(","); return { date: fields[0], close: Number(fields[2]) }; }).filter((point) => point.date && Number.isFinite(point.close));
    if (data.length < 2) throw new Error("benchmark empty");
    const dataTimestamp=data.at(-1)?.date??null;const fresh=freshness("market_daily",dataTimestamp,"东方财富公开历史行情");
    const result = { status: "healthy", code: "000300", name: "沪深300", source: "东方财富公开历史行情", fetched_at: new Date().toISOString(),data_timestamp:dataTimestamp,updated_at:fresh.updated_at,max_age:fresh.max_age,freshness_status:fresh.freshness_status,fallback_source:fresh.fallback_source,reliability:reliabilityFromFreshness(fresh), data };
    storeCached(cacheKey, result);
    return NextResponse.json(result, { headers: { "cache-control": "public, max-age=300, stale-while-revalidate=3600" } });
  } catch {
    const cached = readCached<Record<string, unknown>>(cacheKey, 24 * 60 * 60 * 1000);
    if (cached) return NextResponse.json({ ...cached.value, status: "stale", cached_at: cached.cachedAt, freshness_status:"stale",message: "基准行情源暂不可用，显示最近缓存。",reliability:reliability({status:"stale",last_success_at:cached.cachedAt,data_timestamp:String(cached.value.data_timestamp??cached.cachedAt),error_code:"BENCHMARK_SOURCE_FAILED",message:"缓存基准不用于生成新信号",retryable:true,fallback_used:"内存缓存",allow_signal:false}) });
    return NextResponse.json({ status: "unavailable", message: "沪深300基准行情暂不可用",reliability:reliability({status:"unavailable",error_code:"BENCHMARK_UNAVAILABLE",message:"基准缺失，回测必须阻断",retryable:true,allow_signal:false}), data: [] }, { status: 503 });
  } finally { clearTimeout(timeout); }
}
