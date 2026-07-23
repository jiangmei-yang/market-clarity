import { NextResponse } from "next/server";
import { searchPublicEtfs } from "../../../lib/etf-public";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const keyword = url.searchParams.get("keyword")?.trim().slice(0, 50) || "";
  const limit = Math.min(20, Math.max(1, Number(url.searchParams.get("limit")) || 8));
  if (!keyword) return NextResponse.json({ items: [], data_status: { mode: "empty", message: "请输入 ETF 代码或名称。" } });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const useBackend = Boolean(process.env.ANXIN_API_URL) || process.env.NODE_ENV !== "production";
    if (useBackend) {
      try {
        const baseUrl = (process.env.ANXIN_API_URL || "http://127.0.0.1:8001").replace(/\/$/, "");
        const response = await fetch(`${baseUrl}/etf/search?keyword=${encodeURIComponent(keyword)}&limit=${limit}`, { cache: "no-store", signal: controller.signal, headers: { accept: "application/json" } });
        if (response.ok) return NextResponse.json(await response.json());
      } catch { /* Continue to public server-side fallback. */ }
    }
    return NextResponse.json(await searchPublicEtfs(keyword, limit, controller.signal));
  } catch (error) {
    return NextResponse.json({ items: [], message: `ETF 数据服务暂时没有响应；没有使用演示持仓替代。${error instanceof Error ? ` ${error.message}` : ""}` }, { status: 503 });
  } finally { clearTimeout(timeout); }
}
