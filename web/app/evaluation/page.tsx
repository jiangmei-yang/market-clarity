import Link from "next/link";
import { CheckCircle2, CircleAlert, FlaskConical, ShieldCheck } from "lucide-react";
import { requireChatGPTUser } from "../chatgpt-auth";
import { ProductToolShell } from "../components/product-tool-shell";
import { EvaluationRunner } from "../components/evaluation-runner";
import {AgentFunctionalEvaluationRunner} from "../components/agent-functional-evaluation-runner";
import {DataSourceEvaluationRunner} from "../components/data-source-evaluation-runner";
import {MvpEvidenceContract} from "../components/mvp-evidence-contract";
import {StrategyLabSafetyReview} from "../components/strategy-lab-safety-review";
import {LocalizedText as T} from "../components/localized-text";
import { publicProvidersForSnapshot,readPublicProviderState } from "../lib/ai-provider-catalog";
import { runRuleSafetyBaseline,type ModelEvaluationRun } from "../lib/course-evaluation";
import {readUserSnapshot} from "../lib/user-snapshot";
import {readUserStudySummary} from "../lib/user-study";
import {readPilotSummary} from "../lib/pilot-study";
import {readLatestDataSourceEvaluationRun} from "../lib/data-source-evaluation";
import {formatHongKongDateTime} from "../lib/date-format";
import type {AgentFunctionalEvaluationRun} from "../lib/agent-functional-evaluation";
import {isPilotReleaseEnabled} from "../lib/mvp-evidence-contract";
import {readStrategyLabStudySummary} from "../lib/strategy-lab-study";

export const dynamic="force-dynamic";

