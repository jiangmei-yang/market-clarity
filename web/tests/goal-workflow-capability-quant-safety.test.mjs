import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const read=(path)=>readFile(new URL(path,import.meta.url),"utf8");

test("routes general assistant requests through Goal-to-Workflow instead of a fixed intent router",async()=>{
  const [assistant,agent,registry]=await Promise.all([read("../app/lib/assistant-server.ts"),read("../app/lib/agent-os.ts"),read("../app/lib/agent-registry.ts")]);
  assert.match(assistant,/createAgentTask/);
  assert.doesNotMatch(assistant,/function resolveTool/);
  assert.match(agent,/data_requirements/);
  assert.match(agent,/analysis_requirements/);
  assert.match(agent,/ui_requirements/);
  assert.match(agent,/workflow_requirements/);
  for(const catalog of ["TOOL_CATALOG","MODULE_REGISTRY","DATA_SOURCE_REGISTRY","WORKFLOW_REGISTRY"])assert.match(registry,new RegExp(catalog));
});

test("builds a platform capability RAG from live registries with honest status metadata",async()=>{
  const source=await read("../app/lib/capability-rag.ts");
  for(const field of ["capability_id","requirements","limitations","permissions","requires_confirmation","last_updated","version","platform_capabilities"])assert.match(source,new RegExp(field));
  for(const registry of ["TOOL_CATALOG","MODULE_REGISTRY","DATA_SOURCE_REGISTRY","STRATEGY_REGISTRY","WORKFLOW_REGISTRY"])assert.match(source,new RegExp(registry));
  for(const endpoint of ["../app/capabilities/route.ts","../app/capabilities/[id]/route.ts","../app/capabilities/health/route.ts","../app/capabilities/reindex/route.ts"])assert.ok((await read(endpoint)).length>0);
});

test("gates quant research on data quality, A-share rules, lookahead and universe bias",async()=>{
  const [safety,research,workbench]=await Promise.all([read("../app/lib/quant-safety.ts"),read("../app/lib/quant-research.ts"),read("../app/components/quant-workspace.tsx")]);
  for(const check of ["checkDataQuality","checkCNMarketRules","checkLookAhead","checkUniverse","buildCredibilityReport","compareBacktestPaper","validateSocialData"])assert.match(safety,new RegExp(check));
  for(const rule of ["t_plus_one","price_limit","suspension_policy","commission_bps","stamp_tax_bps","slippage_bps","lot_size"])assert.match(safety,new RegExp(rule));
  assert.match(research,/const position:Array<0\|1>=\[0,\.\.\.signalPosition\.slice\(0,-1\)\]/);
  assert.match(research,/CREDIBILITY_GATE_BLOCKED/);
  assert.match(research,/execution_status:"skipped"/);
  for(const metric of ["sortino","slippageCostPct","consecutiveLosses","bestMonthPct","worstMonthPct"])assert.match(research,new RegExp(metric));
  assert.match(workbench,/可信度/);assert.match(workbench,/未来函数/);assert.match(workbench,/股票池偏差/);
});

test("keeps social analysis authorized and low-frequency simulation separate from trading",async()=>{
  const [policy,analysis,paper,server]=await Promise.all([read("../app/quant/social/policy/route.ts"),read("../app/quant/social/analyze/route.ts"),read("../app/paper-trading/run/route.ts"),read("../app/lib/quant-research-server.ts")]);
  assert.match(policy,/用户主动上传/);assert.match(policy,/raw_text_storage:false/);
  assert.match(analysis,/validateSocialData/);assert.match(analysis,/status:403/);
  assert.match(paper,/savePaperRun/);assert.match(server,/connectedToBroker:false/);
});

test("provides quant validation, drift, strategy and paper adapters",async()=>{
  const files=await Promise.all(["../app/quant/data-quality/check/route.ts","../app/quant/backtest/validate/route.ts","../app/quant/backtest/lookahead-check/route.ts","../app/quant/backtest/universe-check/route.ts","../app/quant/drift/[strategy_id]/route.ts","../app/goal/interpret/route.ts","../app/strategy/preview/route.ts","../app/strategy/confirm/route.ts","../app/paper-trading/run/route.ts"].map(read));
  assert.equal(files.length,9);for(const source of files)assert.ok(source.includes("NextResponse"));
  assert.match(files[4],/allow_signal:false/);assert.match(files[7],/confirmed!==true/);
});
