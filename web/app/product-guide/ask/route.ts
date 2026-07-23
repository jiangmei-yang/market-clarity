import { NextResponse } from "next/server";
import { searchPlatformCapabilityIndex } from "@/app/lib/capability-index-server";
import type { CapabilityHit } from "@/app/lib/capability-rag";

function names(items: CapabilityHit[]) {
  return items.slice(0, 5).map((item) => item.name).join("、");
}

function buildAnswer(hits: CapabilityHit[]) {
  if (!hits.length) return "当前能力知识库没有找到足够相关的已注册功能。你可以换一种说法，或询问已上线功能、AI 降级使用、产品差异、演示路径和测试中能力。";
  const ready = hits.filter((item) => item.status === "available");
  const beta = hits.filter((item) => item.status === "beta");
  const unavailable = hits.filter((item) => item.status === "unavailable" || item.status === "disabled");
  const lines = [`与你的问题最相关的是：${names(hits)}。`];
  if (ready.length) lines.push(`现在可以使用：${names(ready)}。`);
  if (beta.length) lines.push(`仍在测试：${names(beta)}；演示时应明确说明其测试状态。`);
  if (unavailable.length) lines.push(`当前不可用或未启用：${names(unavailable)}。`);
  const limits = [...new Set(hits.flatMap((item) => item.limitations).filter(Boolean))].slice(0, 3);
  if (limits.length) lines.push(`需要说明的边界：${limits.join("；")}。`);
  const openable = hits.find((item) => item.route && (item.status === "available" || item.status === "beta"));
  if (openable) lines.push(`可以从“${openable.name}”开始现场展示。`);
  return lines.join("\n");
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { query?: unknown };
  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) return NextResponse.json({ error: "请输入你想了解的产品问题" }, { status: 400 });
  const result = await searchPlatformCapabilityIndex(query, { limit: 8 });
  return NextResponse.json({
    type: "capability_rag_answer",
    query,
    answer: buildAnswer(result.hits),
    sources: result.hits.map((item) => ({
      capability_id: item.capability_id,
      name: item.name,
      category: item.category,
      status: item.status,
      route: item.route,
      version: item.version,
      last_updated: item.last_updated,
      why_relevant: item.why_relevant,
    })),
    index: result.index,
    runtime: result.runtime,
    note: "回答只依据当前 Capability Registry 与运行状态生成，不会猜测尚未注册的功能。",
  });
}
