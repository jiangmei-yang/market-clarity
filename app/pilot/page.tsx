import {requireChatGPTUser} from "../chatgpt-auth";
import {PilotJourney} from "../components/pilot-journey";
import {ProductToolShell} from "../components/product-tool-shell";
import {readPilotState} from "../lib/pilot-study";
import {isPilotReleaseEnabled} from "../lib/mvp-evidence-contract";
export const dynamic="force-dynamic";
export default async function PilotPage(){await requireChatGPTUser("/pilot");if(!isPilotReleaseEnabled())return <ProductToolShell active="pilot" title="早期用户体验研究" description="本轮受控测试已经停止；已有数据仍可在评测页查看或删除。" status="发布开关已关闭"><section className="pilot-release-paused" role="status"><strong>本轮测试暂时停止</strong><p>产品负责人可以在修复问题并确认新一轮入口条件后重新开启。关闭期间不会记录新的任务、反馈或候补行为。</p></section></ProductToolShell>;const state=await readPilotState().catch(()=>({joined:false,participantRelation:undefined}));return <ProductToolShell active="pilot" title="早期用户体验研究" description="完成一次中性的交易前审查，提交匿名反馈，再自行决定是否加入付费测试候补。" status="约 5 分钟 · 不执行交易"><PilotJourney initialJoined={state.joined} initialJoinRelation={state.participantRelation}/></ProductToolShell>}
