import {Eye,ShieldCheck} from "lucide-react";
import {readSharedDashboard} from "@/app/lib/dashboard-server";
import {MODULE_LABELS} from "@/app/lib/personal-workbench";
import {CloneSharedWorkspaceButton} from "@/app/components/clone-shared-workspace-button";

export default async function SharedWorkspacePage({params}:{params:Promise<{token:string}>}){
  const {token}=await params;const shared=await readSharedDashboard(token);const workspace=shared.workspace;
  return <main className="shared-dashboard-page"><header><div><span><Eye/>只读工作台</span><h1>{workspace.name}</h1><p>{workspace.description||"由安心看股用户分享的工作台配置。"}</p></div><CloneSharedWorkspaceButton token={token}/></header><section className="shared-dashboard-meta"><span>分享于 {new Date(shared.sharedAt).toLocaleString("zh-CN")}</span><span>{workspace.modules.filter(item=>item.visible).length} 个模块</span><span>{workspace.theme.mode==="dark"?"深色":"浅色"}主题</span></section><section className="shared-dashboard-grid">{workspace.modules.filter(item=>item.visible).sort((a,b)=>a.order-b.order).map(item=><article key={item.instanceId}><span>{MODULE_LABELS[item.type]}</span><strong>{item.title||MODULE_LABELS[item.type]}</strong><small>数据源：{item.dataSourceId}</small><small>刷新：{item.refreshPolicy.mode==="manual"?"手动":item.refreshPolicy.interval??item.refreshPolicy.mode}</small></article>)}</section><footer><ShieldCheck/>分享内容只包含布局、模块和显示设置，不包含持仓、交易记录、API Key 或 AI 对话。</footer></main>;
}
