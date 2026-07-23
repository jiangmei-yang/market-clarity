import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source=await readFile(new URL("../app/lib/natural-language-strategy.ts",import.meta.url),"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const strategy=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("turns a clear Chinese strategy into a confirmable whitelist DSL",()=>{
  const preview=strategy.parseStrategyDeterministically("当 510300 沪深300 ETF 的 5 日均线上穿 20 日均线，且成交量较前一日放大 50% 时，每日收盘后提醒我");
  assert.equal(preview.asset,"510300");
  assert.equal(preview.dsl.market,"CN_A");
  assert.equal(preview.dsl.asset_type,"etf");
  assert.equal(preview.dsl.frequency,"daily_close");
  assert.equal(preview.dsl.logic,"AND");
  assert.equal(preview.dsl.execution_mode,"manual_confirmation");
  assert.deepEqual(preview.conditions.map((item)=>item.name),["moving_average_cross","volume_ratio"]);
  assert.equal(preview.validation.allow_save,true);
  assert.equal(preview.requires_confirmation,true);
});

test("asks only for missing strategy details instead of guessing",()=>{
  const preview=strategy.parseStrategyDeterministically("510300 成交量放大时告诉我");
  assert.equal(preview.validation.allow_save,false);
  assert.ok(preview.questions.some((item)=>item.includes("前一日")&&item.includes("20 日")));
  assert.ok(preview.questions.some((item)=>item.includes("每日收盘后")));
});

test("blocks unknown indicators and executable parameter payloads",()=>{
  const base=strategy.parseStrategyDeterministically("510300 的 RSI 低于 30，每日收盘后提醒我").dsl;
  const invalid={...base,conditions:[{...base.conditions[0],name:"unknown_indicator",params:{formula:"eval(import('x'))"}}]};
  const validation=strategy.validateStrategyDSL(invalid);
  assert.equal(validation.status,"blocked");
  assert.equal(validation.allow_save,false);
  assert.match(validation.errors.join(" "),/未知指标|禁止执行/);
});

test("evaluates price-based rules but never invents external event data",()=>{
  const pricePreview=strategy.parseStrategyDeterministically("当 510300 的 RSI 低于 40 时，每日收盘后提醒我");
  const points=Array.from({length:40},(_,index)=>({date:`2026-06-${String(index+1).padStart(2,"0")}`,open:100-index,high:101-index,low:99-index,close:100-index,volume:1000+index}));
  const evaluated=strategy.evaluateStrategy(pricePreview.dsl,points);
  assert.equal(evaluated.conditions[0].status,"evaluated");
  const eventPreview=strategy.parseStrategyDeterministically("当 600519 公告出现减持时，每日收盘后提醒我");
  const eventResult=strategy.evaluateStrategy(eventPreview.dsl,points);
  assert.equal(eventResult.triggered,false);
  assert.equal(eventResult.conditions[0].status,"requires_external_data");
});

test("exposes auditable strategy lifecycle APIs without a real-order endpoint",async()=>{
  const paths=[
    "../app/quant/strategy/parse/route.ts",
    "../app/quant/strategy/preview/route.ts",
    "../app/quant/strategy/confirm/route.ts",
    "../app/quant/strategy/backtest/route.ts",
    "../app/quant/strategy/[id]/run/route.ts",
    "../app/quant/strategy/[id]/pause/route.ts",
    "../app/quant/strategy/[id]/resume/route.ts",
    "../app/quant/strategy/[id]/copy/route.ts",
  ];
  const files=await Promise.all(paths.map((path)=>readFile(new URL(path,import.meta.url),"utf8")));
  assert.match(files.join("\n"),/previewNaturalStrategy/);
  assert.match(files.join("\n"),/confirmNaturalStrategy/);
  assert.match(files.join("\n"),/backtestNaturalStrategy/);
  assert.match(files.join("\n"),/changeNaturalStrategyStatus/);
  assert.doesNotMatch(files.join("\n"),/broker|submitOrder|真实下单/);
});

test("keeps stale market data from creating a fresh notification",async()=>{
  const server=await readFile(new URL("../app/lib/natural-language-strategy-server.ts",import.meta.url),"utf8");
  assert.match(server,/当前使用缓存数据，不生成新的策略提醒/);
  assert.match(server,/run\.triggered&&run\.reliability\.allow_signal/);
  assert.match(server,/connected_to_broker:false/);
  assert.match(server,/allow_order_submit:false/);
});
