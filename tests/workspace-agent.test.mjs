import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../app/lib/personal-workbench.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const workspace = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("guides an ambiguous beginner without recommending a trade", () => {
  const current = workspace.createWorkspace("long_term");
  const result = workspace.previewWorkspaceChange(current, "我想挣钱，但不知道怎么开始");
  assert.equal(result.intent, "workspace_recommendation");
  assert.equal(result.recommendation.userStage, "beginner");
  assert.equal(result.recommendation.recommendedTemplate, "beginner_safe_start");
  assert.equal(result.needsConfirmation, true);
  assert.ok(result.questions.length <= 3);
  assert.ok(result.affectedModules.includes("simulation_portfolio"));
  assert.doesNotMatch(result.summary, /买入|卖出|稳赚|必涨/);
});

test("creates auditable patches for add, hide, move, resize, and theme", () => {
  const current = workspace.createWorkspace("custom");
  const added = workspace.previewWorkspaceChange(current, "增加 ETF 重复暴露并移动到顶部，放大为全宽");
  assert.ok(added.patch.some((item) => item.op === "add_module" && item.module === "etf_overlap"));
  assert.ok(added.patch.some((item) => item.op === "move_module" && item.module === "etf_overlap"));
  assert.ok(added.patch.some((item) => item.op === "resize_module" && item.module === "etf_overlap"));
  const hidden = workspace.previewWorkspaceChange(workspace.createWorkspace("active"), "隐藏技术图表和技术指标");
  assert.equal(hidden.patch.filter((item) => item.op === "set_visibility" && item.visible === false).length, 2);
  const themed = workspace.previewWorkspaceChange(current, "切换深色主题");
  assert.ok(themed.patch.some((item) => item.op === "set_theme" && item.theme === "dark_focus"));
  const naturalTheme = workspace.previewWorkspaceChange(current, "改成科技感浅色主题，减少红绿颜色并使用轻量动画");
  assert.equal(naturalTheme.preview.theme.themeId, "clear_blue");
  assert.equal(naturalTheme.preview.theme.marketColors, "accessible");
  assert.equal(naturalTheme.preview.theme.motion, "standard");
  assert.equal(naturalTheme.needsConfirmation, true);
});