export default async function EvaluationPage(){
  await requireChatGPTUser("/evaluation");
  const baseline=runRuleSafetyBaseline();
  const providerState=await readPublicProviderState().catch(()=>{const providers=publicProvidersForSnapshot({});return{providers,defaultProviderId:providers.find(item=>item.isDefault)?.providerId??"mock",privacyMode:false};});
  const current=providerState.providers.find(item=>item.isDefault);
  const generativeReady=Boolean(current&&current.providerId!=="mock"&&current.connectionStatus==="available");
  const snapshotResult=await readUserSnapshot().catch(()=>({status:"empty" as const}));
  const modelRuns=snapshotResult.status==="ready"&&Array.isArray(snapshotResult.snapshot.modelEvaluationRuns)?snapshotResult.snapshot.modelEvaluationRuns as ModelEvaluationRun[]:[];
  const latestModelRun=modelRuns[0];
  const agentRuns=snapshotResult.status==="ready"&&Array.isArray(snapshotResult.snapshot.agentFunctionalEvaluationRuns)?snapshotResult.snapshot.agentFunctionalEvaluationRuns as AgentFunctionalEvaluationRun[]:[];
  const latestAgentRun=agentRuns[0];
  const userStudy=await readUserStudySummary().catch(()=>({reviews:0,participants:0,modified:0,maintained:0,delayed:0,changed:0,understood:0,riskRestatements:0,repeatIntent:0,paidIntent:0,internalReviews:0,representedSegments:0,segments:{} as Record<string,number>,averageSeconds:null,averageSatisfaction:null,started:0,completed:0,feedbackSubmitted:0,quickCompleted:0,engagedCompleted:0,abandoned:0,completionSeconds:null}));
  const pilot=await readPilotSummary().catch(()=>({responses:0,joined:0,exposed:0,views:0,internalExposed:0,internalJoined:0,offer:{priceMonthly:19}}));
  const labStudy=await readStrategyLabStudySummary().catch(()=>({started:0,planned:0,runCompleted:0,saved:0,abandoned:0,revisited:0,participants:0,firstFiveSaved:0,internalParticipants:0,completionSeconds:null,p95RunSeconds:null,failures:0,retries:0,comprehensionPassed:0,segments:{} as Record<string,number>,buildId:null,cohortKey:null,safetyIncidents:null,safetyReviewed:false}));
  const dataSourceRun=await readLatestDataSourceEvaluationRun().catch(()=>null);
  const completionRate=userStudy.started?Math.round(userStudy.completed/userStudy.started*100):0;
  const conversionRate=pilot.exposed?Math.round(pilot.joined/pilot.exposed*100):0;
  const segments=[["投资经验不足1年","Under one year of investing"],["ETF或长期持有","ETF or long-term investor"],["近3个月主动交易","Active trader in the past 3 months"]] as const;
  return <ProductToolShell active="evaluation" title="质量与验证" description="区分已通过的产品检查、尚未运行的模型评测和真实用户证据。" status="评测结果不使用模拟用户">
    <section className="evaluation-center">
      <header className="evaluation-summary"><div><span><T zh="当前可重复基线" en="Current reproducible baseline"/></span><h2>{baseline.passed}/{baseline.total} <T zh="项通过" en="checks passed"/></h2><p><T zh={baseline.scope} en="Deterministic rules only; this is not a language-model quality score."/></p></div><div className={baseline.failed?"warning":"ready"}><ShieldCheck/><span><strong>{baseline.score} <T zh="分" en="points"/></strong><small>{baseline.version} · {formatHongKongDateTime(baseline.runAt)}</small></span></div></header>
      <div className="evaluation-gates">
        <article className="ready"><CheckCircle2/><div><span><T zh="确定性规则" en="Deterministic rules"/></span><strong><T zh={baseline.failed?`${baseline.failed} 项需修复`:"20 项基线通过"} en={baseline.failed?`${baseline.failed} checks need work`:"20 baseline checks passed"}/></strong><small><T zh="社交内容风险与交易前规则" en="Social-content risk and pre-trade rules"/></small></div></article>
        <article className={latestModelRun?(latestModelRun.score>=90?"ready":"warning"):generativeReady?"ready":"pending"}>{latestModelRun&&latestModelRun.score>=90?<CheckCircle2/>:<CircleAlert/>}<div><span><T zh="真实模型评测" en="Real-model evaluation"/></span><strong>{latestModelRun?<>{latestModelRun.passed}/{latestModelRun.total} · {latestModelRun.score} <T zh="分" en="points"/></>:generativeReady?<T zh={`${current?.displayName} 已连接，待运行固定任务集`} en={`${current?.displayName} connected; fixed tasks not run`}/>:<T zh="未运行" en="Not run"/>}</strong><small>{latestModelRun?`${latestModelRun.model} · ${formatHongKongDateTime(latestModelRun.runAt)}`:generativeReady?current?.model:<T zh="当前只有规则模式；不会用 Mock 冒充模型结果" en="Rules-only mode; Mock is never presented as model evidence"/>}</small></div></article>
        <article className="pending"><CircleAlert/><div><span><T zh="跨用户证据" en="Cross-user evidence"/></span><strong><T zh="待真实测试" en="Awaiting real testing"/></strong><small><T zh="需要任务完成率、行为改变、再次使用和付费意愿" en="Needs task completion, behavior change, repeat use and payment evidence"/></small></div></article>
      </div>
      <MvpEvidenceContract study={labStudy} releaseEnabled={isPilotReleaseEnabled()}/>
      <StrategyLabSafetyReview reviewed={labStudy.safetyReviewed} incidents={labStudy.safetyIncidents}/>
      <section className="study-funnel"><header><div><span><T zh="策略研究室外部新手漏斗" en="Strategy Lab external novice funnel"/></span><strong><T zh="开始 → 看懂规则 → 跑完比较 → 保存方法 → 以后重检" en="Start → review rules → run comparison → save method → revisit"/></strong></div><Link href="/quant/factors"><T zh="打开策略研究工作台" en="Open strategy research workspace"/></Link></header><div>
        <article><span><T zh="开始" en="Started"/></span><strong>{labStudy.started}</strong></article>
        <article><span><T zh="生成规则" en="Rules created"/></span><strong>{labStudy.planned}</strong></article>
        <article><span><T zh="完成研究" en="Research completed"/></span><strong>{labStudy.runCompleted}</strong></article>
        <article><span><T zh="保存方法" en="Method saved"/></span><strong>{labStudy.saved}</strong></article>
        <article><span><T zh="自然复访" en="Revisited"/></span><strong>{labStudy.revisited}</strong></article>
        <article><span><T zh="放弃 / 失败 / 重试" en="Abandoned / failed / retried"/></span><strong>{labStudy.abandoned} / {labStudy.failures} / {labStudy.retries}</strong></article>
      </div><footer><a href="/api/evaluation/strategy-lab?format=csv"><T zh="导出化名事件 CSV" en="Export pseudonymous event CSV"/></a><span><T zh={`当前构建 ${labStudy.buildId??"未配置"} · 外部参与者 ${labStudy.participants} 位；另有 ${labStudy.internalParticipants} 位内部测试者，不计入外部证据。事件不含输入正文、股票代码或金额。`} en={`Current build ${labStudy.buildId??"not configured"} · ${labStudy.participants} external participants; ${labStudy.internalParticipants} internal testers excluded. Events contain no prompt, ticker or amount.`}/></span></footer></section>
      <EvaluationRunner ready={generativeReady} provider={current?.displayName??"Rules-only mode"} model={current?.model??"mock"} initialRun={latestModelRun}/>
      <AgentFunctionalEvaluationRunner ready={generativeReady} provider={current?.displayName??"Rules-only mode"} model={current?.model??"mock"} initialRun={latestAgentRun}/>
      <DataSourceEvaluationRunner initialRun={dataSourceRun}/>
      <section className="study-funnel"><header><div><span><T zh="旁证 · 交易前审查任务（不计入本轮策略 MVP）" en="Supporting evidence · pre-trade review task (excluded from this strategy MVP)"/></span><strong><T zh="点击开始 → 完成或放弃 → 提交反馈" en="Start task → complete or abandon → submit feedback"/></strong></div><span><T zh="只统计明确标记为外部体验者的记录" en="Only records explicitly marked as external are counted"/></span></header><div>
        <article><span><T zh="开始审查" en="Started"/></span><strong>{userStudy.started}</strong></article>
        <article><span><T zh="完成审查" en="Completed"/></span><strong>{userStudy.completed}</strong><small>{userStudy.started?<T zh={`${completionRate}% 完成率`} en={`${completionRate}% completion rate`}/>:<T zh="尚无样本" en="No sample yet"/>}</small></article>
        <article><span><T zh="提交匿名反馈" en="Feedback submitted"/></span><strong>{userStudy.feedbackSubmitted}</strong><small><T zh="与完成任务分开记录" en="Recorded separately from task completion"/></small></article>
        <article><span><T zh="有参与度完成" en="Engaged completion"/></span><strong>{userStudy.engagedCompleted}</strong><small><T zh="耗时超过 15 秒" en="More than 15 seconds"/></small></article>
        <article><span><T zh="15 秒内快速结束" en="Finished within 15 seconds"/></span><strong>{userStudy.quickCompleted}</strong><small><T zh="单独显示，不冒充深度使用" en="Reported separately; not treated as deep use"/></small></article>
        <article><span><T zh="放弃或超时" en="Abandoned or timed out"/></span><strong>{userStudy.abandoned}</strong></article>
        <article><span><T zh="平均流程耗时" en="Average task time"/></span><strong>{userStudy.completionSeconds==null?<T zh="暂无" en="None yet"/>:<><span>{userStudy.completionSeconds}</span> <T zh="秒" en="sec"/></>}</strong></article>
      </div><footer><a href="/api/evaluation/user-study?format=sessions"><T zh="导出会话 CSV" en="Export session CSV"/></a><span><T zh="进入页面不算开始；只有点击“开始体验任务”才进入漏斗。超 30 分钟未完成计为放弃。" en="Opening the page is not a start. The funnel begins only after Start task is clicked; incomplete sessions time out after 30 minutes."/></span></footer></section>
      <section className="user-study-summary"><header><div><span><T zh="外部用户完成后的真实反馈" en="External post-task feedback"/></span><strong>{userStudy.participants} <T zh="位去重参与者" en="deduplicated participants"/> · {userStudy.reviews} <T zh="次明确同意的反馈" en="consented responses"/> · {userStudy.representedSegments}/3 <T zh="类用户" en="segments"/></strong><small><T zh={`另有 ${userStudy.internalReviews} 条团队内部记录，未计入外部证据`} en={`${userStudy.internalReviews} internal team records are retained but excluded`}/></small></div><a href="/api/evaluation/user-study?format=csv"><T zh="导出反馈 CSV" en="Export feedback CSV"/></a></header><div>
        <article className="study-outcome"><span><T zh="完成后的选择" en="Decision after review"/></span><strong><T zh={`${userStudy.modified} 修改 · ${userStudy.maintained} 维持 · ${userStudy.delayed} 延迟`} en={`${userStudy.modified} changed · ${userStudy.maintained} kept · ${userStudy.delayed} delayed`}/></strong><small><T zh="三种结果等权记录，不把维持计划视为失败" en="All three outcomes are recorded neutrally"/></small></article>
        <article><span><T zh="自报看懂风险" en="Self-reported risk understanding"/></span><strong>{userStudy.reviews?Math.round(userStudy.understood/userStudy.reviews*100):0}%</strong></article>
        <article><span><T zh="提交风险复述" en="Submitted a risk restatement"/></span><strong>{userStudy.reviews?Math.round(userStudy.riskRestatements/userStudy.reviews*100):0}%</strong><small><T zh="原文仅供人工核对，不等同于自动判定正确" en="Restatements require human review and are not automatically marked correct"/></small></article>
        <article><span><T zh="愿意再次使用" en="Would use again"/></span><strong>{userStudy.reviews?Math.round(userStudy.repeatIntent/userStudy.reviews*100):0}%</strong></article>
        <article><span><T zh="愿意查看价格方案" en="Would view the price offer"/></span><strong>{userStudy.reviews?Math.round(userStudy.paidIntent/userStudy.reviews*100):0}%</strong><small><T zh="态度题，不计作候补或收入" en="An attitude response, not a waitlist or revenue event"/></small></article>
        <article><span><T zh="平均完成时间" en="Average completion time"/></span><strong>{userStudy.averageSeconds==null?<T zh="暂无" en="None yet"/>:<>{userStudy.averageSeconds} <T zh="秒" en="sec"/></>}</strong></article>
      </div><p><T zh="所有问题默认未选择，只有用户明确作答并同意匿名体验研究后才计入；风险复述需要人工核对是否准确。" en="No answer is preselected. Responses count only after explicit consent; risk restatements require human review."/></p></section>
      <section className="study-cohort-coverage"><header><div><span><T zh="招募配额" en="Recruitment quota"/></span><strong><T zh="三类目标用户各 5 位" en="Five users in each of three target segments"/></strong></div><small><T zh="同一参与者在同一类别只计一次" en="Each participant counts once per segment"/></small></header><div>{segments.map(([zh,en])=><article key={zh}><span><T zh={zh} en={en}/></span><strong>{userStudy.segments[zh]??0}<small>/5</small></strong><i><b style={{width:`${Math.min(100,(userStudy.segments[zh]??0)/5*100)}%`}}/></i></article>)}</div></section>
      <section className="pilot-evidence"><div><span><T zh="旁证 · 交易前审查价格测试（不计入本轮策略 MVP）" en="Supporting evidence · pre-trade review pricing test (excluded from this strategy MVP)"/></span><strong>¥{pilot.offer.priceMonthly}<T zh="/月 · 每周持仓判断复核" en="/month · weekly portfolio decision review"/></strong><small><T zh={`${pilot.exposed} 位外部用户看过方案，${pilot.joined} 人当前在候补，转化率 ${conversionRate}%。另有 ${pilot.internalExposed} 次内部曝光、${pilot.internalJoined} 次内部加入，均未计入。尚未接支付，不把态度题算作收入。`} en={`${pilot.exposed} external users saw the offer and ${pilot.joined} joined the waitlist; conversion ${conversionRate}%. ${pilot.internalExposed} internal exposures and ${pilot.internalJoined} internal joins are excluded. Payments are not connected, and attitude questions are not counted as revenue.`}/></small></div><Link href="/pilot"><T zh="查看并加入测试" en="View and join the test"/></Link></section>
      <section className="evaluation-table"><header><div><span><T zh="规则基线明细" en="Rule-baseline details"/></span><strong><T zh="每项都可在服务器重新计算" en="Every check can be recomputed on the server"/></strong></div><FlaskConical/></header><div className="evaluation-table-head"><b><T zh="编号" en="ID"/></b><b><T zh="场景" en="Scenario"/></b><b><T zh="预期" en="Expected"/></b><b><T zh="实际" en="Observed"/></b><b><T zh="结果" en="Result"/></b></div>{baseline.cases.map(item=><div key={item.id}><code>{item.id}</code><span title={item.input}><T zh={item.category} en={item.category==="社交内容风险"?"Social-content risk":"Pre-trade rule"}/></span><span><T zh={item.expected} en="Expected policy behavior"/></span><span><T zh={item.actual} en={item.passed?"Deterministic output matched":"Deterministic output differed"}/></span><strong className={item.passed?"pass":"fail"}><T zh={item.passed?"通过":"失败"} en={item.passed?"Pass":"Fail"}/></strong></div>)}</section>
      <aside className="evaluation-next"><div><strong><T zh="下一阶段需要验证什么" en="What must be validated next"/></strong><p><T zh="运行固定模型任务集；邀请目标用户完成同一核心流程；验证持续使用与付费测试意愿。缺少真实证据时，本页会明确显示“尚未验证”。" en="Run the fixed model tasks, invite target users through the same core flow, and measure repeat use and payment behavior. Missing evidence remains explicitly unverified."/></p></div><span><Link href="/demo"><T zh="打开 90 秒演示" en="Open 90-second demo"/></Link><Link href="/ai-settings"><T zh="检查模型状态" en="Check model status"/></Link></span></aside>
    </section>
  </ProductToolShell>;
}
