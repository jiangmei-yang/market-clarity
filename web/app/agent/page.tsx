import { AgentWorkspace } from "../components/agent-workspace";
import { ProductToolShell } from "../components/product-tool-shell";
import { requireChatGPTUser } from "../chatgpt-auth";
export const dynamic="force-dynamic";
export default async function AgentPage(){await requireChatGPTUser("/agent");return <ProductToolShell active="agent" title="任务助手" description="说出目标，查看执行步骤、数据来源和待确认操作" status="仅使用已授权工具"><AgentWorkspace/></ProductToolShell>;}
