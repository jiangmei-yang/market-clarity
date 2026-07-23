import {requireChatGPTUser} from "../chatgpt-auth";
import {DemoWalkthrough} from "../components/demo-walkthrough";
import {ProductToolShell} from "../components/product-tool-shell";
export const dynamic="force-dynamic";
export default async function DemoPage(){await requireChatGPTUser("/demo");return <ProductToolShell active="demo" title="90 秒课堂演示" description="一条固定、可重复、明确标注为教学快照的交易前检查路径。" status="不会执行交易"><DemoWalkthrough/></ProductToolShell>}
