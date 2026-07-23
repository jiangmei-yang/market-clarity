"use client";

import Link from "next/link";
import {
  Bot, BookOpen, BriefcaseBusiness, FileSearch, Gauge, History, Home, Layers3,
  MessageSquareWarning, ReceiptText, Settings2, ShieldCheck, SlidersHorizontal, Sparkles,
} from "lucide-react";
import { BrandMark } from "./brand-mark";

const NAV_GROUPS = [
  { id: "home", href: "/", label: "工作台", icon: Home, paths: ["/"] },
  { id: "research", href: "/analysis?view=research", label: "研究", icon: FileSearch, paths: ["/analysis", "/etf-tool", "/quant"], children: [
    { href: "/analysis?view=research", label: "股票研究", detail: "行情、事件与财务", icon: FileSearch },
    { href: "/etf-tool", label: "ETF 诊断", detail: "持仓穿透与重复暴露", icon: Layers3 },
    { href: "/quant", label: "量化研究", detail: "规则、回测与模拟", icon: Gauge },
  ] },
  { id: "decision", href: "/opportunity", label: "决策", icon: ShieldCheck, paths: ["/opportunity", "/trade-tool"], children: [
    { href: "/opportunity", label: "机会检查", detail: "核实消息与跟风风险", icon: MessageSquareWarning },
    { href: "/analysis?view=decision", label: "交易前验证", detail: "金额、理由与退出条件", icon: ShieldCheck },
    { href: "/trade-tool", label: "交易复盘", detail: "归因、费用与行为模式", icon: ReceiptText },
  ] },
  { id: "portfolio", href: "/portfolio", label: "组合", icon: BriefcaseBusiness, paths: ["/portfolio", "/profile"], children: [
    { href: "/portfolio", label: "我的组合", detail: "集中度与行业暴露", icon: BriefcaseBusiness },
    { href: "/profile", label: "我的规则", detail: "个人提醒边界", icon: SlidersHorizontal },
    { href: "/analysis?view=history", label: "历史记录", detail: "复核过去的决定", icon: History },
  ] },
  { id: "assistant", href: "/agent", label: "助手", icon: Bot, paths: ["/agent", "/workspace", "/ai-settings", "/features"], children: [
    { href: "/agent", label: "任务助手", detail: "用目标组织工具和流程", icon: Bot },
    { href: "/workspace", label: "编辑工作台", detail: "调整模块与布局", icon: Settings2 },
    { href: "/ai-settings", label: "AI 模型", detail: "模型连接与隐私", icon: Sparkles },
    { href: "/features", label: "产品说明", detail: "功能、状态与使用边界", icon: BookOpen },
  ] },
] as const;

export const APP_NAVIGATION = NAV_GROUPS.flatMap((group) => group.children ?? [{ href: group.href, label: group.label, icon: group.icon }]);

export function AppNavigation({ activePath, activeHref, userName, syncLabel }: { activePath: string; activeHref?: string; userName?: string; syncLabel?: string }) {
  return <aside className="unified-sidebar">
    <Link href="/" className="unified-brand" aria-label="Market Clarity 安心看股工作台"><BrandMark /><div><strong>Market Clarity</strong><small>安心看股 · 中文品牌</small></div></Link>
    <nav aria-label="工作台导航" data-guide="primary-nav">{NAV_GROUPS.map((group) => {
      const selected = group.paths.includes(activePath as never) || Boolean(activeHref && group.children?.some((item) => item.href === activeHref));
      const Icon = group.icon;
      return <div className={`nav-group ${selected ? "active" : ""}`} key={group.id}>
        <Link href={group.href} className="nav-primary" aria-current={selected ? "page" : undefined}><Icon /><span>{group.label}</span></Link>
        {group.children && <div className="nav-submenu" role="menu" aria-label={`${group.label}子菜单`}><header><Icon /><span><strong>{group.label}</strong><small>{group.id === "research" ? "理解市场和标的" : group.id === "decision" ? "核实依据再行动" : group.id === "portfolio" ? "管理持仓与规则" : "让系统替你组织任务"}</small></span></header>{group.children.map((item) => { const ChildIcon = item.icon; const itemPath=item.href.split("?")[0]; const itemSelected=activeHref ? activeHref===item.href : activePath===itemPath; return <Link href={item.href} key={item.href} role="menuitem" className={itemSelected?"selected":undefined} aria-current={itemSelected?"page":undefined}><ChildIcon /><span><strong>{item.label}</strong><small>{item.detail}</small></span></Link>; })}</div>}
      </div>;
    })}</nav>
    {userName && <div className="unified-account"><span>{userName.slice(0, 1)}</span><div><strong>{userName}</strong><small>{syncLabel ?? "已登录"}</small></div><Link href="/signout-with-chatgpt" aria-label="退出">退出</Link></div>}
  </aside>;
}
