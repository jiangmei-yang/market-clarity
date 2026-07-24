import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("persists a real Chinese and English interface preference", () => {
  const provider = read("app/i18n.tsx");
  assert.match(provider, /market-clarity:locale/);
  assert.match(provider, /window\.localStorage\.setItem/);
  assert.match(provider, /document\.documentElement\.lang = locale/);
  assert.match(provider, /market_clarity_locale/);
});

test("exposes an accessible language switch in the shared navigation", () => {
  const navigation = read("app/components/app-navigation.tsx");
  assert.match(navigation, /Interface language/);
  assert.match(navigation, /setLocale\("zh-CN"\)/);
  assert.match(navigation, /setLocale\("en"\)/);
  assert.match(navigation, /aria-pressed/);
  assert.match(navigation, /Stock research/);
  assert.match(navigation, /Pre-trade review/);
  assert.match(navigation, /Product guide/);
});

test("localizes the decision-led workspace and cross-route product shell", () => {
  const workbench = read("app/components/personal-workbench.tsx");
  const shell = read("app/components/product-tool-shell.tsx");
  const guide = read("app/components/contextual-guide.tsx");
  const assistant = read("app/components/global-ai-assistant.tsx");
  assert.match(workbench, /Today’s decision desk/);
  assert.match(workbench, /Continue research or review a decision/);
  assert.match(workbench, /Market overview/);
  assert.match(workbench, /Latest formal information/);
  assert.match(workbench, /Example watchlist · public market data/);
  assert.match(workbench, /Long-term investing/);
  assert.match(shell, /ETF diagnosis/);
  assert.match(shell, /Quant research/);
  assert.match(shell, /Task agent/);
  assert.match(guide, /Workspace quick start/);
  assert.match(guide, /Using stock research/);
  assert.match(assistant, /Open research assistant/);
  assert.match(assistant, /Find sources, calculate impact/);
  assert.match(assistant, /Rule tools available/);
});

test("keeps the full 90-second decision demo usable in English", () => {
  const demo = read("app/components/demo-walkthrough.tsx");
  assert.match(demo, /Interactive teaching scenario/);
  assert.match(demo, /How much are you planning to add/);
  assert.match(demo, /Evidence still missing/);
  assert.match(demo, /The system does not execute for you/);
  assert.match(demo, /information → verification → personal impact → your decision/);
});

test("keeps the course evidence center usable in English",()=>{
  const page=read("app/evaluation/page.tsx");
  const model=read("app/components/evaluation-runner.tsx");
  const agent=read("app/components/agent-functional-evaluation-runner.tsx");
  const sources=read("app/components/data-source-evaluation-runner.tsx");
  assert.match(page,/Current reproducible baseline/);
  assert.match(page,/Cross-user evidence/);
  assert.match(page,/External-user task funnel/);
  assert.match(page,/deduplicated participants/);
  assert.match(page,/attitude response, not a waitlist or revenue event/);
  assert.match(page,/External-user behavioral price test/);
  assert.match(page,/What must be validated next/);
  assert.match(model,/Fixed real-model task set/);
  assert.match(agent,/Three Agent functional tasks/);
  assert.match(sources,/Live data-route sampling/);
});

test("keeps the behavioral price offer usable in English",()=>{
  const offer=read("app/components/pilot-enrollment.tsx");
  assert.match(offer,/Weekly portfolio decision review/);
  assert.match(offer,/Single-price experiment · no payment connection/);
  assert.match(offer,/Join the 14-day paid test/);
  assert.match(offer,/A waitlist is not a subscription/);
});

test("keeps the core stock research and evidence path usable in English",()=>{
  const page=read("app/client-page.tsx");
  assert.match(page,/Research a specific question/);
  assert.match(page,/Prices & events/);
  assert.match(page,/Key metrics for this range/);
  assert.match(page,/Candles/);
  assert.match(page,/Open \/ High/);
  assert.match(page,/Event and price comparison/);
  assert.match(page,/How evidence affects the thesis/);
  assert.match(page,/Current source status/);
  assert.match(page,/What are you considering\?/);
  assert.match(page,/Position and downside scenarios are calculated next/);
  assert.match(page,/Data and sources/);
});

