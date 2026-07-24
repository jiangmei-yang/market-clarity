import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const asDataUrl = (source) =>
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;

const personalSource = await read("../app/lib/personal-workbench.ts");
const personalCompiled = ts.transpileModule(personalSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const personalUrl = asDataUrl(personalCompiled);

const dashboardSource = await read("../app/lib/dashboard-system.ts");
const dashboardCompiled = ts
  .transpileModule(dashboardSource, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  })
  .outputText.replace(
    'from "./personal-workbench"',
    `from "${personalUrl}"`,
  );
const dashboardUrl = asDataUrl(dashboardCompiled);

const layoutSource = await read("../app/lib/home-workspace-layout.ts");
const layoutCompiled = ts
  .transpileModule(layoutSource, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  })
  .outputText.replace(
    'from "./dashboard-system"',
    `from "${dashboardUrl}"`,
  )
  .replace(
    'from "./personal-workbench"',
    `from "${personalUrl}"`,
  );
const layout = await import(asDataUrl(layoutCompiled));

test("always starts with the two non-removable trust sections", () => {
  const plan = layout.planHomeWorkspaceLayout([]);
  assert.deepEqual(
    plan.sections.map((section) => section.sectionId),
    ["market_pulse", "decision_brief"],
  );
  assert.ok(plan.sections.every((section) => section.grid.w === 12));
  assert.ok(
    plan.sections.every(
      (section) =>
        section.dataPolicy.allowSyntheticData === false &&
        section.dataPolicy.requireSourceLabel === true &&
        section.dataPolicy.requireTimestamp === true,
    ),
  );
});

test("uses visibility and order to drive the remaining home sections", () => {
  const plan = layout.planHomeWorkspaceLayout([
    {
      type: "portfolio_risk",
      visible: true,
      order: 8,
      width: "half",
      density: "standard",
    },
    {
      type: "watchlist",
      visible: false,
      order: 0,
      width: "full",
      density: "standard",
    },
    {
      type: "financial_quality",
      visible: true,
      order: 2,
      width: "half",
      density: "standard",
    },
  ]);
  assert.deepEqual(
    plan.sections.slice(2).map((section) => section.moduleType),
    ["financial_quality", "portfolio_risk"],
  );
  assert.equal(plan.workspaceSectionCount, 2);
});

test("packs full, half and third width modules on a twelve-column grid", () => {
  const plan = layout.planHomeWorkspaceLayout([
    {
      type: "watchlist",
      visible: true,
      order: 0,
      width: "third",
      density: "standard",
    },
    {
      type: "financial_quality",
      visible: true,
      order: 1,
      width: "third",
      density: "standard",
    },
    {
      type: "valuation",
      visible: true,
      order: 2,
      width: "third",
      density: "standard",
    },
    {
      type: "technical_chart",
      visible: true,
      order: 3,
      width: "full",
      density: "standard",
    },
  ]);
  const modules = plan.sections.slice(2);
  assert.deepEqual(
    modules.map((section) => section.grid),
    [
      { x: 0, y: 2, w: 4 },
      { x: 4, y: 2, w: 4 },
      { x: 8, y: 2, w: 4 },
      { x: 0, y: 3, w: 12 },
    ],
  );
});

test("preserves a compatible saved visualization and chooses a registered default", () => {
  const plan = layout.planHomeWorkspaceLayout([
    {
      type: "portfolio_risk",
      visible: true,
      order: 0,
      width: "half",
      density: "standard",
      instanceId: "risk-main",
      visualization: "gauge",
    },
    {
      type: "technical_chart",
      visible: true,
      order: 1,
      width: "half",
      density: "standard",
    },
  ]);
  const [risk, chart] = plan.sections.slice(2);
  assert.equal(risk.sectionId, "workspace:risk-main");
  assert.equal(risk.visualization, "gauge");
  assert.equal(risk.renderer, "module_gauge");
  assert.equal(chart.visualization, "candlestick");
  assert.equal(chart.renderer, "module_candlestick");
});

test("rejects unknown modules and incompatible visualizations before planning", () => {
  assert.throws(
    () =>
      layout.planHomeWorkspaceLayout([
        {
          type: "invented_signal",
          visible: false,
          order: 0,
          width: "half",
          density: "standard",
        },
      ]),
    /未注册模块/,
  );
  assert.throws(
    () =>
      layout.planHomeWorkspaceLayout([
        {
          type: "technical_chart",
          visible: true,
          order: 0,
          width: "full",
          density: "standard",
          visualization: "gauge",
        },
      ]),
    /不支持 gauge 可视化/,
  );
});

test("does not embed market values, portfolio values or generated conclusions", async () => {
  const source = await read("../app/lib/home-workspace-layout.ts");
  assert.doesNotMatch(source, /1298\.01|600519|贵州茅台|累计收益|建议买入/);
  const plan = layout.planHomeWorkspaceLayout([
    {
      type: "portfolio_overview",
      visible: true,
      order: 0,
      width: "full",
      density: "standard",
    },
  ]);
  assert.equal(JSON.stringify(plan).includes("content"), false);
  assert.equal(JSON.stringify(plan).includes("value"), false);
});

test("the production home renders the saved module plan instead of a fixed chart", async () => {
  const source = await read("../app/components/personal-workbench.tsx");
  assert.match(source, /planHomeWorkspaceLayout\(normalizeDashboardWorkspace\(workspace\)\.modules\)/);
  assert.match(source, /workspaceSections\.map\(\(section\) => <HomeWorkspaceModule/);
  assert.match(source, /data-module=\{type\}/);
  assert.match(source, /data-width=\{section\.width\}/);
  assert.match(source, /style=\{\{ gridColumn: `span \$\{section\.grid\.w\}` \}\}/);
  assert.match(source, /HomePortfolioMatrix/);
  assert.match(source, /HomeFinancialQuality/);
  assert.doesNotMatch(
    source.slice(source.indexOf("function HomeSurface"), source.indexOf("function HomeWorkspaceModule")),
    /<HomeStockFocus/,
  );
});
