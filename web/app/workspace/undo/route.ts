import { NextResponse } from "next/server";

import { undoAssistantWorkspace } from "../../lib/assistant-server";

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (payload.confirmed !== true) return NextResponse.json({ message: "请明确确认撤销" }, { status: 422 });
    return NextResponse.json(await undoAssistantWorkspace(typeof payload.workspace_id === "string" ? payload.workspace_id : undefined));
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "无法撤销" }, { status: 409 });
  }
}
