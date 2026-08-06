import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../app/lib/decision-asset-projection.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const projection = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const section = (sourceRef, offset = 0) => ({
  summary: "基于当前资料生成条件情景",
  confidence_score: 58,
  confidence_reason: "资料类别有限，保留较宽区间",
  scenarios: [
    { key: "downside", probability_pct: 30, rationale: "压力路径", source_refs: [sourceRef], points: [{ month: 1, cumulative_return_pct: -4 + offset }, { month: 3, cumulative_return_pct: -10 + offset }, { month: 6, cumulative_return_pct: -16 + offset }, { month: 12, cumulative_return_pct: -25 + offset }] },
    { key: "base", probability_pct: 45, rationale: "基准路径", source_refs: [sourceRef], points: [{ month: 1, cumulative_return_pct: 0 + offset }, { month: 3, cumulative_return_pct: 2 + offset }, { month: 6, cumulative_return_pct: 5 + offset }, { month: 12, cumulative_return_pct: 9 + offset }] },
    { key: "upside", probability_pct: 25, rationale: "改善路径", source_refs: [sourceRef], points: [{ month: 1, cumulative_return_pct: 3 + offset }, { month: 3, cumulative_return_pct: 8 + offset }, { month: 6, cumulative_return_pct: 15 + offset }, { month: 12, cumulative_return_pct: 27 + offset }] },
  ],
  drivers: ["当前输入信号"],
  risks: ["资料可能失效"],
  invalidation_signals: ["出现新的相反数据"],
});

test("uses explicit non-linear 1, 3, 6 and 12 month paths", () => {
  const result = projection.buildAssetProjection(10000);
  assert.equal(result.schema_version, "asset_forecast.output.v1");
  assert.deepEqual(result.paths[0].points.map((point) => point.month), [1, 3, 6, 12]);
  assert.deepEqual(result.paths.find((path) => path.key === "flat").points.map((point) => point.value), [10000, 10100, 10200, 10400]);
  assert.deepEqual(result.paths.find((path) => path.key === "upside").points.map((point) => point.value), [10300, 10700, 11400, 12500]);
  assert.ok(result.forecasts.evidence);
  assert.ok(result.forecasts.technical);
  assert.equal(result.quality.status, "degraded");
  assert.equal(result.quality.checks.evidence_probability_total, 100);
  assert.equal(result.quality.checks.required_horizons, true);
});

test("localizes bounded forecast fallbacks for English reviews", () => {
  const result = projection.buildAssetProjection(10000, undefined, { locale: "en" });
  assert.deepEqual(result.paths.map((path) => path.label), ["Downside", "Base", "Upside"]);
  assert.match(result.forecasts.evidence.summary, /bounded fallback/i);
  assert.match(result.forecasts.technical.summary, /price history/i);
  assert.match(result.disclaimer, /conditional scenarios/i);
  assert.ok(result.forecasts.evidence.paths.every((path) => !/[\u4e00-\u9fff]/.test(path.rationale)));
});

test("rejects non-English AI forecast fields in English mode", () => {
  assert.throws(
    () => projection.validateAssetForecastLanguage(section("formal_disclosures"), "en"),
    /non-English user-facing fields/,
  );
  const english = section("formal_disclosures");
  english.summary = "Conditional forecast based on currently available evidence";
  english.confidence_reason = "The evidence set is limited, so the range remains wide";
  english.scenarios = english.scenarios.map((scenario) => ({ ...scenario, rationale: `${scenario.key} conditional path` }));
  english.drivers = ["Current input signal"];
  english.risks = ["Evidence may become stale"];
  english.invalidation_signals = ["New contradictory data appears"];
  assert.equal(projection.validateAssetForecastLanguage(english, "en"), english);
});

test("accepts total loss as the mathematical floor and rejects returns below it", () => {
  const floorScenarios = structuredClone(projection.DEFAULT_ASSET_SCENARIOS);
  floorScenarios[0].points[3].cumulative_return_pct = -100;
  assert.equal(projection.buildAssetProjection(10000, floorScenarios).paths[0].points[3].value, 0);
  floorScenarios[0].points[3].cumulative_return_pct = -100.01;
  assert.throws(() => projection.buildAssetProjection(10000, floorScenarios));
});

test("validates the dedicated asset forecast input contract", () => {
  const input = {
    schema_version: "asset_forecast.input.v1",
    asset: { code: "600519", name: "贵州茅台", base_value: 10000 },
    decision: { action: "买入", horizon: "3个月", reason: "公司经营数据可能改善" },
  };
  assert.equal(projection.validateAssetForecastInput(input).asset.code, "600519");
  assert.throws(() => projection.validateAssetForecastInput({ ...input, schema_version: "unknown" }));
  assert.throws(() => projection.validateAssetForecastInput({ ...input, asset: { ...input.asset, code: "123" } }));
  assert.throws(() => projection.validateAssetForecastInput({ ...input, decision: { ...input.decision, action: "追涨" } }));
  assert.throws(() => projection.validateAssetForecastInput({ ...input, decision: { ...input.decision, horizon: "永远" } }));
});

