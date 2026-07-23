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

test("localizes the first-use workspace and cross-route product shell", () => {
  const workbench = read("app/components/personal-workbench.tsx");
  const shell = read("app/components/product-tool-shell.tsx");
  const guide = read("app/components/contextual-guide.tsx");
  const assistant = read("app/components/global-ai-assistant.tsx");
  assert.match(workbench, /Start with what matters to you now/);
  assert.match(workbench, /Market overview/);
  assert.match(workbench, /Latest formal information/);
  assert.match(workbench, /Recorded amount/);
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
  assert.match(page,/Core task funnel/);
  assert.match(page,/Behavioral price test/);
  assert.match(page,/What must be validated next/);
  assert.match(model,/Fixed real-model task set/);
  assert.match(agent,/Three Agent functional tasks/);
  assert.match(sources,/Live data-route sampling/);
});
