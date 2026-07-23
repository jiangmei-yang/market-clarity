import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source=await readFile(new URL("../app/lib/quant-engine-router.ts",import.meta.url),"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const router=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("parses an ordinary goal without framework knowledge",()=>{
  const goal=router.parseQuantGoal("帮我建立一个低频 ETF 策略，每周检查一次，最大回撤 12%，先模拟 10 万元");
  assert.equal(goal.task_type,"etf_strategy");
  assert.equal(goal.asset_type,"etf");
  assert.equal(goal.frequency,"weekly");
  assert.equal(goal.mode,"paper");
  assert.equal(goal.max_drawdown,.12);
  assert.equal(goal.capital,100000);
  assert.ok(goal.questions.length<=3);
});

test("routes simple work to the transparent native engine",()=>{
  const goal=router.parseQuantGoal("用 510300 做一个每周均线策略，最大回撤 10%，先回测");
  const route=router.routeQuantEngine(goal);
  assert.equal(route.selected_engine,"native_ashare");
  assert.equal(route.execution_status,"ready");
  assert.equal(route.engine_visible_to_user,false);
  assert.match(route.selection_reason,/透明|低频|不需要机器学习/);
});

test("does not pretend unavailable advanced engines are running",()=>{
  const ml=router.parseQuantGoal("我想让系统自己从数据里找规律，但只做实验，每月一次，研究 ETF，最大回撤 15%");
  const route=router.routeQuantEngine(ml);
  assert.equal(route.selected_engine,"qlib");
  assert.equal(route.execution_status,"blocked");
  assert.match(route.warnings.join(" "),/未安装|未生成/);
  const rl=router.routeQuantEngine(router.parseQuantGoal("用强化学习研究 510300，每月实验，最大回撤 20%"));
  assert.equal(rl.selected_engine,"finrl");
  assert.equal(rl.execution_status,"blocked");
});

test("uses a compatible transparent fallback only when the task is supported",()=>{
  const goal=router.parseQuantGoal("回测 510300 的 RSI 策略，每周运行，最大回撤 10%");
  const route=router.routeQuantEngine(goal,"backtrader");
  assert.equal(route.selected_engine,"native_ashare");
  assert.equal(route.fallback_used,true);
  assert.equal(route.execution_status,"degraded");
});

test("compiles every task into one non-trading DSL",()=>{
  const goal=router.parseQuantGoal("用 510300 做每周低频 ETF 回测，最大回撤 10%");
  const route=router.routeQuantEngine(goal);
  const dsl=router.compileGoalToDSL(goal,route);
  assert.equal(dsl.market,"CN_A");
  assert.equal(dsl.allow_live_order,false);
  assert.equal(dsl.risk_rules.allow_live_order,false);
  assert.equal(dsl.requires_confirmation,true);
  assert.ok(dsl.costs.commission_bps>0);
  assert.ok(dsl.costs.slippage_bps>0);
});

test("engine changes are previews and blocked adapters cannot be applied",()=>{
  const goal=router.parseQuantGoal("比较价值、动量和低波动方法，每月一次，研究 ETF，最大回撤 15%");
  const preview=router.switchEnginePreview(goal,"native_ashare","改用 Qlib 做因子研究");
  assert.equal(preview.requires_confirmation,true);
  assert.equal(preview.route.execution_status,"blocked");
  assert.ok(preview.changes.some((item)=>item.includes("重新回测")));
});

test("publishes route, license, compile, compare and switch contracts",async()=>{
  const paths=["../app/agent/goal/parse/route.ts","../app/quant/engine/route/route.ts","../app/quant/engines/route.ts","../app/quant/strategy/compile/route.ts","../app/quant/strategy/switch-engine/route.ts","../app/quant/strategy/compare/route.ts","../app/quant/licenses/route.ts","../app/quant/licenses/check/route.ts"];
  const files=(await Promise.all(paths.map(path=>readFile(new URL(path,import.meta.url),"utf8")))).join("\n");
  assert.match(files,/routeQuantEngine/);
  assert.match(files,/compileGoalToDSL/);
  assert.match(files,/requires_confirmation/);
  assert.match(files,/production_allowed/);
  assert.match(files,/allow_trade:false|allow_live_order:false/);
});

test("keeps framework names behind the technical disclosure",async()=>{
  const component=await readFile(new URL("../app/components/quant-goal-router.tsx",import.meta.url),"utf8");
  assert.match(component,/technical&&/);
  assert.match(component,/系统选择/);
  assert.match(component,/技术详情/);
  assert.doesNotMatch(component,/选择 Qlib|选择 FinRL|选择 VeighNa/);
});