test("marks AI and fallback channels independently", () => {
  const result = projection.buildAssetProjection(10000, section("formal_disclosures").scenarios, {
    mode: "partial_ai_rag",
    evidenceMode: "ai_rag",
    technicalForecast: {
      scenarios: projection.DEFAULT_ASSET_SCENARIOS,
      summary: "技术通道降级",
      confidenceScore: 10,
      confidenceReason: "模型输出未通过校验",
      drivers: [],
      risks: ["技术资料不可用"],
      invalidationSignals: ["重新生成"],
      mode: "rules",
    },
  });
  assert.equal(result.mode, "partial_ai_rag");
  assert.equal(result.forecasts.evidence.mode, "ai_rag");
  assert.equal(result.forecasts.technical.mode, "rules");
  assert.equal(result.quality.status, "degraded");
});

test("requires separate evidence and technical forecasts with grounded source references", () => {
  const payload = {
    evidence_forecast: section("formal_disclosures"),
    technical_forecast: section("market_history", 1),
  };
  const parsed = projection.parseAssetForecastAIOutput(
    JSON.stringify(payload),
    {
      evidence: new Set(["formal_disclosures"]),
      technical: new Set(["market_history"]),
    },
    { evidence: "formal_disclosures", technical: "market_history" },
  );
  assert.equal(parsed.evidence.scenarios[1].points[3].cumulative_return_pct, 9);
  assert.equal(parsed.technical.scenarios[1].points[3].cumulative_return_pct, 10);
  assert.ok(parsed.evidence.scenarios.every((scenario) => scenario.source_refs.includes("formal_disclosures")));
  assert.ok(parsed.technical.scenarios.every((scenario) => scenario.source_refs.includes("market_history")));
  assert.throws(() => projection.parseAssetForecastAIOutput(
    JSON.stringify({ ...payload, technical_forecast: section("formal_disclosures") }),
    {
      evidence: new Set(["formal_disclosures"]),
      technical: new Set(["market_history"]),
    },
    { evidence: "formal_disclosures", technical: "market_history" },
  ));
  const normalized = projection.parseAssetForecastAIOutput(
    JSON.stringify({ ...payload, evidence_forecast: section("forecast_disclosure_quality") }),
    {
      evidence: new Set(["formal_disclosures", "forecast_disclosure_quality"]),
      technical: new Set(["market_history"]),
    },
    { evidence: "formal_disclosures", technical: "market_history" },
  );
  assert.ok(normalized.evidence.scenarios.every((scenario) => scenario.source_refs.includes("formal_disclosures")));

  const contaminated = { ...payload, technical_forecast: { ...section("market_history"), summary: "成交量显示主力资金流入，基本面也改善" } };
  assert.throws(() => projection.parseAssetForecastAIOutput(
    JSON.stringify(contaminated),
    {
      evidence: new Set(["formal_disclosures"]),
      technical: new Set(["market_history"]),
    },
    { evidence: "formal_disclosures", technical: "market_history" },
  ));
});

test("publishes a RAG-driven dual forecast route and UI", async () => {
  const [route, client, rag, prepare] = await Promise.all([
    readFile(new URL("../app/api/decision/projection/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/client-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/asset-forecast-rag.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/decision/prepare/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(route, /callAIProviderWithFallback/);
  assert.match(route, /readInformationRoute/);
  assert.match(route, /readFinancialRoute/);
  assert.match(route, /suppliedEvidence/);
  assert.match(route, /forecast_channel: "verified_public_evidence"/);
  assert.match(route, /forecast_channel: "kline_technical"/);
  assert.match(route, /Promise\.allSettled/);
  assert.match(route, /partial_ai_rag/);
  assert.match(route, /technicalPathSignature/);
  assert.match(route, /market_history/);
  assert.match(route, /atr_14d_pct/);
  assert.match(route, /volume_ratio_20d/);
  assert.match(route, /latest_upper_shadow_pct/);
  assert.match(rag, /ASSET_FORECAST_VECTOR_METHOD/);
  assert.match(rag, /Time Series Momentum/);
  assert.match(prepare, /evidence_context:\s*evidence/);
  assert.match(prepare, /locale:\s*input\.context\.locale/);
  assert.match(client, /AI 双通道未来情景/);
  assert.match(client, /公开资料预测/);
  assert.match(client, /K 线技术预测/);
  assert.match(client, /ForecastCurveChart/);
  assert.match(client, /压力、基准和改善三种资产金额预测曲线/);
  assert.match(client, /evidence_context:\s*evidenceCheck/);
  assert.match(client, /evidence_context:\s*evidenceCheck,[\s\S]*?locale,/);
});
