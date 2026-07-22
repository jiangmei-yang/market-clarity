import type { ExploratoryGoal, ModuleType, UserStage, Workspace, WorkspaceChangePreview, WorkspacePatchOperation, WorkspaceRecommendation, WorkspaceWorkflowStep } from "./personal-workbench";

export type AssistantMessageType =
  | "user_message"
  | "assistant_message"
  | "analysis"
  | "clarification"
  | "system_status"
  | "config_preview"
  | "risk_alert"
  | "quick_action"
  | "error_message";

export type AssistantMessage = {
  id: string;
  type: AssistantMessageType;
  content: string;
  createdAt: string;
  preview?: AssistantCommandPreview;
  action?: "undo" | "redo";
  toolUsed?: string | null;
  modelUsed?: string;
};

export type AssistantCommandPreview = {
  commandId: string;
  workspaceId: string;
  type: "workspace_patch" | "workspace_recommendation";
  patch: WorkspacePatchOperation[];
  summary: string;
  affectedModules: ModuleType[];
  changes: string[];
  warnings: string[];
  questions: string[];
  proposedWorkspace?: Workspace;
  recommendation?: WorkspaceRecommendation;
  userStage?: UserStage;
  goal?: ExploratoryGoal;
  workflow?: WorkspaceWorkflowStep[];
  requiresConfirmation: true;
};

export type AssistantProvider = {
  providerId: string;
  displayName: string;
  baseUrl?: string;
  model?: string;
  enabled: boolean;
  isDefault: boolean;
  secretStatus: "not_required" | "server_configured" | "missing";
  connectionStatus?: "available" | "missing_configuration" | "unavailable";
  mode?: "local" | "platform" | "external" | "rules";
  privacyLabel?: string;
  isPlatformDefault?: boolean;
  description?: string;
};

export type AssistantPageContext = {
  route: string;
  page: string;
  label: string;
  suggestions: string[];
};

export type AssistantSessionState = {
  open: boolean;
  messages: AssistantMessage[];
  draft: string;
  currentWorkspaceId: string;
  currentRoute: string;
  pendingPreview: AssistantCommandPreview | null;
  unreadCount: number;
  selectedProvider: string;
  sessionId: string;
  canUndo: boolean;
  canRedo: boolean;
};

export const ASSISTANT_SESSION_KEY = "anxin.globalAssistant.v1";

export const WELCOME_MESSAGE: AssistantMessage = {
  id: "welcome",
  type: "assistant_message",
  content: "你不需要一开始就知道看什么。告诉我你的目标、时间或困惑，我会先推荐一个工作台；所有变化都要经你确认。",
  createdAt: new Date(0).toISOString(),
};

export const PAGE_CONTEXTS: Array<{ match: (route: string) => boolean; value: Omit<AssistantPageContext, "route"> }> = [
  { match: (route) => route === "/", value: { page: "home", label: "我的投资工作台", suggestions: ["把财报放到顶部", "增加 ETF 重复暴露"] } },
  { match: (route) => route.startsWith("/etf-tool"), value: { page: "etf", label: "ETF 诊断", suggestions: ["解释 ETF 重复暴露", "把重复持仓模块固定到首页"] } },
  { match: (route) => route.startsWith("/trade-tool"), value: { page: "trade_review", label: "交易复盘", suggestions: ["解释我的亏损主要来自什么", "检查我的交易纪律"] } },
  { match: (route) => route.startsWith("/opportunity"), value: { page: "opportunity", label: "机会检查", suggestions: ["这段内容有没有跟风信号", "检查它是否符合我的投资规则"] } },
  { match: (route) => route.startsWith("/analysis?view=portfolio"), value: { page: "portfolio", label: "我的持仓", suggestions: ["解释当前组合的集中度", "检查仓位是否超过个人边界"] } },
  { match: (route) => route.startsWith("/analysis?view=newDecision"), value: { page: "decision", label: "决策验证", suggestions: ["帮我拆分事实和推断", "检查计划金额的组合影响"] } },
  { match: (route) => route.startsWith("/analysis?view=history"), value: { page: "history", label: "历史记录", suggestions: ["总结我反复出现的风险", "比较修改前后的计划"] } },
  { match: (route) => route.startsWith("/analysis"), value: { page: "research", label: "股票研究", suggestions: ["解释估值分位", "帮我整理待核实问题"] } },
  { match: (route) => route.startsWith("/portfolio"), value: { page: "portfolio", label: "我的组合", suggestions: ["解释当前组合的集中度", "增加行业暴露模块"] } },
  { match: (route) => route.startsWith("/profile"), value: { page: "rules", label: "我的规则", suggestions: ["用白话解释这些规则", "切换为每周提醒"] } },
  { match: (route) => route.startsWith("/workspace"), value: { page: "workspace", label: "工作台设置", suggestions: ["隐藏复杂 K 线", "设置浅色主题"] } },
  { match: (route) => route.startsWith("/ai-settings"), value: { page: "ai_settings", label: "AI 模型设置", suggestions: ["解释不同模型的用途", "切换到本地规则模式"] } },
];

export function pageContextFor(route: string): AssistantPageContext {
  const found = PAGE_CONTEXTS.find((item) => item.match(route))?.value ?? {
    page: "unknown",
    label: "安心看股",
    suggestions: ["创建我的工作台", "解释当前页面"],
  };
  return { route, ...found };
}

export function createAssistantSession(): AssistantSessionState {
  return {
    open: true,
    messages: [WELCOME_MESSAGE],
    draft: "",
    currentWorkspaceId: "default",
    currentRoute: "/",
    pendingPreview: null,
    unreadCount: 0,
    selectedProvider: "mock",
    canUndo: false,
    canRedo: false,
    sessionId: `session_${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`,
  };
}

export function toCommandPreview(commandId: string, workspaceId: string, preview: WorkspaceChangePreview): AssistantCommandPreview {
  return {
    commandId,
    workspaceId,
    type: preview.recommendation ? "workspace_recommendation" : "workspace_patch",
    patch: preview.patch,
    summary: preview.summary,
    affectedModules: preview.affectedModules,
    changes: preview.changes,
    warnings: preview.warnings,
    questions: preview.questions,
    proposedWorkspace: preview.preview,
    recommendation: preview.recommendation,
    userStage: preview.recommendation?.userStage,
    goal: preview.recommendation?.goal,
    workflow: preview.preview.workflow,
    requiresConfirmation: true,
  };
}

export function isConfigurationRequest(message: string) {
  const source = message.replace(/K\s*线/gi, "K线");
  if (/(解释|为什么|是什么|怎么看|分析).*(风险|指标|亏损|暴露|估值|回撤|波动)/.test(source)) return false;
  return /(工作台|界面|主题|浅色|深色|高对比|字体|大字|提醒|简洁|专业|白话|隐藏|显示|增加|添加|删除|移动|移到|顶部|放大|缩小|K线|财报|ETF.*配置|恢复默认|想挣钱|小白|新手|不知道.*看什么|不知道.*适合|帮我安排|没时间|只想学习|学习模式|先模拟|已经有持仓|持仓复盘|社交平台影响|只.*ETF|忘记.*短线|先做风险检查|自动生成报告|重复暴露)/i.test(source);
}

export function safeContextPayload(context: AssistantPageContext, workspaceId: string, pendingCommandId: string | null) {
  return {
    route: context.route,
    workspace_id: workspaceId,
    page_context: context.page,
    selected_asset: null,
    pending_command_id: pendingCommandId,
  };
}
