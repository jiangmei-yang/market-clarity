import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { ProductToolShell } from "@/app/components/product-tool-shell";
import { QuantWorkspace } from "@/app/components/quant-workspace";
import {NaturalStrategyAssistant} from "@/app/components/natural-strategy-assistant";

export const dynamic = "force-dynamic";

export default async function QuantPage() {
  await requireChatGPTUser("/quant");
  return <ProductToolShell active="quant" title="量化研究" description="用中文创建策略，确认规则后再回测、提醒和模拟。" status="研究与模拟 · 不连接交易"><NaturalStrategyAssistant/><QuantWorkspace /></ProductToolShell>;
}
