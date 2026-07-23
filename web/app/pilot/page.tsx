import {requireChatGPTUser} from "../chatgpt-auth";
import {PilotEnrollment} from "../components/pilot-enrollment";
import {ProductToolShell} from "../components/product-tool-shell";
import {readPilotState} from "../lib/pilot-study";
export const dynamic="force-dynamic";
export default async function PilotPage(){await requireChatGPTUser("/pilot");const state=await readPilotState().catch(()=>({joined:false}));return <ProductToolShell active="pilot" title="持续复核测试" description="只验证一个收费假设：用户是否愿意为每周判断变化与风险复核付费。" status="候补不会扣费"><PilotEnrollment initialJoined={state.joined}/></ProductToolShell>}
