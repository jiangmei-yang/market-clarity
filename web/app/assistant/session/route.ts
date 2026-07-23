import { NextResponse } from "next/server";

import { assistantSessionSummary } from "../../lib/assistant-server";

export async function GET() {
  try {
    return NextResponse.json(await assistantSessionSummary());
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "会话暂时不可用" }, { status: 503 });
  }
}
