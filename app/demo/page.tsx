import {requireChatGPTUser} from "../chatgpt-auth";
import {DemoWalkthrough} from "../components/demo-walkthrough";
import {ProductToolShell} from "../components/product-tool-shell";
export const dynamic="force-dynamic";
export default async function DemoPage(){await requireChatGPTUser("/demo");return <ProductToolShell active="demo" title="90 秒产品演示" description="使用明确标注的示例快照，体验完整的交易前检查路径。" status="不会执行交易"><DemoWalkthrough/></ProductToolShell>}
