import { NextResponse } from "next/server";
import { searchPlatformCapabilityIndex } from "@/app/lib/capability-index-server";
import type { CapabilityHit } from "@/app/lib/capability-rag";

const ENGLISH_NAMES:Record<string,string>={
  workflow_decision_layer:"Research-to-decision workflow",workflow_no_key_fallback:"No-key fallback",workflow_pitch_demo:"90-second product demo",
  page_home:"Home workspace",page_agent:"Task agent",page_workspace:"Modular workspace",page_etf:"ETF diagnosis",page_trade:"Trade review",page_quant:"Low-frequency quant research",page_ai:"AI model settings",page_features:"Product guide",page_privacy:"Data and privacy",
  tool_run_pretrade_check:"Pre-trade check",tool_analyze_social_content:"Social-content risk analysis",tool_get_portfolio_risk:"Portfolio risk check",
};
const CATEGORY_EN:Record<string,string>={page:"Page",tool:"Tool",module:"Module",workflow:"Workflow",provider:"Model",data_source:"Data source",engine:"Research engine",api:"API"};
function englishName(item:CapabilityHit){return ENGLISH_NAMES[item.capability_id]??`${CATEGORY_EN[item.category]??"Capability"} · ${item.route??item.capability_id.replace(/_/g," ")}`;}
function names(items: CapabilityHit[],isEnglish=false) {
  return items.slice(0, 5).map((item) => isEnglish?englishName(item):item.name).join(isEnglish?", ":"、");
}

function buildAnswer(hits: CapabilityHit[],isEnglish=false) {
  if (!hits.length) return isEnglish?"The capability registry did not find a sufficiently relevant registered feature. Try asking about available features, no-key fallback, product differentiation, the demo path or beta capabilities.":"当前能力知识库没有找到足够相关的已注册功能。你可以换一种说法，或询问已上线功能、AI 降级使用、产品差异、演示路径和测试中能力。";
  const ready = hits.filter((item) => item.status === "available");
  const beta = hits.filter((item) => item.status === "beta");
  const unavailable = hits.filter((item) => item.status === "unavailable" || item.status === "disabled");
  if(isEnglish){
    const lines=[`Most relevant: ${names(hits,true)}.`];
    if(ready.length)lines.push(`Available now: ${names(ready,true)}.`);
    if(beta.length)lines.push(`In beta: ${names(beta,true)}. Its beta status should remain visible in a demo.`);
    if(unavailable.length)lines.push(`Unavailable or disabled: ${names(unavailable,true)}.`);
    const openable=hits.find(item=>item.route&&(item.status==="available"||item.status==="beta"));
    if(openable)lines.push(`A live walkthrough can start from “${englishName(openable)}”.`);
    return lines.join("\n");
  }
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
  const body = await request.json().catch(() => ({})) as { query?: unknown;locale?:unknown };
  const query = typeof body.query === "string" ? body.query.trim() : "";
  const isEnglish=body.locale==="en";
  if (!query) return NextResponse.json({ error: isEnglish?"Enter a question about the product.":"请输入你想了解的产品问题" }, { status: 400 });
  const englishQueryMap:Record<string,string>={
    "Which core capabilities are available now?":"目前已经完成了哪些核心功能",
    "What works without an API key?":"没有 API Key 时还能使用什么",
    "Why is this more than ChatGPT with stock data?":"为什么它不只是 ChatGPT 加股票数据",
    "Which capabilities are still in beta?":"哪些能力仍在测试中",
  };
  const result = await searchPlatformCapabilityIndex(isEnglish?(englishQueryMap[query]??query):query, { limit: 12 });
  const nonApi=result.hits.filter(item=>item.category!=="api");
  const hits=(nonApi.length>=3?nonApi:result.hits).slice(0,8);
  return NextResponse.json({
    type: "capability_rag_answer",
    query,
    answer: buildAnswer(hits,isEnglish),
    sources: hits.map((item) => ({
      capability_id: item.capability_id,
      name: isEnglish?englishName(item):item.name,
      category: item.category,
      status: item.status,
      route: item.route,
      version: item.version,
      last_updated: item.last_updated,
      why_relevant: item.why_relevant,
    })),
    index: result.index,
    runtime: result.runtime,
    note: isEnglish?"This answer uses only the current Capability Registry and runtime status. It does not guess unregistered capabilities.":"回答只依据当前 Capability Registry 与运行状态生成，不会猜测尚未注册的功能。",
  });
}
