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
用户表达“想赚钱”或“希望短期翻倍”只是目标，不等于要求你承诺收益。应指出目标的风险和不确定性，询问可承受损失、期限与是否先模拟，再帮助用户形成可复核的计划。只有代为下单、自动买卖或要求保证收益才需要拒绝。
不要索取或输出 API Key、券商密码、身份证、银行卡或验证码。
除非用户明确要求读取“我的持仓/我的组合”，否则不得主动读取或复述个人持仓。
不得主动推荐用户未提出的具体股票或 ETF，不得给出止损百分比、目标价或具体配置比例作为建议。
金额、币种和市场必须严格沿用工具结果；数据没有币种时不得自行推断。
一次最多问一个必要问题；优先给 2—4 个可选答案，用户选“自定义”时再让其输入。
回答自然、具体、有上下文，不要重复固定欢迎语，也不要把内部评估、课程目标或系统实现语言说给普通用户。`;

type AssistantEnvelope={answer:string;question?:string;options?:string[]};

function normalizeAssistantEnvelope(raw:string):AssistantEnvelope{
  const cleaned=raw.replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"").trim();
  try{
    const start=cleaned.indexOf("{");const end=cleaned.lastIndexOf("}");
    if(start>=0&&end>start){
      const parsed=JSON.parse(cleaned.slice(start,end+1)) as Partial<AssistantEnvelope>;
      const answer=String(parsed.answer??"").replace(/\*\*/g,"").trim().slice(0,220);
      const question=String(parsed.question??"").replace(/\*\*/g,"").trim().slice(0,60);
      const options=Array.isArray(parsed.options)?parsed.options.map((item)=>String(item).trim().slice(0,28)).filter(Boolean).slice(0,4):[];
      if(answer)return {answer,question:question||undefined,options};
    }
  }catch{/* Fall through to a safe compact rendering. */}
  const plain=cleaned.replace(/\*\*/g,"").replace(/^#{1,6}\s*/gm,"").replace(/\n{3,}/g,"\n\n");
  const first=plain.split(/\n\n+/).filter(Boolean)[0]??plain;
  return {answer:first.slice(0,220)+(first.length>220?"…":"")};
}

function progressiveQuestion(items:string[]){
  const question=items[0];
  if(!question)return null;
  if(/损失|亏损|回撤/.test(question))return {question,actions:["最多可承受 5%", "最多可承受 10%", "暂时不确定"]};
  if(/期限|持有|多久/.test(question))return {question,actions:["一个月以内", "几个月到一年", "一年以上", "暂时不确定"]};
  if(/时间|每周/.test(question))return {question,actions:["每周 10 分钟", "每周 30 分钟", "每周 1 小时以上"]};
  if(/模拟/.test(question))return {question,actions:["先做纸面模拟", "只学习和观察", "暂时不确定"]};
  return {question,actions:["是", "否", "暂时不确定"]};
}

function containsUnrequestedAssetRecommendation(content:string,userMessage:string){
  const mentioned=new Set(userMessage.match(/(?<!\d)\d{4,6}(?:\.HK)?(?!\d)/gi)??[]);
  const generated=content.match(/(?<!\d)\d{4,6}(?:\.HK)?(?!\d)/gi)??[];
  const addsAsset=generated.some((code)=>!mentioned.has(code));
  const recommendationLanguage=/(建议|建議|适合你|適合你|最安全|更进取|更進取|选一个|選一個|推荐|推薦|应该买|應該買|可以买|可以買|第一步.*ETF)/.test(content);
  return addsAsset&&recommendationLanguage;
}

function violatesExecutionOrPrivacyBoundary(content:string,userMessage:string,completedTools:string[]){
  const deniesPortfolio=/(不要|无需|不必|禁止).{0,8}(持仓|组合|账户)/.test(userMessage);
  const usesPortfolio=/(你的|您(?:的)?)(总资产|總資產|持仓|持倉|组合|組合|仓位|倉位)/.test(content);
  const claimsSideEffect=/(已|已经|已經).{0,8}(创建|創建|保存|设置|設定|应用|應用).{0,8}(提醒|规则|規則|工作台|组合|組合)/.test(content);
  const hasSideEffectTool=completedTools.some((tool)=>/(create_reminder|save_user_rule|create_workspace|save_workspace)/.test(tool));
  return (deniesPortfolio&&usesPortfolio)||(claimsSideEffect&&!hasSideEffectTool);
}

function violatesProgressiveDisclosure(content:string,userMessage:string){
  const numbered=(content.match(/(?:^|\n)\s*[1-9][.、]/g)??[]).length;
  const multipleQuestions=numbered>1&&/(告诉我|請告訴我|请告诉我|回答|确认|確認|选择|選擇)/.test(content);
  const unrequestedExamples=!/(?<!\d)\d{4,6}(?:\.HK)?(?!\d)/i.test(userMessage)&&/(例如|比如).{0,28}(ETF|股票|基金|腾讯|騰訊|阿里|茅台)/.test(content);
  return multipleQuestions||unrequestedExamples;
}

function syntheticAllocationAnalysis(message:string){
  if(!/(虚构|假设|模拟|測試|测试).*(占|%)/.test(message)||!/(集中度|仓位|風險|风险)/.test(message))return null;
  const rows=[...message.matchAll(/([\p{L}\d]+?(?:ETF|基金|股票|现金|現金))\s*(?:(?:占|为|為)\s*)?(\d+(?:\.\d+)?)%/gu)].map((match)=>({name:match[1],weight:Number(match[2])}));
  if(rows.length<2)return null;
  const total=rows.reduce((sum,row)=>sum+row.weight,0);const risky=rows.filter((row)=>!/(现金|現金)/.test(row.name));const largest=[...rows].sort((a,b)=>b.weight-a.weight)[0];
  const related=risky.filter((row)=>/(科技|芯片|半导体|半導體|AI)/i.test(row.name));
  return `按你提供的虚构比例计算：${rows.map((row)=>`${row.name} ${row.weight}%`).join("、")}。${total!==100?`这些比例合计 ${total}%，还缺 ${Math.max(0,100-total)}% 的说明。`:"比例合计 100%。"}\n\n单一项目最高是 ${largest.name}（${largest.weight}%）。${related.length>1?`${related.map((row)=>row.name).join("和")}的名称显示主题可能相关，合计 ${related.reduce((sum,row)=>sum+row.weight,0)}%；但仅凭名称不能确认底层持仓重合。要验证重复暴露，需要对应 ETF 代码和最新持仓披露。`:"目前没有足够信息判断底层资产是否重复。"}\n\n这是对输入比例的计算，不是对真实持仓的读取，也不构成调仓建议。`;
}

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
  const syntheticAnalysis=syntheticAllocationAnalysis(message);
  if(syntheticAnalysis)return responsePayload({sessionId,type:"analysis",content:syntheticAnalysis,intent:"synthetic_allocation_analysis",provider:actualProvider,toolUsed:"deterministic_allocation_calculator",data:task,suggestedActions:["补充 ETF 代码核对重合","只保留这次虚构分析"]});
  if(provider.providerId==="mock"||task.planner_mode==="local_fallback"){
    if(task.extraction.risk_level==="high"&&task.extraction.missing_information.length){
      const next=progressiveQuestion(task.extraction.missing_information);
      return responsePayload({sessionId,type:"clarification",content:`这个目标的风险很高，不能当作可保证的计划。我们先确认一件事：${next?.question ?? "是否先做纸面模拟"}？`,intent:"high_risk_goal_clarification",provider:actualProvider,toolUsed:"goal_to_workflow",data:task,suggestedActions:next?.actions ?? ["先做纸面模拟","只学习和观察"]});
    }
    if(completed.length){const capability=completed.find(item=>item.tool_id==="search_capabilities")?.output as {capabilities?:Array<{name:string;status:string;route?:string|null;inputs?:string[];outputs?:string[];limitations?:string[];last_updated?:string;why_relevant:string}>}|undefined;const content=capability?.capabilities?.length?`根据刚刚同步的能力索引，与你的问题最相关的是：\n${capability.capabilities.slice(0,6).map(item=>`• ${item.name}｜${item.status}｜入口 ${item.route??"无独立页面"}｜输入 ${item.inputs?.join("、")||"无"}｜输出 ${item.outputs?.join("、")||"无"}｜更新 ${item.last_updated??"时间未知"}${item.limitations?.length?`｜限制 ${item.limitations.join("、")}`:""}`).join("\n")}\n这些状态来自当前 Registry、服务状态和用户权限，不是模型猜测。`:`已完成 ${completed.length} 个确定性工具步骤${failed.length?`，另有 ${failed.length} 个步骤失败并可单独重试`:""}。结果、来源和运行状态已保留在任务记录中。`;return responsePayload({sessionId,type:"analysis",content,intent:"goal_to_workflow",provider:actualProvider,toolUsed:"goal_to_workflow",data:task,suggestedActions:["打开 Agent 任务详情","查看数据来源"]});}
    const next=progressiveQuestion(task.extraction.missing_information);const reason=providerState.privacyMode?"本地隐私模式已开启，但当前没有可用的本机模型。":"当前没有可用的真实模型。";const requestedHint=requested&&requested.providerId!=="mock"?` 你选择的 ${requested.displayName} 未连接或不符合当前隐私模式。`:"";return responsePayload({sessionId,type:next?"clarification":"error_message",content:next?`继续前只确认一件事：${next.question}？`:`${reason}${requestedHint} 系统没有伪造 AI 回答；可继续使用确定性工具。`,intent:"goal_to_workflow",provider:actualProvider,toolUsed:"goal_to_workflow",data:task,fallbackAvailable:true,suggestedActions:next?.actions ?? ["打开 Agent 工作台","切换模型","继续使用规则版结果"]});
  }
  try {
    const history=(input.history??[]).slice(-10).filter((item)=>item.content.trim()).map((item)=>({role:item.role,content:item.content.slice(0,1800)}));
    const candidates=[actualProvider,...providerState.providers.filter(item=>item.providerId!==actualProvider.providerId&&item.providerId!=="mock"&&item.enabled&&item.connectionStatus==="available")];const answer=await callAIProviderWithFallback(candidates,[{role:"system",content:`${ASSISTANT_SYSTEM_PROMPT}\n\n输出必须是 JSON：{"answer":"不超过 180 个汉字的直接回答","question":"最多一个必要问题，没有则为空","options":["2—4 个短选项"]}。不要输出 Markdown，不要列出多个问题，不要写欢迎词。`},...history,{role:"user",content:`当前页面：${context.label}\n用户问题：${message.slice(0,3000)}\nGoal-to-Workflow 任务：${JSON.stringify({goal:task.extraction.goal,steps:task.steps,tools:task.tool_calls.map(item=>({tool:item.tool_id,status:item.status,output:item.output,reliability:item.reliability})),sources:task.sources,missing:task.extraction.missing_information}).slice(0,12000)}`}],320);const envelope=normalizeAssistantEnvelope(answer.content);let content=[envelope.answer,envelope.question].filter(Boolean).join("\n");
    if(!content) throw new Error("empty");
    const blockedRecommendation=containsUnrequestedAssetRecommendation(content,message);
    const blockedBoundary=violatesExecutionOrPrivacyBoundary(content,message,completed.map((item)=>item.tool_id));
    const blockedProgressive=violatesProgressiveDisclosure(content,message);
    const blockedOutput=blockedRecommendation||blockedBoundary||blockedProgressive;
    if(blockedOutput)content="先不选具体标的，也不读取你的持仓。第一步只做一件简单的事：选择一种无须配置的体验方式。";
    const answeredBy=providerState.providers.find(item=>item.displayName===answer.provider||item.providerId===answer.provider)??actualProvider;const modelOptions=envelope.options?.length?envelope.options:[];return responsePayload({sessionId,type:blockedOutput||modelOptions.length?"clarification":completed.length?"analysis":"assistant_message",content,intent:"goal_to_workflow",provider:answeredBy,toolUsed:"goal_to_workflow",data:task,suggestedActions:blockedOutput?["先看 90 秒示例","学习一个基础概念","研究我自己输入的股票"]:modelOptions});
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
