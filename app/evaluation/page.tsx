import Link from "next/link";
import { CheckCircle2, CircleAlert, FlaskConical, ShieldCheck } from "lucide-react";
import { requireChatGPTUser } from "../chatgpt-auth";
import { ProductToolShell } from "../components/product-tool-shell";
import { EvaluationRunner } from "../components/evaluation-runner";
import {DataSourceEvaluationRunner} from "../components/data-source-evaluation-runner";
import { publicProvidersForSnapshot,readPublicProviderState } from "../lib/ai-provider-catalog";
import { runRuleSafetyBaseline,type ModelEvaluationRun } from "../lib/course-evaluation";
import {readUserSnapshot} from "../lib/user-snapshot";
import {readUserStudySummary} from "../lib/user-study";
import {readPilotSummary} from "../lib/pilot-study";
import {readLatestDataSourceEvaluationRun} from "../lib/data-source-evaluation";
import {formatHongKongDateTime} from "../lib/date-format";

export const dynamic="force-dynamic";

export default async function EvaluationPage(){
  await requireChatGPTUser("/evaluation");
  const baseline=runRuleSafetyBaseline();
  const providerState=await readPublicProviderState().catch(()=>{const providers=publicProvidersForSnapshot({});return{providers,defaultProviderId:providers.find(item=>item.isDefault)?.providerId??"mock",privacyMode:false};});
  const current=providerState.providers.find(item=>item.isDefault);
  const generativeReady=Boolean(current&&current.providerId!=="mock"&&current.connectionStatus==="available");
  const snapshotResult=await readUserSnapshot().catch(()=>({status:"empty" as const}));
  const modelRuns=snapshotResult.status==="ready"&&Array.isArray(snapshotResult.snapshot.modelEvaluationRuns)?snapshotResult.snapshot.modelEvaluationRuns as ModelEvaluationRun[]:[];
  const userStudy=await readUserStudySummary().catch(()=>({reviews:0,participants:0,changed:0,understood:0,repeatIntent:0,paidIntent:0,averageSeconds:null,averageSatisfaction:null,started:0,completed:0,quickCompleted:0,engagedCompleted:0,abandoned:0,completionSeconds:null}));
  const pilot=await readPilotSummary().catch(()=>({responses:0,joined:0,exposed:0,views:0,offer:{priceMonthly:19}}));
  const dataSourceRun=await readLatestDataSourceEvaluationRun().catch(()=>null);
  return <ProductToolShell active="evaluation" title="质量与验证" description="区分已通过的产品检查、尚未运行的模型评测和真实用户证据。" status="评测结果不使用模拟用户">
    <section className="evaluation-center">
      <header className="evaluation-summary"><div><span>当前可重复基线</span><h2>{baseline.passed}/{baseline.total} 项通过</h2><p>{baseline.scope}</p></div><div className={baseline.failed?"warning":"ready"}><ShieldCheck/><span><strong>{baseline.score} 分</strong><small>{baseline.version} · {formatHongKongDateTime(baseline.runAt)}</small></span></div></header>
      <div className="evaluation-gates"><article className="ready"><CheckCircle2/><div><span>确定性规则</span><strong>{baseline.failed?`${baseline.failed} 项需修复`:"20 项基线通过"}</strong><small>社交内容风险与交易前规则</small></div></article><article className={generativeReady?"ready":"pending"}>{generativeReady?<CheckCircle2/>:<CircleAlert/>}<div><span>真实模型评测</span><strong>{generativeReady?`${current?.displayName} 已连接，待运行固定任务集`:"未运行"}</strong><small>{generativeReady?current?.model:"当前只有规则模式；不会用 Mock 冒充模型结果"}</small></div></article><article className="pending"><CircleAlert/><div><span>跨用户证据</span><strong>待真实测试</strong><small>需要任务完成率、行为改变、再次使用和付费意愿</small></div></article></div>
      <EvaluationRunner ready={generativeReady} provider={current?.displayName??"本地规则模式"} model={current?.model??"mock"} initialRun={modelRuns[0]}/>
      <DataSourceEvaluationRunner initialRun={dataSourceRun}/>
      <section className="study-funnel"><header><div><span>核心任务漏斗</span><strong>开始 → 完成或放弃 → 提交反馈</strong></div><span>超 30 分钟未完成计为放弃</span></header><div><article><span>开始审查</span><strong>{userStudy.started}</strong></article><article><span>完成审查</span><strong>{userStudy.completed}</strong><small>{userStudy.started?`${Math.round(userStudy.completed/userStudy.started*100)}% 完成率`:"尚无样本"}</small></article><article><span>有参与度完成</span><strong>{userStudy.engagedCompleted}</strong><small>耗时超过 15 秒</small></article><article><span>15 秒内快速结束</span><strong>{userStudy.quickCompleted}</strong><small>单独显示，不冒充深度使用</small></article><article><span>放弃或超时</span><strong>{userStudy.abandoned}</strong></article><article><span>平均流程耗时</span><strong>{userStudy.completionSeconds==null?"暂无":`${userStudy.completionSeconds} 秒`}</strong></article></div><footer><a href="/api/evaluation/user-study?format=sessions">导出会话 CSV</a><span>只记录匿名会话状态和时间；15 秒阈值仅用于发现“点进即退”，不代表投资判断质量。</span></footer></section>
      <section className="user-study-summary"><header><div><span>完成后的真实反馈</span><strong>{userStudy.participants} 位匿名参与者 · {userStudy.reviews} 次反馈</strong></div><a href="/api/evaluation/user-study?format=csv">导出反馈 CSV</a></header><div><article><span>修改或延迟</span><strong>{userStudy.reviews?Math.round(userStudy.changed/userStudy.reviews*100):0}%</strong></article><article><span>看懂主要风险</span><strong>{userStudy.reviews?Math.round(userStudy.understood/userStudy.reviews*100):0}%</strong></article><article><span>愿意再次使用</span><strong>{userStudy.reviews?Math.round(userStudy.repeatIntent/userStudy.reviews*100):0}%</strong></article><article><span>愿意进入付费测试</span><strong>{userStudy.reviews?Math.round(userStudy.paidIntent/userStudy.reviews*100):0}%</strong></article><article><span>平均完成时间</span><strong>{userStudy.averageSeconds==null?"暂无":`${userStudy.averageSeconds} 秒`}</strong></article></div><p>只统计用户主动提交的匿名反馈；零样本保持为零，不生成模拟参与者。</p></section>
      <section className="pilot-evidence"><div><span>行为型价格测试</span><strong>¥{pilot.offer.priceMonthly}/月 · 每周持仓判断复核</strong><small>{pilot.exposed} 人看过方案，{pilot.joined} 人当前在候补，转化率 {pilot.exposed?Math.round(pilot.joined/pilot.exposed*100):0}%。尚未接支付，不把态度题算作收入。</small></div><Link href="/pilot">查看并加入测试</Link></section>
      <section className="evaluation-table"><header><div><span>规则基线明细</span><strong>每项都可在服务器重新计算</strong></div><FlaskConical/></header><div className="evaluation-table-head"><b>编号</b><b>场景</b><b>预期</b><b>实际</b><b>结果</b></div>{baseline.cases.map(item=><div key={item.id}><code>{item.id}</code><span title={item.input}>{item.category}</span><span>{item.expected}</span><span>{item.actual}</span><strong className={item.passed?"pass":"fail"}>{item.passed?"通过":"失败"}</strong></div>)}</section>
      <aside className="evaluation-next"><div><strong>距离课程 95 分还缺什么</strong><p>连接真实模型后运行固定任务集；邀请 10–20 位目标用户完成同一核心流程；获得真实候补或付款证据。没有这些证据，本页不会显示“已完成”。</p></div><span><Link href="/demo">打开 90 秒演示</Link><Link href="/ai-settings">检查模型状态</Link></span></aside>
    </section>
  </ProductToolShell>;
}
