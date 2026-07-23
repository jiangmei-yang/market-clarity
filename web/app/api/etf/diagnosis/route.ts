import { NextResponse } from "next/server";
import { diagnosePublicEtfs } from "../../../lib/etf-public";

export async function POST(request: Request) {
  const payload = await request.json();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const useBackend = Boolean(process.env.ANXIN_API_URL) || process.env.NODE_ENV !== "production";
    if (useBackend) {
      try {
        const baseUrl = (process.env.ANXIN_API_URL || "http://127.0.0.1:8001").replace(/\/$/, "");
        const response = await fetch(`${baseUrl}/diagnosis/run`, { method: "POST", cache: "no-store", signal: controller.signal, headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(payload) });
        if (response.ok) {
          const result = await response.json() as { etf_list?: Array<{ holdings_report_date?: string | null; data_status?: { is_demo?: boolean } }> };
          const verified = Array.isArray(result.etf_list) && result.etf_list.length > 0 && result.etf_list.every((item) => Boolean(item.holdings_report_date) && item.data_status?.is_demo !== true);
          if (verified) return NextResponse.json(result);
        }
      } catch { /* Continue to public server-side fallback. */ }
    }
    const etfs = Array.isArray(payload?.etfs) ? payload.etfs.slice(0, 10) : [];
    return NextResponse.json(await diagnosePublicEtfs(etfs, controller.signal));
  } catch (error) {
    return NextResponse.json({ message: `ETF 持仓服务暂时没有响应；未使用演示结果替代本次诊断。${error instanceof Error ? ` ${error.message}` : ""}` }, { status: 503 });
  } finally { clearTimeout(timeout); }
}
