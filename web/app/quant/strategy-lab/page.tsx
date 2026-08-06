import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function QuantStrategyLabPage() {
  await requireChatGPTUser("/quant/strategy-lab");
  redirect("/quant/factors");
}
