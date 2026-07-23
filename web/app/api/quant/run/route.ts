import { NextResponse } from "next/server";
import { runQuantVerification, type QuantHypothesis } from "../../../lib/quant-verification";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { hypothesis?: QuantHypothesis };
    if (!body.hypothesis || typeof body.hypothesis !== "object") return NextResponse.json({ status: "invalid", message: "缺少检验条件" }, { status: 400 });
    return NextResponse.json({ status: "ready", result: runQuantVerification(body.hypothesis) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "无法完成检验";
    return NextResponse.json({ status: "invalid", message }, { status: message.includes("确认") ? 409 : 422 });
  }
}
