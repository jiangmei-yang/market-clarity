"use client";

import Link from "next/link";
import {
  Bot,
  BriefcaseBusiness,
  FileSearch,
  Gauge,
  Home,
  Layers3,
  MessageSquareWarning,
  ReceiptText,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";

export const APP_NAVIGATION = [
  { href: "/", label: "工作台", icon: Home },
  { href: "/opportunity", label: "机会检查", icon: MessageSquareWarning },
  { href: "/agent", label: "任务助手", icon: Bot },
  { href: "/profile", label: "我的规则", icon: SlidersHorizontal },
  { href: "/portfolio", label: "我的组合", icon: BriefcaseBusiness },
  { href: "/analysis?view=research", activePath: "/analysis", label: "股票研究", icon: FileSearch },
  { href: "/etf-tool", label: "ETF 诊断", icon: Layers3 },
  { href: "/quant", label: "量化研究", icon: Gauge },
  { href: "/trade-tool", label: "交易复盘", icon: ReceiptText },
  { href: "/ai-settings", label: "AI 模型", icon: Sparkles },
] as const;

export function AppNavigation({ activePath, userName, syncLabel }: { activePath: string; userName?: string; syncLabel?: string }) {
  return <aside className="unified-sidebar">
    <Link href="/" className="unified-brand" aria-label="安心看股工作台"><span>安</span><div><strong>安心看股</strong><small>个人投资工作台</small></div></Link>
    <nav aria-label="工作台导航">{APP_NAVIGATION.map(({ href, activePath: itemActivePath, label, icon: Icon }) => {
      const selected = activePath === (itemActivePath ?? href.split("?")[0]);
      return <Link key={href} href={href} className={selected ? "active" : undefined} aria-current={selected ? "page" : undefined}><Icon /><span>{label}</span></Link>;
    })}</nav>
    {userName && <div className="unified-account"><span>{userName.slice(0, 1)}</span><div><strong>{userName}</strong><small>{syncLabel ?? "已登录"}</small></div><Link href="/signout-with-chatgpt" aria-label="退出">退出</Link></div>}
  </aside>;
}
