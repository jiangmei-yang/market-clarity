import { NextResponse } from "next/server";

import { exportAssistantWorkspace } from "../../lib/assistant-server";

export async function GET(request: Request) {
  try {
    const workspaceId = new URL(request.url).searchParams.get("workspace_id") ?? undefined;
    return NextResponse.json(await exportAssistantWorkspace(workspaceId), { headers: { "content-disposition": "attachment; filename=anxin-workspace.json" } });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "无法导出配置" }, { status: 503 });
  }
}
