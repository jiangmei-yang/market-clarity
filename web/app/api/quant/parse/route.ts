import { NextResponse } from "next/server";
import { parseQuantQuestion } from "../../../lib/quant-verification";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { question?: unknown; stockCode?: unknown };
    const question = typeof body.question === "string" ? body.question : "";
    const stockCode = typeof body.stockCode === "string" ? body.stockCode.trim() : "";
    if (!/^\d{6}$/.test(stockCode)) return NextResponse.json({ status: "invalid", message: "请输入 6 位 A 股代码" }, { status: 400 });
    return NextResponse.json({ status: "ready", parserMode: "local", hypothesis: parseQuantQuestion(question, stockCode), message: "已使用本地规则生成候选条件；运行前请逐项确认。" });
  } catch (error) {
    return NextResponse.json({ status: "invalid", message: error instanceof Error ? error.message : "无法理解这条历史问题" }, { status: 422 });
  }
}
