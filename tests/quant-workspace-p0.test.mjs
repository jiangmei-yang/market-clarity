import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const source=await readFile(new URL("../app/components/quant-workspace.tsx",import.meta.url),"utf8");

test("binds loaded market history to the selected symbol and clears stale work when the symbol changes",()=>{
  assert.match(source,/type DataState=.*symbol\?:string/);
  assert.match(source,/loadedMarketMatchesSymbol=data\.symbol===symbol&&data\.points\.length>0/);
  assert.match(source,/activePrices=loadedMarketMatchesSymbol\?data\.points:parsePrices\(\)/);
  assert.match(source,/setSymbol\(next\);setData\(emptyData\);setPriceText\(""\);setBacktest\(undefined\)/);
  assert.match(source,/symbol:code/);
});

test("explains and blocks every unmet backtest prerequisite before calling the API",()=>{
  assert.match(source,/type BacktestBlocker=/);
  assert.match(source,/task\.status==="failed"/);
  assert.match(source,/!task\.confirmedAt/);
  assert.match(source,/!selectedStrategy\.backtestSupported/);
  assert.match(source,/activePrices\.length<60/);
  assert.match(source,/至少需要 60 条/);
  assert.match(source,/data\.reliability&&!data\.reliability\.allow_signal/);
  assert.match(source,/if\(!task\|\|backtestBlockers\.length\)/);
  assert.match(source,/disabled=\{backtestBlockers\.length>0\|\|busy==="run"\}/);
  assert.match(source,/还不能运行回测/);
  assert.match(source,/读取当前标的行情/);
});

test("offers recovery for failed tasks and does not imply an unavailable runner executed a saved schedule",()=>{
  assert.match(source,/task\.status==="failed"\?<button[\s\S]{0,160}act\("retry"\)/);
  assert.match(source,/重试失败步骤/);
  assert.match(source,/item\.runnerStatus==="unavailable"\?pick\(isEnglish,"已保存 · 未运行","Saved · not run"\)/);
  assert.match(source,/等待手动运行/);
  assert.match(source,/手动运行/);
  assert.match(source,/item\.runnerStatus==="unavailable"\?<button[\s\S]{0,120}setView\("backtest"\)/);
});
