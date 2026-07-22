import { readUserSnapshot, writeUserSnapshot, type UserSnapshot } from "./user-snapshot";
import {
  DEFAULT_THEME,
  createWorkspace,
  previewWorkspaceChange,
  type ExploratoryGoal,
  type UserStage,
  type Workspace,
  type WorkspaceChangePreview,
} from "./personal-workbench";
import { pageContextFor, toCommandPreview } from "./global-assistant";
import { callAIProviderWithFallback, readProviderState, type AIProviderProfile, type ServerAIProviderProfile } from "./ai-provider-catalog";

type StoredCommand = {
  commandId: string;
  workspaceId: string;
  currentWorkspace: Workspace;
  proposedWorkspace: Workspace;
  changes: string[];
  warnings: string[];
  questions: string[];
  parsed: WorkspaceChangePreview;
  createNew?: boolean;
  createdAt: string;
  expiresAt: string;
};

type AssistantSnapshot = UserSnapshot & {
  aiProviders?: AIProviderProfile[];
  aiDefaultProviderId?: string;
  aiTaskRouting?: Record<string, string>;
  workspaces?: Workspace[];
  activeWorkspaceId?: string;
  workspaceVersions?: Array<{ configId: string; workspace: Workspace; createdAt: string; action?:"update"|"create" }>;
  workspaceRedoVersions?: Array<{ configId: string; workspace: Workspace; createdAt: string; action?:"update"|"create" }>;
  workspaceAudit?: Array<{ commandId: string; intent: string; proposedChanges: string[]; status: "applied" | "cancelled"; createdAt: string; confirmedAt?: string }>;
  exploratoryPreferences?: { userStage:UserStage; goal:ExploratoryGoal; holdingPeriod?:string; lossComfort?:string; weeklyTime?:string; viewFrequency?:string; focusSocialContent?:boolean; showTechnicalIndicators?:boolean; confirmedAt:string };
  assistantPendingCommands?: Record<string, StoredCommand>;
};

const normalizeWorkspace = (workspace: Workspace): Workspace => ({
  ...workspace,
  description: workspace.description ?? "按自己的研究流程调整",
  theme: workspace.theme ?? DEFAULT_THEME,
  modules: workspace.modules ?? [],
  workflow: workspace.workflow ?? ["research", "review_risk", "confirm_next_step"],
});

async function snapshotOrDefault() {
  const result = await readUserSnapshot();
  if (result.status === "unauthorized") throw new Error("请先登录");
  const snapshot = (result.status === "ready" ? result.snapshot : {}) as AssistantSnapshot;
  const workspaces = snapshot.workspaces?.length ? snapshot.workspaces.map(normalizeWorkspace) : [createWorkspace("长期基本面")];
  const activeWorkspace = workspaces.find((item) => item.id === snapshot.activeWorkspaceId) ?? workspaces[0];
  return { snapshot, workspaces, activeWorkspace };
}

const ASSISTANT_SYSTEM_PROMPT = `你是安心看股的个人投资工作台助手。
你可以自然回答投资研究问题，理解自然语言，解释 ETF、持仓、财报、估值、风险和社交平台内容，也可以调用系统提供的确定性工具。
你不能执行买入、卖出、下单或自动调仓，不能预测未来涨跌、承诺收益、编造行情财报估值或把缺失数据当成事实。
工作台修改必须先生成预览并等待确认；投资规则和风险上限不得静默修改。
涉及数据时只能使用工具结果，并说明数据日期与状态；数据不足时写“暂无数据”。
不要索取或输出 API Key、券商密码、身份证、银行卡或验证码。回答自然、具体、有上下文，不要重复固定欢迎语。`;

type ConversationTurn = { role:"user"|"assistant"; content:string };

function responsePayload(input: {
  sessionId:string; type:"assistant_message"|"config_preview"|"analysis"|"clarification"|"error_message"|"risk_alert";
  content:string; intent:string; provider:ServerAIProviderProfile; preview?:ReturnType<typeof toCommandPreview>;
  toolUsed?:string|null; data?:unknown; suggestedActions?:string[]; requiresConfirmation?:boolean; fallbackAvailable?:boolean;
}) {
  const result = {
    session_id:input.sessionId,type:input.type,content:input.content,intent:input.intent,
    model_used:input.provider.model,provider_id:input.provider.providerId,tool_used:input.toolUsed??null,
    preview:input.preview??null,data:input.data??null,suggested_actions:input.suggestedActions??[],
    requires_confirmation:input.requiresConfirmation??false,fallback_available:input.fallbackAvailable??false,
    disclaimer:"本工具仅用于投资研究与风险检查，不构成投资建议、收益承诺或买卖建议。",
    provider_mode:input.provider.mode,data_processing:input.provider.privacyLabel,
  };
  return {...result,message:{type:input.type,content:input.content,preview:input.preview}};
}

