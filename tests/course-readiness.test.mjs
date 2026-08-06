import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const root=fileURLToPath(new URL("..",import.meta.url));
function execute(script){const result=spawnSync(process.execPath,["--import","tsx","--input-type=module","--eval",script],{cwd:root,encoding:"utf8"});assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout.trim());}

test("keeps one presentation-first entry into Strategy Lab", () => {
  const page = read("app/quant/page.tsx");
  const home = read("app/components/strategy-lab-home.tsx");
  assert.match(page, /<StrategyLabHome \/>/);
  assert.match(home, /把一句投资想法/);
  assert.match(home, /href="\/quant\/factors"/);
  assert.doesNotMatch(page, /QuantWorkspace|QuantGoalRouter|NaturalStrategyAssistant/);
});

test("shows the real AI state in the product shell without making it home content", () => {
  const workbench = read("app/components/personal-workbench.tsx");
  assert.match(workbench, /pick\(isEnglish, "模型设置", "AI models"\).*<Badge variant="outline">/);
  assert.match(workbench, /providerId === "mock" \? pick\(isEnglish, "规则可用", "Rules available"\)/);
  assert.doesNotMatch(workbench, /function AIModelHomeCard/);
});

test("keeps behavior evidence in evaluation surfaces instead of the product home", () => {
  const workbench = read("app/components/personal-workbench.tsx");
  const evaluation = read("app/evaluation/page.tsx");
  assert.doesNotMatch(workbench, /课程验证仍需汇总/);
  assert.match(evaluation, /跨用户证据/);
  assert.match(evaluation, /策略研究室外部新手漏斗/);
});

test("publishes one falsifiable Module 8 evidence contract instead of calling the working slice validated",()=>{
  const contract=read("app/lib/mvp-evidence-contract.ts");
  const panel=read("app/components/mvp-evidence-contract.tsx");
  const page=read("app/evaluation/page.tsx");
  const memo=read("../MVP_EVIDENCE_CONTRACT.md");
  for(const field of ["criticalAssumption","observableBehavior","experiment","verticalSlice","primaryMetric","guardrails","releaseBoundary","decisionRules"])assert.match(contract,new RegExp(field));
  assert.match(contract,/首轮 5\/5 能完成；扩展样本至少 15 人且完成率 ≥80%/);
  assert.match(contract,/至少 40% 在 14 天后自然回来重检/);
  assert.match(panel,/唯一主指标/);
  assert.match(panel,/工程就绪，外部证据未完成/);
  assert.match(panel,/继续 \/ 收窄 \/ 转向 \/ 停止/);
  assert.match(page,/MvpEvidenceContract/);
  assert.match(memo,/工程上已具备 MVP 实验条件/);
  assert.match(memo,/不是“MVP 已验证”/);
});

