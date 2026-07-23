import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const read=(path)=>readFile(new URL(path,import.meta.url),"utf8");

test("registers the complete research strategy and module catalogs",async()=>{
  const [model,workbench]=await Promise.all([read("../app/lib/quant-research.ts"),read("../app/components/quant-workspace.tsx")]);
  for(const id of ["ma_trend","momentum","rsi_reversion","etf_dca","periodic_rebalance","low_volatility","dividend","valuation_quantile","sector_rotation","news_event","social_sentiment","fundamental_quality","multi_factor","custom_rule"])assert.match(model,new RegExp(id));
  for(const moduleId of ["strategy_overview","strategy_config","backtest","paper_portfolio","news","social_sentiment","fundamental_validation","portfolio_impact","risk_metrics","signal_history","strategy_comparison","sensitivity","schedule","ai_report","execution_log"])assert.match(model,new RegExp(moduleId));
  assert.match(workbench,/策略比较|策略比较/);
});

test("keeps deterministic backtest assumptions, data lineage and full risk metrics",async()=>{
  const source=await read("../app/lib/quant-research.ts");
  for(const field of ["commissionBps","stampTaxBps","slippageBps","limitHandling","suspensionHandling","dividendHandling","adjustment","benchmark","trainRatio"])assert.match(source,new RegExp(field));
  for(const metric of ["annualizedReturnPct","maxDrawdownPct","volatilityPct","sharpe","winRatePct","profitLossRatio","turnoverPct","costImpactPct","benchmarkReturnPct","longestDrawdownDays"])assert.match(source,new RegExp(metric));
  assert.match(source,/anxin-backtest-3\.0/);
  assert.match(source,/历史回测和模拟结果不代表未来收益/);
});

test("uses live public market data with explicit cache fallback",async()=>{
  const [route,cache,workbench]=await Promise.all([read("../app/api/information/[code]/route.ts"),read("../app/lib/data-cache.ts"),read("../app/components/quant-workspace.tsx")]);
  assert.match(route,/腾讯证券公开行情/);
  assert.match(route,/东方财富公开历史行情/);
  assert.match(route,/同花顺 iFinD 官方接口/);
  assert.match(route,/IFIND_REFRESH_TOKEN/);
  assert.match(route,/cmd_history_quotation/);
  assert.match(route,/code\.startsWith\("5"\)/);
  assert.match(route,/rejectedByLocalStockList/);
  assert.match(route,/readCached/);
  assert.match(route,/cacheAgeSeconds/);
  assert.match(cache,/globalThis/);
  assert.match(workbench,/\/api\/information\/\$\{code\}/);
  assert.match(workbench,/使用最近缓存/);
  assert.match(workbench,/数据时间/);
});

test("documents optional server-only market authorization",async()=>{
  const [readme,env]=await Promise.all([read("../README.md"),read("../.env.example")]);
  assert.match(readme,/同花顺 iFinD/);
  assert.match(readme,/东方财富公开行情当前仅作为容错备用源/);
  assert.match(env,/IFIND_REFRESH_TOKEN/);
  assert.match(env,/不要提交真实 Token/);
});

test("enforces confirmation for strategies, simulations, schedules and workspaces",async()=>{
  const server=await read("../app/lib/quant-research-server.ts");
  assert.match(server,/保存策略前必须明确确认/);
  assert.match(server,/修改策略前必须明确确认/);
  assert.match(server,/删除策略前必须明确确认/);
  assert.match(server,/创建模拟组合前必须明确确认/);
  assert.match(server,/创建计划前必须明确确认/);
  assert.match(server,/应用工作台修改前必须明确确认/);
  assert.match(server,/connectedToBroker:false/);
});

test("supports strategy lifecycle, schedule lifecycle, paper separation and dashboard apply",async()=>{
  const [server,strategyRoute,scheduleRoute,workspaceRoute]=await Promise.all([read("../app/lib/quant-research-server.ts"),read("../app/quant/strategies/[id]/route.ts"),read("../app/quant/schedules/[id]/route.ts"),read("../app/workspace/quant-apply/route.ts")]);
  assert.match(server,/copyStrategy/);
  assert.match(server,/changeSchedule/);
  assert.match(server,/previewQuantWorkspace/);
  assert.match(server,/applyDashboard/);
  assert.match(strategyRoute,/action!=="copy"/);
  assert.match(scheduleRoute,/"delete"/);
  assert.match(workspaceRoute,/applyQuantWorkspace/);
});

test("routes natural-language planning through the selected provider with safe fallback",async()=>{
  const server=await read("../app/lib/quant-research-server.ts");
  assert.match(server,/callAIProvider/);
  assert.match(server,/allowedStrategies/);
  assert.match(server,/allowedModules/);
  assert.match(server,/local_fallback/);
  assert.match(server,/不得生成行情、收益、社媒热度或买卖指令/);
});
