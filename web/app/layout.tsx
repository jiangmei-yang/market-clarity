import type { Metadata } from "next";
import { headers } from "next/headers";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GlobalAIAssistantProvider } from "./components/global-ai-assistant";
import { SystemReliabilityCenter } from "./components/system-reliability-center";
import { ContextualGuide } from "./components/contextual-guide";
import { I18nProvider } from "./i18n";
import "./globals.css";
import "./capability-guide.css";
import "./quant-workspace.css";
import "./failure-control.css";
import "./product-polish.css";
import "./demo-sandbox.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "anxin-decision-desk.gljiangmei.chatgpt.site";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og-workbench-v2.png`;
  const title = "Market Clarity · 安心看股";
  const description = "A personal investment research and pre-decision review workspace. 研究公开信息、组合暴露与行动前风险。";
  return {
    title,
    description,
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: { title, description, images: [{ url: image, width: 1536, height: 1024, alt: "Market Clarity personal investment workspace" }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body><I18nProvider><TooltipProvider delay={350}><GlobalAIAssistantProvider>{children}<ContextualGuide/><SystemReliabilityCenter/></GlobalAIAssistantProvider></TooltipProvider></I18nProvider></body></html>;
}