test("keeps Agent planning general, auditable, and honest about missing social data", async () => {
  const [registry, agent, component, proposalRoute] = await Promise.all([
    readFile(new URL("../app/lib/agent-registry.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/agent-os.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/agent-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/tools/proposals/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(registry, /TOOL_CATALOG/);
  assert.match(registry, /MODULE_REGISTRY/);
  assert.match(registry, /DATA_SOURCE_REGISTRY/);
  assert.match(registry, /WORKFLOW_REGISTRY/);
  assert.match(registry, /xiaohongshu_live[^\n]+available:false/);
  assert.match(registry, /execute_trade[^\n]+restricted/);
  assert.match(agent, /callAIProvider/);
  assert.match(agent, /planner_mode/);
  assert.match(agent, /type:\"agent_task\"/);
  assert.match(agent, /plan:\{task_id:taskId,goal,steps,requires_confirmation/);
  assert.match(agent, /当前没有足够样本/);
  assert.match(agent, /未伪造完成状态/);
  assert.match(agent, /portfolioRiskResult/);
  assert.match(agent, /readStockInformationRoute/);
  assert.match(agent, /readFinancialRoute/);
  assert.match(agent, /readEvidenceRoute/);
  assert.match(agent, /tool\.toolId==="create_reminder"/);
  assert.match(agent, /cancelAssistantCommand/);
  assert.match(component, /工作台修改预览/);
  assert.match(component, /结果预览/);
  assert.match(component, /数据来源/);
  assert.match(component, /确认并应用/);
  assert.match(component, /组合风险核对/);
  assert.match(component, /最大持仓/);
  assert.match(component, /价格与成交/);
  assert.match(component, /近期公告/);
  assert.match(proposalRoute, /requires_human_review:true/);
});

test("pauses for structured input instead of misreporting missing context as failure",async()=>{
  const [agent,registry,component,continueRoute]=await Promise.all([
    readFile(new URL("../app/lib/agent-os.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/lib/agent-registry.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/components/agent-workspace.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/agent/tasks/[task_id]/continue/route.ts",import.meta.url),"utf8"),
  ]);
  assert.match(agent,/status:"planning"\|"awaiting_input"\|"awaiting_confirmation"/);
  assert.match(agent,/needsInput\?"awaiting_input"/);
  assert.match(agent,/!needsInput&&\(workspaceFailed\|\|nothingSucceeded\)/);
  assert.match(agent,/input_request:needsInput\?request:undefined/);
  assert.match(agent,/type:"choice"\|"text"/);
  assert.match(agent,/options:\["首页顶部","主要内容之后","右侧辅助区","由系统安排"\]/);
  assert.match(registry,/status:"pending"\|"running"\|"completed"\|"failed"\|"cancelled"\|"awaiting_input"/);
  assert.match(component,/task\.status==="awaiting_input"/);
  assert.match(component,/继续这项任务/);
  assert.match(component,/body:JSON\.stringify\(\{answers\}\)/);
  assert.match(continueRoute,/continueAgentTask/);
  assert.match(continueRoute,/body\.answers\?\?\{\}/);
});

test("continues the same task id and replaces the temporary continuation record",async()=>{
  const agent=await readFile(new URL("../app/lib/agent-os.ts",import.meta.url),"utf8");
  assert.match(agent,/export async function continueAgentTask\(taskId:string,answers:Record<string,string>\)/);
  assert.match(agent,/task_id:task\.task_id/);
  assert.match(agent,/created_at:task\.created_at/);
  assert.match(agent,/continuation_count:\(task\.continuation_count\?\?0\)\+1/);
  assert.match(agent,/filter\(\(item\)=>item\.task_id!==task\.task_id&&item\.task_id!==generated\.task_id\)/);
  assert.match(agent,/concat\(continued\)/);
});

test("supports a source-transparent social observation workspace without inventing trends", () => {
  const current=workspace.createWorkspace("custom");
  const result=workspace.previewWorkspaceChange(current,"现在小红书上大家在讨论什么？把热门主题放进我的工作台");
  assert.equal(result.recommendation.recommendedTemplate,"social_risk");
  assert.ok(result.preview.modules.some((item)=>item.type==="social_topics"));
  assert.ok(result.preview.modules.some((item)=>item.type==="fundamental_verification"));
  assert.ok(result.preview.modules.some((item)=>item.type==="portfolio_overlap"));
  assert.equal(result.needsConfirmation,true);
});

test("keeps dedicated preview, apply, history, multi-workspace and restore endpoints", async () => {
  const files=await Promise.all([
    "../app/workspace/preview/route.ts","../app/workspace/apply/route.ts","../app/workspace/history/route.ts","../app/workspaces/route.ts","../app/workspaces/[id]/restore/route.ts",
  ].map((path)=>readFile(new URL(path,import.meta.url),"utf8")));
  assert.match(files[0],/createAssistantPreview/);
  assert.match(files[1],/confirmed!==true/);
  assert.match(files[2],/workspaceState/);
  assert.match(files[3],/requires_confirmation:true/);
  assert.match(files[4],/restoreAssistantWorkspaceVersion/);
});

test("changes only whitelisted workflows and blocks transaction execution", () => {
  const current = workspace.createWorkspace("custom");
  const flow = workspace.previewWorkspaceChange(current, "输入股票后先做风险检查");
  assert.ok(flow.patch.some((item) => item.op === "set_workflow"));
  assert.deepEqual(flow.preview.workflow, ["research", "review_risk", "pretrade_check", "confirm_next_step"]);
  const blocked = workspace.previewWorkspaceChange(current, "帮我自动买入 600519");
  assert.equal(blocked.canApply, false);
  assert.equal(blocked.patch.length, 0);
  assert.match(blocked.warnings[0], /不能执行交易/);
});

test("adapts low-time, ETF, social-risk, and portfolio users", () => {
  const current = workspace.createWorkspace("custom");
  const lowTime = workspace.previewWorkspaceChange(current, "我没时间看盘，帮我安排一下");
  assert.equal(lowTime.preview.alertFrequency, "weekly");
  assert.ok(lowTime.preview.modules.some((item) => item.type === "weekly_digest"));
  assert.equal(workspace.classifyWorkspaceNeed("我只做 ETF").template, "etf");
  assert.equal(workspace.classifyWorkspaceNeed("我经常被小红书影响").template, "social_risk");
  assert.equal(workspace.classifyWorkspaceNeed("我已经有持仓").template, "risk_control");
});

test("builds a separate saved workspace preview from a named template", () => {
  const current = workspace.createWorkspace("long_term");
  const result = workspace.previewWorkspaceChange(current, "新建一个 ETF 工作台");
  assert.equal(result.recommendation.recommendedTemplate, "etf");
  assert.ok(result.preview.modules.some((item) => item.type === "etf_overlap"));
  assert.ok(result.patch.every((item) => ["apply_template", "set_workflow"].includes(item.op)));
  assert.equal(result.needsConfirmation, true);
});

test("keeps explicitly confirmed preference signals and supports later mode changes", () => {
  const need=workspace.classifyWorkspaceNeed("我是新手，想长期持有，最多接受 12% 亏损，每周看 30 分钟，也会看小红书");
  assert.equal(need.preferences.holdingPeriod,"long_term");
  assert.equal(need.preferences.lossComfort,"12%");
  assert.equal(need.preferences.weeklyTime,"30分钟");
  assert.equal(need.preferences.focusSocialContent,true);
  assert.equal(workspace.previewWorkspaceChange(workspace.createWorkspace("active"),"忘记我的短线模式").canApply,true);
  assert.equal(workspace.previewWorkspaceChange(workspace.createWorkspace("custom"),"以后只给我 ETF 相关内容").recommendation.recommendedTemplate,"etf");
});

test("keeps workspace state user-owned, durable, confirmable, undoable and redoable", async () => {
  const [snapshot, server, confirmRoute] = await Promise.all([
    readFile(new URL("../app/lib/user-snapshot.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/assistant-server.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/workspace/command/[command_id]/confirm/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(snapshot, /authenticatedOwnerKey/);
  assert.match(snapshot, /owner_key TEXT PRIMARY KEY/);
  assert.match(server, /assistantPendingCommands/);
  assert.match(server, /workspaceRedoVersions/);
  assert.match(server, /redoAssistantWorkspace/);
  assert.match(server, /exportAssistantWorkspace/);
  assert.match(confirmRoute, /confirmed !== true/);
});
