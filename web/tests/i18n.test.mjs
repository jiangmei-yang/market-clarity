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
  assert.match(workbench, /Start with what matters to you now/);
  assert.match(workbench, /Market overview/);
  assert.match(workbench, /Latest verifiable event/);
  assert.match(shell, /ETF diagnosis/);
  assert.match(shell, /Quant research/);
  assert.match(shell, /Task agent/);
  assert.match(guide, /Workspace quick start/);
  assert.match(guide, /Using stock research/);
});