test("keeps all six stock research views operable in English",()=>{
  const page=read("app/client-page.tsx");
  const financial=read("app/components/financial-health-panel.tsx");
  assert.match(financial,/Financial statement cross-checks/);
  assert.match(financial,/Data and methodology/);
  assert.match(financial,/Interpretation boundary/);
  assert.match(page,/Quantitative verification/);
  assert.match(page,/Generate test conditions/);
  assert.match(page,/Stability checks/);
  assert.match(page,/Research summary/);
  assert.match(page,/Market signals/);
  assert.match(page,/What to verify next/);
  assert.match(page,/What change would invalidate the thesis/);
});

test("keeps ETF diagnosis and trade review fully operable in English",()=>{
  const etf=read("app/components/etf-workspace.tsx");
  const trade=read("app/components/trade-review-workspace.tsx");
  for(const label of [
    "Add ETFs",
    "Check underlying exposure",
    "Underlying exposure will appear here",
    "Overlapping underlying holdings",
    "Top five disclosed holdings by ETF",
    "Data coverage and disclosure dates",
  ]) assert.match(etf,new RegExp(label));
  assert.match(etf,/useI18n/);
  assert.match(etf,/toLocaleDateString\(locale/);
  for(const label of [
    "Import trade records",
    "Run review",
    "Positions and realized results",
    "FIFO match details",
    "Trade timeline",
    "Unrealized P&L and market value",
  ]) assert.match(trade,new RegExp(label));
  assert.match(trade,/useI18n/);
  assert.match(trade,/toLocaleDateString\(locale/);
});

test("keeps portfolio checks and personal rules fully operable in English",()=>{
  const workbench=read("app/components/personal-workbench.tsx");
  const profileParser=read("app/lib/personal-workbench.ts");
  for(const label of [
    "Personal rules",
    "Choose a starting point",
    "Create candidate rules",
    "Candidate rules extracted from your description",
    "Single-asset limit",
    "Confirm and enable",
    "Portfolio check",
    "Portfolio value",
    "Largest position",
    "Expand sector exposure for details",
    "Main contributors:",
    "Check for underlying overlap",
    "Import trade CSV",
  ]) assert.match(workbench,new RegExp(label));
  assert.match(profileParser,/single \(\?:position\|asset\|holding\|stock\|ETF\)/);
  assert.match(profileParser,/cash flow/);
  assert.match(profileParser,/maximum loss/);
});

test("keeps the complete claim-check flow operable in English",()=>{
  const workbench=read("app/components/personal-workbench.tsx");
  const rules=read("app/lib/personal-workbench.ts");
  for(const label of [
    "Separate the claim from the evidence before applying your rules",
    "Check the original wording",
    "Upload screenshot",
    "Why these items need verification",
    "Continue to the trade-plan check",
    "Reason for interest",
    "Expected holding period",
    "Review rules and portfolio impact",
    "Direct rule conflicts",
    "Answer before deciding",
    "Decide later",
  ]) assert.match(workbench,new RegExp(label));
  assert.match(workbench,/opportunitySignalCopy/);
  assert.match(workbench,/precheckItemCopy/);
  assert.match(rules,/last chance/);
  assert.match(rules,/inside information/);
  assert.match(rules,/financial report/);
  assert.match(rules,/invalidation/);
});

test("keeps the dashboard editor core workflow usable in English",()=>{
  const editor=read("app/components/dashboard-editor.tsx");
  assert.match(editor,/useI18n/);
  for(const label of [
    "Current workspace",
    "Module library",
    "Create from template",
    "Adjust with one sentence",
    "Generate preview",
    "JSON configuration",
    "Version history",
    "Layout canvas",
    "Share read-only",
    "This workspace has no visible modules",
    "Module settings",
    "Layout and appearance",
  ]) assert.match(editor,new RegExp(label));
  assert.match(editor,/toLocaleString\(locale\)/);
});

test("keeps the capability guide and its registry answers usable in English",()=>{
  const guide=read("app/components/capability-guide.tsx");
  const ask=read("app/product-guide/ask/route.ts");
  for(const label of [
    "Turn market information into a clear next check",
    "Research-to-decision workflow",
    "Capability knowledge base",
    "What works without an API key",
    "Capability status is not an investment conclusion",
  ]) assert.match(guide,new RegExp(label));
  assert.match(ask,/Most relevant:/);
  assert.match(ask,/This answer uses only the current Capability Registry/);
  assert.match(ask,/body\.locale==="en"/);
  assert.match(ask,/englishQueryMap/);
  assert.match(ask,/item\.category!=="api"/);
});
