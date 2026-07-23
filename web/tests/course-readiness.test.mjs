import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("keeps one primary entry on the quant research page", () => {
  const page = read("app/quant/page.tsx");
  assert.match(page, /<QuantWorkspace \/>/);
  assert.doesNotMatch(page, /QuantGoalRouter|NaturalStrategyAssistant/);
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
  assert.match(evaluation, /核心任务漏斗/);
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
  assert.match(runner, /缺少：/);
  assert.match(runner, /风险表达：/);
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
  assert.match(page,/90 秒产品演示/);
});

test("uses an action-based pricing experiment instead of counting an attitude question as revenue",()=>{
  const pilot=read("app/lib/pilot-study.ts");
  const page=read("app/components/pilot-enrollment.tsx");
  const evaluation=read("app/evaluation/page.tsx");
  assert.match(pilot,/priceMonthly:19/);
  assert.match(pilot,/status='joined'/);
  assert.match(pilot,/pilot_exposures/);
  assert.match(pilot,/view_count/);
  assert.match(page,/14 天付费测试/);
  assert.match(page,/event:"view"/);
  assert.match(page,/不会自动扣费/);
  assert.match(evaluation,/不把态度题算作收入/);
});

test("measures the real task funnel instead of only completed feedback",()=>{
  const study=read("app/lib/user-study.ts");
  const decision=read("app/client-page.tsx");
  const evaluation=read("app/evaluation/page.tsx");
  assert.match(study,/user_study_sessions/);
  assert.match(study,/"started"\|"completed"\|"abandoned"/);
  assert.match(study,/30 minutes/);
  assert.match(study,/WHEN user_study_sessions\.status='completed' THEN 'completed'/);
  assert.match(study,/ON CONFLICT\(owner_key,session_key\) DO UPDATE/);
  assert.match(study,/quick_completed/);
  assert.match(study,/engaged_completed/);
  assert.match(decision,/status:"started"/);
  assert.match(decision,/status:"completed"/);
  assert.match(decision,/status:"abandoned"/);
  assert.match(decision,/navigator\.sendBeacon/);
  assert.match(evaluation,/核心任务漏斗/);
  assert.match(evaluation,/完成率/);
  assert.match(evaluation,/转化率/);
  assert.match(evaluation,/15 秒内快速结束/);
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
