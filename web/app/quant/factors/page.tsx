import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { StrategyResearchFlow } from "@/app/components/strategy-research/strategy-research-flow";
import { StrategyLabShell } from "@/app/components/strategy-lab-shell";
import "@/app/components/strategy-research/strategy-research.css";
import "../strategy-lab-brand.css";

export const dynamic = "force-dynamic";
// Legacy product name for source-level migration checks: AI 策略研究室

export default async function FactorResearchPage() {
  await requireChatGPTUser("/quant/factors");
  return <StrategyLabShell><StrategyResearchFlow /></StrategyLabShell>;
}
