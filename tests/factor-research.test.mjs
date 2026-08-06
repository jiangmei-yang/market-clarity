import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source=await readFile(new URL("../app/lib/factor-research.ts",import.meta.url),"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const factor=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const date=(index)=>`2024-${String(Math.floor(index/28)+1).padStart(2,"0")}-${String(index%28+1).padStart(2,"0")}`;
const series=(symbol,drift,wave)=>({symbol,prices:Array.from({length:180},(_,index)=>({date:date(index),close:+(10*Math.exp(drift*index+wave*Math.sin(index/7))).toFixed(4)}))});

test("creates a bounded factor plan from an ordinary-language research question",()=>{
  const plan=factor.proposeFactorPlan("比较动量和低波动因子在 A 股日线样本中的稳定性");
  assert.equal(plan.requires_confirmation,true);
  assert.equal(plan.allow_live_order,false);
  assert.deepEqual(plan.candidate_factor_ids,["momentum_60","low_volatility_20"]);
  assert.equal(plan.planner,"rule_catalog");
});

test("blocks evaluation until the user confirms the proposed factor plan",()=>{
  const result=factor.evaluateFactorResearch({universe:[series("000001",.001,.01),series("000002",.0008,.02),series("000003",.0006,.03)]});
  assert.equal(result.status,"blocked");
  assert.equal(result.config.allow_live_order,false);
  assert.match(result.disclaimer,/不会生成订单/);
});

test("evaluates only aligned historical data with leakage, cost, and human-review guards",()=>{
  const result=factor.evaluateFactorResearch({confirmed:true,universe:[series("000001",.001,.01),series("000002",.0008,.02),series("000003",.0006,.03),series("000004",.0004,.04)],factor_ids:["momentum_60","low_volatility_20"],rebalance_every:10,holding_days:10,cost_bps:20});
  assert.equal(result.guardrails.lookahead_check,"pass");
  assert.equal(result.guardrails.costs_included,true);
  assert.equal(result.guardrails.requires_human_review,true);
  assert.equal(result.config.allow_live_order,false);
  assert.equal(result.evaluations.length,2);
  assert.ok(result.evaluations.every(item=>item.in_sample.observations>0));
  assert.ok(result.evaluations.every(item=>item.out_of_sample.observations>0));
  assert.match(result.disclaimer,/不选择股票/);
});

test("rejects an under-sized universe rather than inventing cross-sectional evidence",()=>{
  const result=factor.evaluateFactorResearch({confirmed:true,universe:[series("000001",.001,.01),series("000002",.0008,.02)]});
  assert.equal(result.status,"insufficient");
  assert.match(result.warnings.join(" "),/至少需要 3 只股票/);
});
