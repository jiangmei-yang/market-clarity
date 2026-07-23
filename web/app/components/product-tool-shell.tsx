"use client";

import { AppNavigation } from "./app-navigation";

type ProductToolShellProps = {
  active: "etf" | "trade" | "quant" | "agent" | "evaluation" | "demo" | "pilot" | "guide";
  title: string;
  description: string;
  status: string;
  children: React.ReactNode;
};

export function ProductToolShell({ active, title, description, status, children }: ProductToolShellProps) {
  const activePath = active === "etf" ? "/etf-tool" : active === "trade" ? "/trade-tool" : active === "quant" ? "/quant" : active === "agent" ? "/agent" : active === "demo" ? "/demo" : active === "guide" ? "/features" : "/";
  return (
    <div className="native-tool-shell">
      <a className="skip-link" href="#tool-main">跳到主要内容</a>
      <AppNavigation activePath={activePath} />
      <header className="native-tool-header" data-guide="page-header">
        <div><h1>{title}</h1><p>{description}</p></div>
        <span className="native-data-status"><i />{status}</span>
      </header>
      <main id="tool-main" className="native-tool-main">{children}</main>
    </div>
  );
}
