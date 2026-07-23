"use client";

import Link from "next/link";
import {
  Bot, BookOpen, BriefcaseBusiness, FileSearch, Gauge, History, Home, Layers3,
  MessageSquareWarning, ReceiptText, Settings2, ShieldCheck, SlidersHorizontal, Sparkles,
} from "lucide-react";
import { BrandMark } from "./brand-mark";
import { pick, useI18n } from "../i18n";

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
  const { isEnglish, locale, setLocale } = useI18n();
  const groupLabel: Record<string, [string, string]> = {
    home: ["工作台", "Workspace"], research: ["研究", "Research"], decision: ["决策", "Decisions"],
    portfolio: ["组合", "Portfolio"], assistant: ["助手", "Assistant"],
  };
  const itemCopy: Record<string, [string, string, string, string]> = {
    "/analysis?view=research": ["股票研究", "Stock research", "行情、事件与财务", "Prices, events and financials"],
    "/etf-tool": ["ETF 诊断", "ETF diagnosis", "持仓穿透与重复暴露", "Look-through holdings and overlap"],
    "/quant": ["量化研究", "Quant research", "规则、回测与模拟", "Rules, backtests and simulation"],
    "/opportunity": ["机会检查", "Claim check", "核实消息与跟风风险", "Verify claims and crowding risk"],
    "/analysis?view=decision": ["交易前验证", "Pre-trade review", "金额、理由与退出条件", "Size, rationale and exit conditions"],
    "/trade-tool": ["交易复盘", "Trade review", "归因、费用与行为模式", "Attribution, costs and behavior"],
    "/portfolio": ["我的组合", "My portfolio", "集中度与行业暴露", "Concentration and sector exposure"],
    "/profile": ["我的规则", "My rules", "个人提醒边界", "Personal review boundaries"],
    "/analysis?view=history": ["历史记录", "Review history", "复核过去的决定", "Revisit previous decisions"],
    "/agent": ["任务助手", "Task agent", "用目标组织工具和流程", "Turn a goal into tools and steps"],
    "/workspace": ["编辑工作台", "Edit workspace", "调整模块与布局", "Arrange modules and layout"],
    "/ai-settings": ["AI 模型", "AI models", "模型连接与隐私", "Connections and privacy"],
    "/features": ["产品说明", "Product guide", "功能、状态与使用边界", "Capabilities, status and limits"],
  };
  const groupDetail: Record<string, [string, string]> = {
    research: ["理解市场和标的", "Understand markets and assets"],
    decision: ["核实依据再行动", "Verify the basis before acting"],
    portfolio: ["管理持仓与规则", "Manage holdings and rules"],
    assistant: ["让系统替你组织任务", "Let the system organize the work"],
  };
  return <aside className="unified-sidebar">
    <Link href="/" className="unified-brand" aria-label={pick(isEnglish, "Market Clarity 安心看股工作台", "Market Clarity investment workspace")}><BrandMark /><div><strong>Market Clarity</strong><small>{pick(isEnglish, "安心看股 · 中文品牌", "Research clearly. Decide deliberately.")}</small></div></Link>
    <div className="locale-switcher" role="group" aria-label={pick(isEnglish, "界面语言", "Interface language")}>
      <button className={locale === "zh-CN" ? "active" : ""} onClick={() => setLocale("zh-CN")} aria-pressed={locale === "zh-CN"}>中文</button>
      <button className={locale === "en" ? "active" : ""} onClick={() => setLocale("en")} aria-pressed={locale === "en"}>EN</button>
    </div>
    <nav aria-label={pick(isEnglish, "工作台导航", "Workspace navigation")} data-guide="primary-nav">{NAV_GROUPS.map((group) => {
      const selected = group.paths.includes(activePath as never) || Boolean(activeHref && group.children?.some((item) => item.href === activeHref));
      const Icon = group.icon;
      const pair = groupLabel[group.id] ?? [group.label, group.label];
      const label = pick(isEnglish, pair[0], pair[1]);
      return <div className={`nav-group ${selected ? "active" : ""}`} key={group.id}>
        <Link href={group.href} className="nav-primary" aria-current={selected ? "page" : undefined}><Icon /><span>{label}</span></Link>
        {group.children && <div className="nav-submenu" role="menu" aria-label={`${label} ${pick(isEnglish, "子菜单", "menu")}`}><header><Icon /><span><strong>{label}</strong><small>{isEnglish ? (groupDetail[group.id]?.[1] ?? "Organize the current task") : (groupDetail[group.id]?.[0] ?? "组织当前任务")}</small></span></header>{group.children.map((item) => { const ChildIcon = item.icon; const itemPath=item.href.split("?")[0]; const itemSelected=activeHref ? activeHref===item.href : activePath===itemPath; const copy=itemCopy[item.href]??[item.label,item.label,item.detail,item.detail]; return <Link href={item.href} key={item.href} role="menuitem" className={itemSelected?"selected":undefined} aria-current={itemSelected?"page":undefined}><ChildIcon /><span><strong>{isEnglish?copy[1]:copy[0]}</strong><small>{isEnglish?copy[3]:copy[2]}</small></span></Link>; })}</div>}
      </div>;
    })}</nav>
    {userName && <div className="unified-account"><span>{userName.slice(0, 1)}</span><div><strong>{userName}</strong><small>{syncLabel ?? pick(isEnglish, "已登录", "Signed in")}</small></div><Link href="/signout-with-chatgpt" aria-label={pick(isEnglish, "退出", "Sign out")}>{pick(isEnglish, "退出", "Sign out")}</Link></div>}
  </aside>;
}