test("makes Strategy Lab the single course MVP and records a privacy-minimized behavior funnel",()=>{
  const scope=read("../MVP_SCOPE.md");
  const adr=read("../docs/decisions/0006-strategy-lab-course-mvp.md");
  const pilot=read("app/components/strategy-lab-pilot.tsx");
  const route=read("app/api/evaluation/strategy-lab/route.ts");
  const store=read("app/lib/strategy-lab-study.ts");
  const flow=read("app/components/strategy-research/strategy-research-flow.tsx");
  assert.match(scope,/\/pilot\/strategy-lab/);
  assert.match(adr,/状态：Accepted/);
  assert.match(pilot,/不会保存输入正文、股票代码、金额或身份/);
  for(const event of ["plan_created","run_started","run_completed","result_viewed","save_completed","comprehension_submitted","abandoned"])assert.match(store,new RegExp(event));
  assert.match(flow,/onStudyEvent\?\.\("save_completed"/);
  assert.match(route,/isPilotReleaseEnabled/);
  assert.match(route,/format.*csv/);
  assert.doesNotMatch(store,/original_input|custom_symbols|thesis_plain/);
  assert.match(pilot,/Method saved—check three ideas/);
  assert.match(pilot,/understandingScore/);
  assert.match(store,/understanding_score/);
  assert.match(store,/transitionRequirements/);
  assert.match(store,/UNIQUE\(session_key,event_name,attempt_index\)/);
  assert.match(store,/14 \* DAY/);
  assert.match(store,/HMAC/);
  assert.match(route,/resolveStrategyLabInvite/);
  assert.match(route,/configuredStrategyLabBuildId/);
  assert.match(route,/\.\.\.body,\.\.\.invite,buildId/);
  assert.match(route,/recordStrategyLabSafetyReview/);
  assert.doesNotMatch(pilot,/setRelation\("external"\)/);
  assert.match(pilot,/Invitation code/);
});

test("requires every precommitted evidence gate before declaring the MVP ready",()=>{
  const passing={participants:15,started:15,saved:12,firstFiveSaved:5,revisited:6,comprehensionPassed:12,completionSeconds:300,p95RunSeconds:10,safetyIncidents:0,safetyReviewed:true,segments:{"投资经验不足1年":5,"ETF或长期持有":5,"近3个月主动交易":5}};
  const script=`const {evaluateStrategyLabMvpEvidence}=await import('./app/lib/mvp-evidence-contract.ts');const passing=${JSON.stringify(passing)};console.log(JSON.stringify({pass:evaluateStrategyLabMvpEvidence(passing).ready,firstFive:evaluateStrategyLabMvpEvidence({...passing,firstFiveSaved:4}).ready,understanding:evaluateStrategyLabMvpEvidence({...passing,comprehensionPassed:11}).ready,coverage:evaluateStrategyLabMvpEvidence({...passing,segments:{...passing.segments,'近3个月主动交易':4}}).ready,revisit:evaluateStrategyLabMvpEvidence({...passing,revisited:5}).ready,latency:evaluateStrategyLabMvpEvidence({...passing,p95RunSeconds:11}).ready,safetyUnknown:evaluateStrategyLabMvpEvidence({...passing,safetyIncidents:null,safetyReviewed:false}).ready}));`;
  assert.deepEqual(execute(script),{pass:true,firstFive:false,understanding:false,coverage:false,revisit:false,latency:false,safetyUnknown:false});
});

test("enforces the study event state machine and 14-day revisit boundary as behavior",()=>{
  const script=`const {assessStrategyLabTransition,isStrategyLabRevisit}=await import('./app/lib/strategy-lab-study.ts');const attempt=(events,next)=>{try{return assessStrategyLabTransition(events,next)}catch(error){return error.message}};const actual=[];let events=[];for(const event of ['lab_viewed','plan_created','run_started','run_completed','result_viewed','save_started','save_completed','comprehension_submitted']){actual.push(attempt(events,event));events=[...events,event]}const day=86400000;const now=Date.parse('2026-07-31T00:00:00.000Z');console.log(JSON.stringify({valid:actual,outOfOrder:attempt(['lab_viewed'],'save_completed'),duplicate:attempt(['lab_viewed'],'lab_viewed'),terminal:attempt(['lab_viewed','abandoned'],'plan_created'),day13:isStrategyLabRevisit(new Date(now-13*day).toISOString(),now),day14:isStrategyLabRevisit(new Date(now-14*day).toISOString(),now)}));`;
  assert.deepEqual(execute(script),{valid:Array(8).fill("record"),outOfOrder:"体验事件顺序无效：save_completed",duplicate:"idempotent",terminal:"该体验会话已经结束",day13:false,day14:true});
});

test("records failed attempts and retries as separate state-machine events",()=>{
  const script=`const {assessStrategyLabEventTransition}=await import('./app/lib/strategy-lab-study.ts');const event=(event_name,attempt_index=0)=>({event_name,attempt_index});const base=[event('lab_viewed'),event('plan_created'),event('run_started',1),event('run_failed',1)];const attempt=(rows,next,index)=>{try{return assessStrategyLabEventTransition(rows,next,index)}catch(error){return error.message}};console.log(JSON.stringify({retry:attempt(base,'run_started',2),duplicate:attempt(base,'run_failed',1),skip:attempt(base,'run_started',3),completeWithoutStart:attempt(base,'run_completed',2)}));`;
  assert.deepEqual(execute(script),{retry:"record",duplicate:"idempotent",skip:"重试必须紧接上一次失败",completeWithoutStart:"运行结果缺少对应的开始事件"});
});

test("freezes active cohort/build and fails safety evidence closed",()=>{
  const store=read("app/lib/strategy-lab-study.ts");
  const privacy=read("../PRIVACY_DATA_MAP.md");
  assert.match(store,/strategy_lab_study_cohorts/);
  assert.match(store,/该招募批次已绑定其他构建或样本关系/);
  assert.match(store,/生产环境必须配置策略体验构建编号/);
  assert.match(store,/strategy_lab_safety_reviews/);
  assert.match(store,/当前外部批次尚无可复核体验记录/);
  assert.match(store,/isSafetyReviewCurrent/);
  assert.match(store,/safetyIncidents: null/);
  assert.match(store,/created_at >= datetime\('now','-90 days'\)/);
  assert.match(privacy,/过期行可能晚于第 90 天物理擦除/);
});

test("invalidates a safety review when new cohort events arrive",()=>{
  const script=`const {isSafetyReviewCurrent}=await import('./app/lib/strategy-lab-study.ts');console.log(JSON.stringify({empty:isSafetyReviewCurrent('2026-07-31T12:00:00.000Z',[]),current:isSafetyReviewCurrent('2026-07-31T12:00:00.000Z',['2026-07-31T11:00:00.000Z','2026-07-31T12:00:00.000Z']),stale:isSafetyReviewCurrent('2026-07-31T12:00:00.000Z',['2026-07-31T12:00:00.001Z']),invalid:isSafetyReviewCurrent('bad',['2026-07-31T11:00:00.000Z'])}));`;
  assert.deepEqual(execute(script),{empty:false,current:true,stale:false,invalid:false});
});

test("carries a reconstructable planning trace without storing prompts",()=>{
  const types=read("app/lib/strategy-research/types.ts");
  const planner=read("app/lib/strategy-research/planner.ts");
  const server=read("app/lib/strategy-research/server.ts");
  const harness=read("app/lib/strategy-research/research-harness.ts");
  for(const field of ["template_version","attempted_providers","latency_ms","fallback_reason","schema_valid","usage_status"])assert.match(types,new RegExp(field));
  assert.match(planner,/strategy-planner-v1/);
  assert.match(server,/response\.provider/);
  assert.match(server,/response\.model/);
  assert.match(server,/planning_trace:run\.planning_trace/);
  assert.match(harness,/planning_trace:input\.plan\.planning_trace/);
});

test("uses an effective release gate that stops new pilot writes but preserves reads and deletion",()=>{
  const behavior=execute(`const {isPilotReleaseEnabled}=await import('./app/lib/mvp-evidence-contract.ts');console.log(JSON.stringify({defaultOn:isPilotReleaseEnabled(undefined),falseOff:isPilotReleaseEnabled('false'),caseOff:isPilotReleaseEnabled(' FALSE '),trueOn:isPilotReleaseEnabled('true')}));`);
  assert.deepEqual(behavior,{defaultOn:false,falseOff:false,caseOff:false,trueOn:true});
  assert.match(read("../.env.example"),/MVP_PILOT_ENABLED=false/);
  const pilotPage=read("app/pilot/page.tsx");
  const studyRoute=read("app/api/evaluation/user-study/route.ts");
  const pilotRoute=read("app/api/evaluation/pilot/route.ts");
  const labRoute=read("app/api/evaluation/strategy-lab/route.ts");
  assert.match(pilotPage,/if\(!isPilotReleaseEnabled\(\)\)/);
  assert.match(studyRoute,/export async function POST[\s\S]*if\(!isPilotReleaseEnabled\(\)\)/);
  assert.match(pilotRoute,/export async function POST[\s\S]*if\(!isPilotReleaseEnabled\(\)\)/);
  assert.match(labRoute,/export async function POST[\s\S]*if \(!isPilotReleaseEnabled\(\)\)/);
  assert.doesNotMatch(studyRoute,/export async function DELETE[\s\S]*isPilotReleaseEnabled/);
});

test("opens stock research on the evidence summary instead of an empty chart", () => {
  const research = read("app/client-page.tsx");
  const navigation = read("app/components/app-navigation.tsx");
  assert.match(research, /useState<"概览" \| "财报体检"[\s\S]*?>\("价格与事件"\)/);
  assert.match(research, /setPanel\("价格与事件"\)/);
  assert.match(research, /submittedQuery\.trim\(\) \|\| "检查近期正式披露"/);
  assert.match(research, /<AppNavigation/);
  assert.match(navigation, /Market Clarity 安心看股工作台/);
  assert.match(navigation, /Market Clarity investment workspace/);
  assert.match(navigation, /href: "\/analysis\?view=research", label: "股票研究"/);
  assert.match(navigation, /href: "\/quant", label: "量化研究"/);
});

test("does not wait for an unconfigured local evidence backend", () => {
  const route = read("app/api/evidence/[code]/route.ts");
  assert.match(route, /if \(!process\.env\.ANXIN_API_URL\) throw new Error/);
  assert.match(route, /Promise\.any/);
  assert.match(route, /recent-cache/);
});

test("serves recent market research quickly and skips unconfigured local services", () => {
  const route = read("app/api/information/[code]/route.ts");
  const rules = read("app/lib/personal-workbench.ts");
  assert.match(route, /readCached<Record<string, unknown>>\(cacheKey, 5 \* 60 \* 1000\)/);
  assert.match(route, /process\.env\.DAILY_STOCK_ANALYSIS_URL \? requestJson/);
  assert.match(route, /process\.env\.ANXIN_API_URL \? requestJson/);
  assert.doesNotMatch(route, /useLocalDefaults/);
  assert.match(rules, /"最后机会"/);
});

test("runs a transparent 20-case rules baseline and keeps model evidence separate", () => {
  const evaluation = read("app/lib/course-evaluation.ts");
  const page = read("app/evaluation/page.tsx");
  const route = read("app/api/evaluation/model/route.ts");
  assert.equal((evaluation.match(/\["S\d{2}"/g) ?? []).length, 10);
  assert.equal((evaluation.match(/id:"P\d{2}"/g) ?? []).length, 10);
  assert.match(page, /真实模型评测/);
  assert.match(page, /跨用户证据/);
  assert.match(page, /不会用 Mock 冒充模型结果/);
  assert.equal((evaluation.match(/id:"M\d{2}"/g) ?? []).length, 20);
  assert.match(route, /providerId!=="mock"/);
  assert.match(route, /modelEvaluationRuns/);
  assert.match(evaluation, /rawOutput/);
  const study = read("app/lib/user-study.ts");
  const studyRoute = read("app/api/evaluation/user-study/route.ts");
  assert.match(study, /COUNT\(DISTINCT participant_key\)/);
  assert.match(study, /SHA-256/);
  assert.match(studyRoute, /format.*csv/);
  assert.match(page, /所有问题默认未选择/);
  assert.match(studyRoute, /export async function DELETE/);
  assert.match(studyRoute, /confirmed!==true/);
  assert.match(page, /三类目标用户各 5 位/);
  const decision = read("app/client-page.tsx");
  assert.match(decision, /删除我的匿名体验反馈/);
  assert.match(decision, /consent:Boolean\(feedback\.consentedAtIso\)/);
  assert.doesNotMatch(decision, /satisfaction:4/);
});

test("evaluates the real assistant policy with explainable, negation-aware criteria", () => {
  const evaluation = read("app/lib/course-evaluation.ts");
  const route = read("app/api/evaluation/model/route.ts");
  const runner = read("app/components/evaluation-runner.tsx");
  assert.match(route, /ASSISTANT_SYSTEM_PROMPT/);
  assert.match(evaluation, /missingCriteria/);
  assert.match(evaluation, /isNegated/);
  assert.match(evaluation, /不可信\|不可取/);
  assert.match(evaluation, /model-safety-2026-07-23\.2/);
  assert.match(runner, /缺少","Missing/);
  assert.match(runner, /风险表达","Risk phrase/);
});

test("runs three reproducible Agent tasks without presenting them as user evidence",()=>{
  const scoring=read("app/lib/agent-functional-evaluation.ts");
  const route=read("app/api/evaluation/agent/route.ts");
  const page=read("app/evaluation/page.tsx");
  assert.match(scoring,/id:"beginner"/);
  assert.match(scoring,/id:"portfolio"/);
  assert.match(scoring,/id:"research"/);
  assert.match(scoring,/不是外部用户满意度、留存或付费证据/);
  assert.match(scoring,/不擅自创建提醒、自选或模拟交易/);
  assert.match(scoring,/返回真实行情与价格/);
  assert.match(route,/尚未连接真实模型/);
  assert.match(route,/cancelAgentTask/);
  assert.match(page,/AgentFunctionalEvaluationRunner/);
});

test("provides a clearly labelled 90-second teaching walkthrough",()=>{
  const demo=read("app/components/demo-walkthrough.tsx");
  const page=read("app/demo/page.tsx");
  assert.match(demo,/可操作教学场景/);
  assert.match(demo,/type="number"/);
  assert.match(demo,/demo-reason-options/);
  assert.match(demo,/不连接券商/);
  assert.match(demo,/afterWeight/);
  assert.match(demo,/维持原计划/);
  assert.match(demo,/"已修改" \| "维持计划" \| "已延迟"/);
  assert.match(demo,/完成任务并填写匿名反馈/);
  assert.match(page,/90 秒产品演示/);
});

test("gives external participants one neutral task-to-feedback-to-offer journey",()=>{
  const page=read("app/pilot/page.tsx");
  const journey=read("app/components/pilot-journey.tsx");
  assert.match(page,/PilotJourney/);
  assert.match(page,/早期用户体验研究/);
  assert.match(journey,/PARTICIPANT_SEGMENTS/);
  assert.match(journey,/ParticipantRelation/);
  assert.match(journey,/我是外部体验者/);
  assert.match(journey,/DemoWalkthrough onComplete/);
  assert.match(journey,/status: "started"/);
  assert.match(journey,/status: "task_completed"/);
  assert.match(journey,/status: "feedback_submitted"/);
  assert.match(journey,/status: "abandoned"/);
  assert.match(journey,/没有标准答案/);
  assert.match(journey,/没有预选答案/);
  assert.match(journey,/只有下一页主动加入候补才算行为证据/);
  assert.match(journey,/PilotEnrollment/);
});

test("uses an action-based pricing experiment instead of counting an attitude question as revenue",()=>{
  const pilot=read("app/lib/pilot-study.ts");
  const page=read("app/components/pilot-enrollment.tsx");
  const evaluation=read("app/evaluation/page.tsx");
  assert.match(pilot,/priceMonthly:19/);
  assert.match(pilot,/status='joined'/);
  assert.match(pilot,/pilot_exposures/);
  assert.match(pilot,/view_count/);
  assert.match(pilot,/participant_relation='external'/);
  assert.match(pilot,/internal_exposed/);
  assert.match(page,/14 天付费测试/);
  assert.match(page,/event:"view"/);
  assert.match(page,/participantRelation/);
  assert.match(page,/不会自动扣费/);
  assert.match(evaluation,/旁证 · 交易前审查价格测试（不计入本轮策略 MVP）/);
  assert.match(evaluation,/均未计入/);
  assert.match(evaluation,/不把态度题算作收入/);
});

test("measures the real task funnel instead of only completed feedback",()=>{
  const study=read("app/lib/user-study.ts");
  const decision=read("app/client-page.tsx");
  const evaluation=read("app/evaluation/page.tsx");
  assert.match(study,/user_study_sessions/);
  assert.match(study,/"started"\|"task_completed"\|"feedback_submitted"\|"abandoned"/);
  assert.match(study,/30 minutes/);
  assert.match(study,/participant_relation='external'/);
  assert.match(study,/participantKey=await digest\(`participant:\$\{owner\}`\)/);
  assert.match(study,/feedback_submitted/);
  assert.match(study,/ON CONFLICT\(owner_key,session_key\) DO UPDATE/);
  assert.match(study,/quick_completed/);
  assert.match(study,/engaged_completed/);
  assert.match(decision,/status:"started"/);
  assert.match(decision,/status:"task_completed"/);
  assert.match(decision,/status:"abandoned"/);
  assert.match(decision,/navigator\.sendBeacon/);
  assert.match(evaluation,/旁证 · 交易前审查任务（不计入本轮策略 MVP）/);
  assert.match(evaluation,/完成率/);
  assert.match(evaluation,/转化率/);
  assert.match(evaluation,/15 秒内快速结束/);
  assert.match(evaluation,/愿意查看价格方案/);
  assert.match(evaluation,/态度题，不计作候补或收入/);
});

test("documents a reproducible external validation protocol",()=>{
  const runbook=read("REAL_VALIDATION_RUNBOOK.md");
  const loop=read("CRITICAL_LOOP_ITERATION_04.md");
  assert.match(runbook,/15 分钟单人流程/);
  assert.match(runbook,/不提示点击顺序/);
  assert.match(runbook,/外部用户样本 ≥ 15/);
  assert.match(loop,/\*\*90\/100\*\*/);
  assert.match(loop,/0 位外部参与者/);
});

test("measures live market and disclosure route reliability on a fixed sample",()=>{
  const runner=read("app/components/data-source-evaluation-runner.tsx");
  const store=read("app/lib/data-source-evaluation.ts");
  const sample=read("app/lib/data-source-evaluation-sample.ts");
  const page=read("app/evaluation/page.tsx");
  assert.match(runner,/10 只固定样本/);
  assert.equal((sample.match(/code:"\d{6}"/g)??[]).length,10);
  assert.match(store,/固定样本顺序或内容已被修改/);
  assert.match(store,/cleanStatus/);
  assert.match(store,/超出允许范围/);
  assert.match(runner,/\/api\/information\/\$\{item\.code\}/);
  assert.match(runner,/\/api\/evidence\/\$\{item\.code\}/);
  assert.match(store,/p50LatencyMs/);
  assert.match(store,/p95LatencyMs/);
  assert.match(store,/cacheHitRate/);
  assert.match(store,/sourceCoverageRate/);
  assert.match(store,/样本只代表本次时间与网络环境/);
  assert.match(page,/DataSourceEvaluationRunner/);
  assert.doesNotMatch(runner,/cache_hit&&value!=="healthy"/);
  assert.doesNotMatch(runner,/演示行情|模拟行情/);
});

test("keeps the fifth judge score tied to measured data evidence",()=>{
  const loop=read("CRITICAL_LOOP_ITERATION_05.md");
  const judge=read("COURSE_JUDGE_REVIEW.md");
  assert.match(loop,/\*\*92\/100\*\*/);
  assert.match(loop,/P95 延迟 \| 1,069 ms/);
  assert.match(loop,/0 \/ 20 \/ 0 \/ 0/);
  assert.match(judge,/当前可辩护分数为 \*\*92\/100\*\*/);
  assert.match(loop,/仍不宣称 95/);
});

test("keeps the 95-point claim behind external evidence gates",()=>{
  const audit=read("MVP_95_COMPLETION_AUDIT.md");
  assert.match(audit,/已部署版本的可辩护课程分为 \*\*82\/100\*\*/);
  assert.match(audit,/候选版本为 \*\*86\/100\*\*/);
  assert.match(audit,/此前 92 分的判断忽略了/);
  assert.match(audit,/0 位外部参与者/);
  assert.match(audit,/固定 20 题为 19\/20/);
  assert.match(audit,/生产站点尚未发布这次评测改造/);
  assert.match(audit,/三类用户各 5 位/);
  assert.match(audit,/至少 5 位用户主动加入/);
  assert.match(audit,/不得用于抬分的材料/);
});

test("does not label the initial health check as a retrying failure",()=>{
  const status=read("app/components/system-reliability-center.tsx");
  assert.match(status,/status\?\(isEnglish\?englishLabel\[status\]:label\[status\]\)/);
  assert.match(status,/正在读取，不代表故障/);
  assert.doesNotMatch(status,/status=data\?\.status\.status\?\?"retrying"/);
});

test("keeps every model turn compact and option-led",()=>{
  const assistant=read("app/lib/assistant-server.ts");
  assert.match(assistant,/normalizeAssistantEnvelope/);
  assert.match(assistant,/不超过 180 个汉字的直接回答/);
  assert.match(assistant,/最多一个必要问题/);
  assert.match(assistant,/modelOptions\.length\?"clarification"/);
});
