import { AgentWorkspace } from "../components/agent-workspace";
import { ProductToolShell } from "../components/product-tool-shell";
import { requireChatGPTUser } from "../chatgpt-auth";
export const dynamic="force-dynamic";
export default async function AgentPage(){await requireChatGPTUser("/agent");return <ProductToolShell active="agent" title="Agent 工作台" description="目标驱动的研究、风险检查与工作台编排" status="工具白名单已启用"><AgentWorkspace/></ProductToolShell>;}
