import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const contractSource = await read("../app/lib/decision-validation-contract.ts");
const compiled = ts.transpileModule(contractSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const contract = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("validates the versioned Decision Validation input contract", () => {
  const input = {
    schema_version: "decision_validation.input.v1",
    plan: { code: "600519", name: "贵州茅台", action: "买入", amount: 10000, projected_holding: 10000, reason: "朋友说公司有新订单", horizon: "3个月" },
    context: { portfolio_capital: 200000, current_holding: 0, locale: "zh-CN" },
  };
  assert.equal(contract.validateDecisionValidationInput(input).plan.code, "600519");
  assert.throws(() => contract.validateDecisionValidationInput({ ...input, schema_version: "unknown" }));
  assert.throws(() => contract.validateDecisionValidationInput({ ...input, plan: { ...input.plan, reason: "太短" } }));
  assert.throws(() => contract.validateDecisionValidationInput({ ...input, plan: { ...input.plan, action: "追涨" } }));
  assert.throws(() => contract.validateDecisionValidationInput({ ...input, plan: { ...input.plan, horizon: "永远" } }));
  assert.throws(() => contract.validateDecisionValidationInput({ ...input, plan: { ...input.plan, projected_holding: 99999 } }));
  const sellInput = {
    ...input,
    plan: { ...input.plan, action: "卖出", amount: 4000, projected_holding: 6000 },
    context: { ...input.context, current_holding: 10000 },
  };
  assert.equal(contract.validateDecisionValidationInput(sellInput).plan.projected_holding, 6000);
});

test("keeps AI claims grounded in the original words", () => {
  const reason = "朋友说公司有新订单，我认为未来可能改善";
  const parsed = contract.parseDecisionAIOutput(JSON.stringify({
    summary: "两项待检查内容",
    claims: [
      { text: "朋友说公司有新订单", type: "unverified_external_claim" },
      { text: "我认为未来可能改善", type: "prediction_or_inference" },
    ],
    source_hint: "核对正式公告",
    urgency: "未识别",
    suggested_invalidation: "若正式披露不支持核心理由则重新评估",
  }), reason);
  assert.equal(parsed.claims[0].verifiability, "needs_source");
  assert.match(parsed.suggested_invalidation, /^若正式披露/);
  assert.throws(() => contract.parseDecisionAIOutput(JSON.stringify({
    claims: [{ text: "公司已经确认订单", type: "observable_fact" }],
  }), reason));
});

test("replaces an AI verification request with a real conditional invalidation candidate", () => {
  const reason = "朋友说公司有新订单";
  const parsed = contract.parseDecisionAIOutput(JSON.stringify({
    claims: [{ text: reason, type: "unverified_external_claim" }],
    suggested_invalidation: "请用户确认订单来源和金额",
  }), reason);
  assert.match(parsed.suggested_invalidation, /^如果核心理由/);
});

test("does not mistake ordinary words containing 当 for a conditional invalidation", () => {
  const reason = "朋友说公司有新订单";
  const parsed = contract.parseDecisionAIOutput(JSON.stringify({
    claims: [{ text: reason, type: "unverified_external_claim" }],
    suggested_invalidation: "请核实公司当前估值和订单是否已经披露",
  }), reason);
  assert.match(parsed.suggested_invalidation, /^如果核心理由/);
});

test("localizes the rule-based rationale fallback for English reviews", () => {
  const parsed = contract.analyzeDecisionReasonLocally("A friend said the company has new orders", "en");
  assert.match(parsed.summary, /item/i);
  assert.match(parsed.source_hint, /formal disclosure/i);
  assert.match(parsed.suggested_invalidation, /^(if|when|unless)/i);
  assert.equal(parsed.claims[0].required_evidence, "Exchange filings, company disclosures, or formal periodic reports");
});

test("uses the shared vector method and Agent-compatible output envelope", async () => {
  const [rag, route, client] = await Promise.all([
    read("../app/lib/decision-knowledge-rag.ts"),
    read("../app/api/decision/prepare/route.ts"),
    read("../app/client-page.tsx"),
  ]);
  assert.match(rag, /embedCapabilityText/);
  assert.match(rag, /hashed-token-64d-v1/);
  assert.match(rag, /lexical_match_count > 0 \|\| item\.semantic_score >= 0\.7/);
  for (const field of ["schema_version", "plan", "tool_calls", "sources", "requires_confirmation", "reliability"]) assert.match(route, new RegExp(field));
  for (const tool of ["structure_decision_reason", "retrieve_decision_knowledge", "verify_public_evidence", "project_asset_paths"]) assert.match(route, new RegExp(tool));
  assert.match(client, /智能整理并复核/);
  assert.match(client, /只需金额和一句理由/);
  assert.match(client, /先填写一句理由并完成智能复核/);
  assert.doesNotMatch(client, /<Textarea value=\{reasonStructure\.fact\}/);
  assert.doesNotMatch(client, /<Textarea value=\{reasonStructure\.external\}/);
});