export async function createAssistantPreview(message: string, workspaceId?: string) {
  const { snapshot, workspaces, activeWorkspace } = await snapshotOrDefault();
  const namedWorkspace = /(切换|打开|进入)/.test(message)
    ? workspaces.find((item) => message.includes(item.name))
    : undefined;
  const current = namedWorkspace ?? workspaces.find((item) => item.id === workspaceId) ?? activeWorkspace;
  let parsed:WorkspaceChangePreview = namedWorkspace
    ? { preview: namedWorkspace, patch:[], summary:`切换到${namedWorkspace.name}`, affectedModules:[], changes: [`切换到${namedWorkspace.name}`], warnings: [], questions: [], intent: "switch_workspace", canApply: true, needsConfirmation: true as const }
    : previewWorkspaceChange(current, message);
  const createNew=Boolean(parsed.recommendation&&/(创建|新建)/.test(message));
  if(createNew&&parsed.recommendation){const created=createWorkspace(parsed.recommendation.recommendedTemplate);parsed={...parsed,preview:created,changes:[`新建“${created.name}”`,...parsed.changes.filter((item)=>!item.startsWith("应用“"))],summary:`新建“${created.name}”并保存为独立工作台`};}
  const commandId = `cmd_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const now = new Date();
  const command: StoredCommand = {
    commandId,
    workspaceId: parsed.preview.id,
    currentWorkspace: current,
    proposedWorkspace: parsed.preview,
    changes: parsed.changes,
    warnings: parsed.warnings,
    questions: parsed.questions,
    parsed,
    createNew,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 15 * 60_000).toISOString(),
  };
  if (parsed.canApply) {
    snapshot.assistantPendingCommands = { ...(snapshot.assistantPendingCommands ?? {}), [commandId]: command };
    snapshot.workspaces = workspaces;
    snapshot.activeWorkspaceId = current.id;
    await writeUserSnapshot(snapshot);
  }
  return { parsed, commandId, current };
}

export async function handleAssistantMessage(input: {
  message: string;
  session_id?: string;
  workspace_id?: string;
  route?: string;
  selected_provider?: string;
  history?: ConversationTurn[];
}) {
  const message = input.message.trim();
  if (!message) throw new Error("请先输入你想配置或了解的内容");
  await snapshotOrDefault();
  const route = input.route?.startsWith("/") ? input.route : "/";
  const context = pageContextFor(route);
  const providerState = await readProviderState();
  const providerAllowed=(item:ServerAIProviderProfile)=>!providerState.privacyMode||item.mode==="local"||item.mode==="rules";
  const requested=providerState.providers.find((item)=>item.providerId===input.selected_provider);
  const provider = providerState.providers.find((item)=>item.providerId===input.selected_provider&&item.enabled&&item.connectionStatus==="available"&&providerAllowed(item))
    ?? providerState.providers.find((item)=>item.isDefault&&item.enabled&&item.connectionStatus==="available")
    ?? providerState.providers.find((item)=>item.providerId==="mock")!;
  const sessionId = input.session_id || `session_${crypto.randomUUID()}`;

  if (/(帮我|替我|自动).*(买入|卖出|下单|调仓)|^(买入|卖出)/.test(message)) {
    return responsePayload({sessionId,type:"risk_alert",content:"我不能执行买卖、自动交易或调仓。我可以把这笔计划带入交易前检查，核对仓位、理由和退出条件。",intent:"trade_execution_blocked",provider,suggestedActions:["进入交易前检查","检查计划后仓位"]});
  }

  const {createAgentTask}=await import("./agent-os");
  const task=await createAgentTask({goal:message,route,selected_provider:provider.providerId});
  const actualProvider=providerState.providers.find(item=>item.providerId===task.provider)??provider;
  if(task.extraction.risk_level==="restricted")return responsePayload({sessionId,type:"risk_alert",content:task.reliability.message,intent:"restricted",provider:actualProvider,toolUsed:"goal_to_workflow",data:task,suggestedActions:["改为风险检查","创建纸面模拟"]});
  if(task.workspace_patch&&task.workspace_command_id){const preview=toCommandPreview(task.workspace_command_id,task.workspace_patch.preview.id,task.workspace_patch);return responsePayload({sessionId,type:"config_preview",content:`${task.workspace_patch.summary}。我已生成修改前后的预览，确认前不会改变工作台。`,intent:"workspace_config",provider:actualProvider,preview,requiresConfirmation:true,toolUsed:"goal_to_workflow",data:{task_id:task.task_id,steps:task.steps,reliability:task.reliability}});}
  const completed=task.tool_calls.filter(item=>item.status==="completed");const failed=task.tool_calls.filter(item=>item.status==="failed");
  if(provider.providerId==="mock"||task.planner_mode==="local_fallback"){
    if(completed.length){const capability=completed.find(item=>item.tool_id==="search_capabilities")?.output as {capabilities?:Array<{name:string;status:string;route?:string|null;why_relevant:string}>}|undefined;const content=capability?.capabilities?.length?`根据当前能力知识库，与你的问题最相关的是：${capability.capabilities.slice(0,6).map(item=>`${item.name}（${item.status}${item.route?`，入口 ${item.route}`:""}）`).join("；")}。这些状态来自当前 Registry，不是模型猜测。`:`已完成 ${completed.length} 个确定性工具步骤${failed.length?`，另有 ${failed.length} 个步骤失败并可单独重试`:""}。结果、来源和运行状态已保留在任务记录中。`;return responsePayload({sessionId,type:"analysis",content,intent:"goal_to_workflow",provider:actualProvider,toolUsed:"goal_to_workflow",data:task,suggestedActions:["打开 Agent 任务详情","查看数据来源"]});}
    const questions=task.extraction.missing_information.slice(0,3);const reason=providerState.privacyMode?"本地隐私模式已开启，但当前没有可用的本机模型。":"当前没有可用的真实模型。";const requestedHint=requested&&requested.providerId!=="mock"?` 你选择的 ${requested.displayName} 未连接或不符合当前隐私模式。`:"";return responsePayload({sessionId,type:questions.length?"clarification":"error_message",content:questions.length?`为了继续，我只需要确认：${questions.join("；")}`:`${reason}${requestedHint} 系统没有伪造 AI 回答；可继续使用确定性工具。`,intent:"goal_to_workflow",provider:actualProvider,toolUsed:"goal_to_workflow",data:task,fallbackAvailable:true,suggestedActions:["打开 Agent 工作台","切换模型","继续使用规则版结果"]});
  }
  try {
    const history=(input.history??[]).slice(-10).filter((item)=>item.content.trim()).map((item)=>({role:item.role,content:item.content.slice(0,1800)}));
    const candidates=[actualProvider,...providerState.providers.filter(item=>item.providerId!==actualProvider.providerId&&item.providerId!=="mock"&&item.enabled&&item.connectionStatus==="available")];const answer=await callAIProviderWithFallback(candidates,[{role:"system",content:ASSISTANT_SYSTEM_PROMPT},...history,{role:"user",content:`当前页面：${context.label}\n用户问题：${message.slice(0,3000)}\nGoal-to-Workflow 任务：${JSON.stringify({goal:task.extraction.goal,steps:task.steps,tools:task.tool_calls.map(item=>({tool:item.tool_id,status:item.status,output:item.output,reliability:item.reliability})),sources:task.sources,missing:task.extraction.missing_information}).slice(0,12000)}`}],650);const content=answer.content;
    if(!content) throw new Error("empty");
    const answeredBy=providerState.providers.find(item=>item.displayName===answer.provider||item.providerId===answer.provider)??actualProvider;return responsePayload({sessionId,type:completed.length?"analysis":"assistant_message",content,intent:"goal_to_workflow",provider:answeredBy,toolUsed:"goal_to_workflow",data:task,suggestedActions:["打开 Agent 任务详情","查看数据来源"]});
  } catch {
    return responsePayload({sessionId,type:"error_message",content:`${actualProvider.displayName} 当前暂时不可用；已完成的工具结果仍保留，没有补写模型结论。`,intent:"goal_to_workflow",provider:actualProvider,toolUsed:"goal_to_workflow",data:task,fallbackAvailable:true,suggestedActions:["重试失败步骤","切换模型","使用规则版结果"]});
  }
}

export async function confirmAssistantCommand(commandId: string) {
  const { snapshot, workspaces } = await snapshotOrDefault();
  const command = snapshot.assistantPendingCommands?.[commandId];
  if (!command) throw new Error("配置预览不存在或已经取消");
  if (new Date(command.expiresAt).getTime() < Date.now()) {
    delete snapshot.assistantPendingCommands?.[commandId];
    await writeUserSnapshot(snapshot);
    throw new Error("配置预览已过期，请重新生成");
  }
  const versionAction:"create"|"update"=command.createNew?"create":"update";
  snapshot.workspaceVersions = [...(snapshot.workspaceVersions ?? []), { configId: `config-${Date.now()}`, workspace: command.createNew?command.proposedWorkspace:command.currentWorkspace, createdAt: new Date().toISOString(), action:versionAction }].slice(-50);
  snapshot.workspaceRedoVersions = [];
  snapshot.workspaceAudit = [...(snapshot.workspaceAudit ?? []), { commandId, intent: "update_workspace", proposedChanges: command.changes, status: "applied" as const, createdAt: command.createdAt, confirmedAt: new Date().toISOString() }].slice(-200);
  snapshot.workspaces = command.createNew ? [...workspaces,command.proposedWorkspace] : workspaces.map((item) => item.id === command.workspaceId ? command.proposedWorkspace : item);
  snapshot.activeWorkspaceId = command.workspaceId;
  if (command.parsed?.recommendation) snapshot.exploratoryPreferences = { userStage:command.parsed.recommendation.userStage, goal:command.parsed.recommendation.goal, ...command.parsed.recommendation.preferences, confirmedAt:new Date().toISOString() };
  delete snapshot.assistantPendingCommands?.[commandId];
  await writeUserSnapshot(snapshot);
  return { status: "applied", workspace: command.proposedWorkspace, applied_changes: command.changes, can_undo: true };
}

export async function cancelAssistantCommand(commandId: string) {
  const { snapshot } = await snapshotOrDefault();
  const command = snapshot.assistantPendingCommands?.[commandId];
  if (!command) throw new Error("配置预览不存在或已经取消");
  delete snapshot.assistantPendingCommands?.[commandId];
  snapshot.workspaceAudit = [...(snapshot.workspaceAudit ?? []), { commandId, intent: "update_workspace", proposedChanges: command.changes, status: "cancelled" as const, createdAt: command.createdAt }].slice(-200);
  await writeUserSnapshot(snapshot);
  return { status: "cancelled", workspace_id: command.workspaceId };
}

export async function undoAssistantWorkspace(workspaceId?: string) {
  const { snapshot, workspaces, activeWorkspace } = await snapshotOrDefault();
  const targetId = workspaceId || activeWorkspace.id;
  const versions = snapshot.workspaceVersions ?? [];
  const index = versions.findLastIndex((item) => item.workspace.id === targetId);
  if (index < 0) throw new Error("当前工作台没有可撤销的版本");
  const restored = versions[index].workspace;
  const current = workspaces.find((item)=>item.id===targetId) ?? activeWorkspace;
  if(versions[index].action==="create"){
    const kept=workspaces.filter((item)=>item.id!==targetId);
    snapshot.workspaces=kept;
    snapshot.activeWorkspaceId=kept[0]?.id;
  }else snapshot.workspaces = workspaces.map((item) => item.id === targetId ? restored : item);
  snapshot.workspaceVersions = versions.filter((_, itemIndex) => itemIndex !== index);
  snapshot.workspaceRedoVersions = [...(snapshot.workspaceRedoVersions ?? []), {configId:`redo-${Date.now()}`,workspace:current,createdAt:new Date().toISOString(),action:versions[index].action}].slice(-50);
  snapshot.workspaceAudit = [...(snapshot.workspaceAudit ?? []), { commandId: `undo-${Date.now()}`, intent: "restore_previous", proposedChanges: ["恢复上一个已确认版本"], status: "applied" as const, createdAt: new Date().toISOString(), confirmedAt: new Date().toISOString() }].slice(-200);
  await writeUserSnapshot(snapshot);
  return { status: "restored", workspace: versions[index].action==="create"?(snapshot.workspaces[0]??restored):restored, can_undo: snapshot.workspaceVersions.some((item) => item.workspace.id === targetId), can_redo:true };
}

export async function redoAssistantWorkspace(workspaceId?: string) {
  const { snapshot, workspaces, activeWorkspace } = await snapshotOrDefault();
  const versions = snapshot.workspaceRedoVersions ?? [];
  let index = versions.findLastIndex((item)=>item.workspace.id===(workspaceId||activeWorkspace.id));
  if(index<0&&versions.length) index=versions.length-1;
  if(index<0) throw new Error("当前工作台没有可重做的版本");
  const restored=versions[index].workspace;
  const targetId=restored.id;
  snapshot.workspaceVersions=[...(snapshot.workspaceVersions??[]),{configId:`config-${Date.now()}`,workspace:restored,createdAt:new Date().toISOString(),action:versions[index].action}].slice(-50);
  snapshot.workspaceRedoVersions=versions.filter((_,itemIndex)=>itemIndex!==index);
  snapshot.workspaces=versions[index].action==="create"&&!workspaces.some((item)=>item.id===targetId)?[...workspaces,restored]:workspaces.map((item)=>item.id===targetId?restored:item);
  snapshot.activeWorkspaceId=targetId;
  snapshot.workspaceAudit=[...(snapshot.workspaceAudit??[]),{commandId:`redo-${Date.now()}`,intent:"redo_workspace",proposedChanges:["重做上一次撤销的配置"],status:"applied" as const,createdAt:new Date().toISOString(),confirmedAt:new Date().toISOString()}].slice(-200);
  await writeUserSnapshot(snapshot);
  return {status:"restored",workspace:restored,can_redo:snapshot.workspaceRedoVersions.some((item)=>item.workspace.id===targetId),can_undo:true};
}

export async function exportAssistantWorkspace(workspaceId?:string){
  const {snapshot,workspaces,activeWorkspace}=await snapshotOrDefault();
  const workspace=workspaces.find((item)=>item.id===workspaceId)??activeWorkspace;
  return {schema_version:"anxin-workspace-v1",exported_at:new Date().toISOString(),workspace,preferences:snapshot.exploratoryPreferences??null,disclaimer:"配置只包含工作台布局、流程和已确认偏好，不包含 API Key、交易账户或身份资料。"};
}

export async function workspaceState(){
  const {snapshot,workspaces,activeWorkspace}=await snapshotOrDefault();
  return {workspaces,active_workspace_id:activeWorkspace.id,versions:snapshot.workspaceVersions??[],audit:snapshot.workspaceAudit??[],can_undo:snapshot.workspaceVersions?.length?true:false,can_redo:snapshot.workspaceRedoVersions?.length?true:false};
}

export async function restoreAssistantWorkspaceVersion(configId:string){
  const {snapshot,workspaces}=await snapshotOrDefault();
  const version=(snapshot.workspaceVersions??[]).find((item)=>item.configId===configId);
  if(!version)throw new Error("工作台历史版本不存在");
  const current=workspaces.find((item)=>item.id===version.workspace.id);
  snapshot.workspaceVersions=[...(snapshot.workspaceVersions??[]),...(current?[{configId:`config-${Date.now()}`,workspace:current,createdAt:new Date().toISOString(),action:"update" as const}]:[])].slice(-50);
  snapshot.workspaces=current?workspaces.map((item)=>item.id===version.workspace.id?version.workspace:item):[...workspaces,version.workspace];
  snapshot.activeWorkspaceId=version.workspace.id;
  snapshot.workspaceAudit=[...(snapshot.workspaceAudit??[]),{commandId:`restore-${Date.now()}`,intent:"restore_version",proposedChanges:[`恢复版本 ${configId}`],status:"applied" as const,createdAt:new Date().toISOString(),confirmedAt:new Date().toISOString()}].slice(-200);
  await writeUserSnapshot(snapshot);
  return {status:"restored",workspace:version.workspace,config_id:configId,can_undo:true};
}

export async function assistantSessionSummary() {
  const { activeWorkspace, snapshot } = await snapshotOrDefault();
  const { providers, privacyMode } = await readProviderState();
  return {
    session_id: `session_${crypto.randomUUID()}`,
    workspace_id: activeWorkspace.id,
    can_undo:snapshot.workspaceVersions?.some((item)=>item.workspace.id===activeWorkspace.id)??false,
    can_redo:snapshot.workspaceRedoVersions?.some((item)=>item.workspace.id===activeWorkspace.id)??false,
    providers: providers.map((provider) => { const safe={...provider} as Partial<ServerAIProviderProfile>; delete safe.apiKey; return {...safe,available:provider.enabled&&provider.secretStatus!=="missing"}; }),
    default_provider_id: providers.find((provider) => provider.isDefault)?.providerId ?? "mock",
    privacy_mode:privacyMode,
  };
}

export async function resetAssistantSession() {
  const { snapshot } = await snapshotOrDefault();
  snapshot.assistantPendingCommands = {};
  await writeUserSnapshot(snapshot);
  return { status: "reset", session_id: `session_${crypto.randomUUID()}` };
}
