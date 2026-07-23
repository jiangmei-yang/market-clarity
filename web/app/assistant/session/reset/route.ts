import { NextResponse } from "next/server";

import { resetAssistantSession } from "../../../lib/assistant-server";

export async function POST() {
  try {
    return NextResponse.json(await resetAssistantSession());
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "无法重置会话" }, { status: 503 });
  }
}
