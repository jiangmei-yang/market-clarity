import { NextResponse } from "next/server";

import { cancelAssistantCommand } from "../../../../lib/assistant-server";

export async function POST(_: Request, context: { params: Promise<{ command_id: string }> }) {
  try {
    const { command_id: commandId } = await context.params;
    return NextResponse.json(await cancelAssistantCommand(commandId));
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "无法取消配置" }, { status: 404 });
  }
}
