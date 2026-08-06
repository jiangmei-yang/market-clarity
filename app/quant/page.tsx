import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function QuantPage() {
  await requireChatGPTUser("/quant");
  redirect("/quant/factors");
}
