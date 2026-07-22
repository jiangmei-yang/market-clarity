import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { ProductToolShell } from "@/app/components/product-tool-shell";
import { QuantWorkspace } from "@/app/components/quant-workspace";

export const dynamic = "force-dynamic";

export default async function QuantPage() {
  await requireChatGPTUser("/quant");
  return <ProductToolShell active="quant" title="量化规则" description="把你的投资想法变成可确认、可筛选、可验证的条件。" status="固定演示股票池 · 明确标注"><QuantWorkspace /></ProductToolShell>;
}
