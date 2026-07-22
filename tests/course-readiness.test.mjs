import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("keeps one primary entry on the quant research page", () => {
  const page = read("app/quant/page.tsx");
  assert.match(page, /<QuantWorkspace \/>/);
  assert.doesNotMatch(page, /QuantGoalRouter|NaturalStrategyAssistant/);
});

test("shows the real AI state even when only rule mode is available", () => {
  const workbench = read("app/components/personal-workbench.tsx");
  assert.match(workbench, /<AIModelHomeCard providers=\{aiProviders\}\/>/);
  assert.match(workbench, /AI 自由对话未启用；确定性检查仍可使用/);
});

test("exposes behavior evidence without presenting it as population proof", () => {
  const workbench = read("app/components/personal-workbench.tsx");
  assert.match(workbench, /审查是否真的改变了决定/);
  assert.match(workbench, /当前账户的真实记录，不代表所有用户/);
  assert.match(workbench, /修改或延迟/);
});

test("opens stock research on the evidence summary instead of an empty chart", () => {
  const research = read("app/client-page.tsx");
  assert.match(research, /useState<"概览" \| "财报体检"[\s\S]*?>\("概览"\)/);
  assert.match(research, /setPanel\("概览"\)/);
  assert.match(research, /submittedQuery\.trim\(\) \|\| "检查近期正式披露"/);
  assert.match(research, /aria-label="返回安心看股工作台"/);
  assert.match(research, /label: "研究概览"/);
  assert.match(research, /href: "\/quant", label: "量化研究"/);
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
  assert.match(page, /零样本保持为零/);
});

test("provides a clearly labelled 90-second teaching walkthrough",()=>{
  const demo=read("app/components/demo-walkthrough.tsx");
  const page=read("app/demo/page.tsx");
  assert.match(demo,/教学快照/);
  assert.match(demo,/不代表当前行情/);
  assert.match(demo,/不连接券商/);
  assert.match(demo,/计划后单股占比 35%/);
  assert.match(page,/90 秒课堂演示/);
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

test("does not label the initial health check as a retrying failure",()=>{
  const status=read("app/components/system-reliability-center.tsx");
  assert.match(status,/status\?label\[status\]:"检查中"/);
  assert.match(status,/正在读取，不代表故障/);
  assert.doesNotMatch(status,/status=data\?\.status\.status\?\?"retrying"/);
});
