"use client";

import Link from "next/link";
import {
  BriefcaseBusiness,
  FileSearch,
  History,
  LayoutDashboard,
  Layers3,
  ScanSearch,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";

type ProductToolShellProps = {
  active: "etf" | "trade" | "quant";
  title: string;
  description: string;
  status: string;
  children: React.ReactNode;
};

const navigation: Array<{ href: string; label: string; icon: typeof LayoutDashboard; id?: "trade" }> = [
  { href: "/", label: "工作台", icon: LayoutDashboard },
  { href: "/?view=research", label: "研究", icon: FileSearch },
  { href: "/?view=portfolio", label: "组合", icon: BriefcaseBusiness },
  { href: "/quant", label: "量化规则", icon: ScanSearch },
  { href: "/?view=newDecision", label: "决策审查", icon: ShieldCheck },
  { href: "/trade-tool", label: "交易复盘", icon: ReceiptText, id: "trade" },
  { href: "/?view=history", label: "历史", icon: History },
];

export function ProductToolShell({ active, title, description, status, children }: ProductToolShellProps) {
  return (
    <div className="native-tool-shell">
      <a className="skip-link" href="#tool-main">跳到主要内容</a>
      <aside className="native-tool-rail">
        <Link className="native-tool-brand" href="/" aria-label="安心看股工作台"><span>安</span><strong>安心看股</strong></Link>
        <nav aria-label="主导航">
          {navigation.map(({ href, label, icon: Icon, id }) => {
            const selected = id === active || (active === "quant" && href === "/quant");
            return <Link key={label} href={href} className={selected ? "native-tool-nav active" : "native-tool-nav"} aria-current={selected ? "page" : undefined}><Icon /><span>{label}</span></Link>;
          })}
          <Link href="/etf-tool" className={active === "etf" ? "native-tool-nav active" : "native-tool-nav"} aria-current={active === "etf" ? "page" : undefined}><Layers3 /><span>ETF 穿透</span></Link>
        </nav>
      </aside>
      <header className="native-tool-header">
        <div><h1>{title}</h1><p>{description}</p></div>
        <span className="native-data-status"><i />{status}</span>
      </header>
      <main id="tool-main" className="native-tool-main">{children}</main>
    </div>
  );
}
