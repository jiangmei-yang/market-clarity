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
});
