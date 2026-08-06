import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function StrategyResearchPage() {
  await requireChatGPTUser("/strategy-research");
  redirect("/quant/factors");
}
