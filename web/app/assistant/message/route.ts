import { NextResponse } from "next/server";

import { handleAssistantMessage } from "../../lib/assistant-server";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const message = typeof payload.message === "string" ? payload.message.trim().slice(0, 4000) : "";
    if (!message) return NextResponse.json({ message: "请先输入内容" }, { status: 400 });
    return NextResponse.json(await handleAssistantMessage({
      message,
      session_id: typeof payload.session_id === "string" ? payload.session_id.slice(0, 120) : undefined,
      workspace_id: typeof payload.workspace_id === "string" ? payload.workspace_id.slice(0, 120) : undefined,
      route: typeof payload.route === "string" ? payload.route.slice(0, 240) : undefined,
      selected_provider: typeof payload.selected_provider === "string" ? payload.selected_provider.slice(0, 120) : undefined,
      history: Array.isArray(payload.history) ? payload.history.slice(-10).flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const row = item as { role?:unknown; content?:unknown };
        if ((row.role !== "user" && row.role !== "assistant") || typeof row.content !== "string") return [];
        return [{ role:row.role, content:row.content.slice(0,1800) }];
      }) : undefined,
    }));
  } catch (error) {
    const content = error instanceof Error ? error.message : "AI 助手暂时不可用";
    return NextResponse.json({ type:"error_message", content, message:{type:"error_message",content}, fallback_available:true, suggested_actions:["重试","切换模型","使用规则版结果"] }, { status: 503 });
  }
}
