import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { CapabilityGuide } from "@/app/components/capability-guide";
import { ProductToolShell } from "@/app/components/product-tool-shell";

export const dynamic = "force-dynamic";

export default async function FeaturesPage() {
  await requireChatGPTUser("/features");
  return <ProductToolShell active="guide" title="产品说明" description="查询当前功能、可用状态、使用入口与已知限制；信息来自实时能力注册中心。" status="能力知识库 · 自动同步">
    <CapabilityGuide />
  </ProductToolShell>;
}
