import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {FAILURE_STATUSES,aggregateReliability,classifyProviderResponse,freshness,reliability,withControlledRetry} from "../app/lib/failure-control.ts";

const read=(path)=>readFile(new URL(path,import.meta.url),"utf8");

test("defines one complete failure status contract and never permits automatic trading",()=>{
  assert.deepEqual(FAILURE_STATUSES,["healthy","degraded","stale","unavailable","blocked","failed","cancelled","retrying"]);
  for(const status of FAILURE_STATUSES)assert.equal(reliability({status,message:status}).allow_trade,false);
});

test("marks expired data stale and blocks new signals",()=>{
  const state=freshness("news","2026-01-01T00:00:00.000Z","公告源",null,Date.parse("2026-01-02T00:00:01.000Z"));
  assert.equal(state.freshness_status,"stale");
  assert.equal(state.max_age,21600);
  const summary=aggregateReliability([reliability({status:"healthy",message:"ok"}),reliability({status:"stale",message:"old",allow_signal:false})]);
  assert.equal(summary.status,"stale");assert.equal(summary.allow_signal,false);assert.equal(summary.allow_trade,false);
});

test("classifies provider failures without blind retries",()=>{
  assert.equal(classifyProviderResponse(401).retryable,false);
  assert.equal(classifyProviderResponse(429).retryable,false);
  assert.equal(classifyProviderResponse(429,"2").retryable,true);
  assert.equal(classifyProviderResponse(503).retryable,true);
});

test("retries a transient failure once but never repeats a permanent failure",async()=>{
  let transient=0;const value=await withControlledRetry(()=>{transient++;if(transient===1)throw classifyProviderResponse(503);return Promise.resolve("ok")},{sleep:async()=>undefined});
  assert.equal(value.attempts,2);assert.equal(transient,2);
  let permanent=0;await assert.rejects(()=>withControlledRetry(()=>{permanent++;throw classifyProviderResponse(401)},{sleep:async()=>undefined}));assert.equal(permanent,1);
});

test("blocks invalid backtests and prevents charts or signals on failure",async()=>{
  const model=await read("../app/lib/quant-research.ts");
  for(const code of ["INVALID_DATE_RANGE","MISSING_TRADING_COST","BENCHMARK_MISSING","ADJUSTMENT_FAILED","SUSPENSION_HANDLING_FAILED","STRATEGY_PARAMETER_CONFLICT","FUTURE_FUNCTION_RISK","CRITICAL_MARKET_DATA_MISSING"])assert.match(model,new RegExp(code));
  assert.match(model,/reliability\.allow_signal/);assert.match(model,/metrics:null/);assert.match(model,/series:\[\]/);
});

test("pauses schedules after repeated failures and preserves the previous result",async()=>{
  const server=await read("../app/lib/quant-research-server.ts");
  assert.match(server,/found\.failureCount>=3/);assert.match(server,/status="paused"/);assert.match(server,/lastSuccessAt/);assert.match(server,/不会生成新的研究信号/);
});

test("uses transactional workspace versions and rollback without overwriting the original",async()=>{
  const dashboard=await read("../app/lib/dashboard-server.ts");
  assert.match(dashboard,/applyDashboardTransaction/);assert.match(dashboard,/WORKSPACE_VERSION_CONFLICT/);assert.match(dashboard,/rolled_back/);assert.match(dashboard,/original_version_preserved/);
});

test("retries only failed Agent tools and exposes the unified status in the interface",async()=>{
  const [agent,component,route]=await Promise.all([read("../app/lib/agent-os.ts"),read("../app/components/agent-workspace.tsx"),read("../app/agent/tasks/[task_id]/tools/[tool_id]/retry/route.ts")]);
  assert.match(agent,/retryAgentTool/);assert.match(agent,/previous\.status!=="failed"/);assert.doesNotMatch(agent,/retryAgentTask[\s\S]{0,500}createAgentTask/);assert.match(component,/单步重试/);assert.match(component,/信号.*阻断/);assert.match(route,/AGENT_TOOL_RETRY_FAILED/);
});

test("makes cache, source, model and permissions visible in the product shell",async()=>{
  const [center,market,evidence,financial]=await Promise.all([read("../app/components/system-reliability-center.tsx"),read("../app/api/market/overview/route.ts"),read("../app/api/evidence/[code]/route.ts"),read("../app/api/financial/[code]/route.ts")]);
  for(const phrase of ["当前模型","研究信号","真实交易","重新检查"])assert.match(center,new RegExp(phrase));
  for(const source of [market,evidence,financial]){assert.match(source,/freshness_status/);assert.match(source,/allow_signal:false/);assert.match(source,/fallback_used/);}
});
