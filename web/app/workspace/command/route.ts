import { NextResponse } from "next/server";

import { createAssistantPreview } from "../../lib/assistant-server";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const command = typeof payload.command === "string" ? payload.command.trim().slice(0, 2000) : "";
    if (!command) return NextResponse.json({ message: "请输入工作台配置要求" }, { status: 400 });
    const result = await createAssistantPreview(command, typeof payload.workspace_id === "string" ? payload.workspace_id : undefined);
    return NextResponse.json({
      command_id: result.commandId,
      current_config: result.current,
      proposed_config: result.parsed.preview,
      patch: result.parsed.patch,
      summary: result.parsed.summary,
      affected_modules: result.parsed.affectedModules,
      recommendation: result.parsed.recommendation ?? null,
      changes: result.parsed.changes,
      warnings: result.parsed.warnings,
      clarification_questions: result.parsed.questions,
      requires_confirmation: true,
      status: "preview",
    });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "无法生成配置预览" }, { status: 503 });
  }
}
