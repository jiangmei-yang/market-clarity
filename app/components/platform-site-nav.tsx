import Link from "next/link";
import { ArrowUpRight, ChartNoAxesCombined } from "lucide-react";

export function PlatformSiteNav({active}:{active?:"home"|"workspace"|"lab"|"pricing"}){
  const items=[
    {id:"workspace",href:"/workspace",label:"AI 工作台"},
    {id:"lab",href:"/quant/factors",label:"策略研究室"},
    {id:"pricing",href:"/pricing",label:"定价"},
  ] as const;
  return <header className="platform-site-nav">
    <Link href="/" className="platform-wordmark" aria-label="Market Clarity 首页"><span><ChartNoAxesCombined/></span><strong>Market Clarity</strong></Link>
    <nav aria-label="平台导航">{items.map(item=><Link key={item.id} href={item.href} aria-current={active===item.id?"page":undefined}>{item.label}</Link>)}</nav>
    <div className="platform-nav-actions"><Link href="/signin-with-chatgpt?return_to=%2Fworkspace">登录</Link><Link href="/workspace">开始使用 <ArrowUpRight/></Link></div>
  </header>;
}
