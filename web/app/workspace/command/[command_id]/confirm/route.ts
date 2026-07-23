import { NextResponse } from "next/server";

import { confirmAssistantCommand } from "../../../../lib/assistant-server";

export async function POST(request: Request, context: { params: Promise<{ command_id: string }> }) {
  try {
    const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (payload.confirmed !== true) return NextResponse.json({ message: "只有明确确认后才能应用配置" }, { status: 422 });
    const { command_id: commandId } = await context.params;
    return NextResponse.json(await confirmAssistantCommand(commandId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "无法应用配置";
    return NextResponse.json({ message }, { status: message.includes("过期") ? 410 : 409 });
  }
}
