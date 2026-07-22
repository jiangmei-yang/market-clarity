import type { Metadata } from "next";
import { headers } from "next/headers";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GlobalAIAssistantProvider } from "./components/global-ai-assistant";
import { SystemReliabilityCenter } from "./components/system-reliability-center";
import "./globals.css";
import "./quant-workspace.css";
import "./failure-control.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "anxin-decision-desk.gljiangmei.chatgpt.site";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og-workbench-v2.png`;
  const title = "安心看股 · 个人投资工作台";
  const description = "定义个人规则，核对社交内容、组合暴露与交易前风险。";
  return {
    title,
    description,
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: { title, description, images: [{ url: image, width: 1536, height: 1024, alt: "安心看股个人投资工作台" }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body><TooltipProvider delay={350}><GlobalAIAssistantProvider>{children}<SystemReliabilityCenter/></GlobalAIAssistantProvider></TooltipProvider></body></html>;
}
