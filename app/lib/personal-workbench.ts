export type Strategy = "long_term_fundamental" | "etf_allocation" | "swing_trading" | "thematic" | "beginner" | "custom";
export type InvestorProfile = {
  profileId: string; name: string; strategy: Strategy; riskLevel: "low" | "medium" | "high";
  holdingPeriod: "short_term" | "medium_term" | "long_term"; preferredMetrics: string[];
  maxSingleWeight: number; maxSectorWeight: number; maxDrawdown: number; allowLeverage: boolean;
  avoidChasing: boolean; requireTradeReason: boolean; requireExitCondition: boolean;
  explanationLevel: "beginner" | "intermediate" | "professional"; alertFrequency: "realtime" | "daily" | "weekly" | "monthly";
  confirmedAt?: string;
};
export type InvestmentRule = { id: string; category: string; field: string; operator: string; value: string | number | boolean; enabled: boolean; priority: "low" | "medium" | "high"; explanation: string };
export type ProfileDraft = { profile: InvestorProfile; rules: InvestmentRule[]; assumptions: string[]; questions: string[]; needsConfirmation: true };
export type UserStage = "beginner" | "learner" | "long_term" | "etf_user" | "active_trader" | "reviewer" | "risk_first" | "unknown";
export type ExploratoryGoal = "learn_basics" | "build_process" | "analyze_etf" | "diagnose_portfolio" | "review_trades" | "check_social_risk" | "simulate_investing" | "track_portfolio" | "market_only" | "learn_and_start" | "unknown";
export type WorkspaceWorkflowStep = "learn" | "simulate" | "research" | "check_social_claim" | "review_risk" | "pretrade_check" | "confirm_next_step" | "review_trade" | "generate_report" | "weekly_review" | "check_etf_overlap";
export type WorkspaceModule = { type: ModuleType; visible: boolean; order: number; width: "full" | "half" | "third"; density: Density };
export type ModuleType = "portfolio_overview" | "portfolio_risk" | "etf_overlap" | "sector_exposure" | "financial_quality" | "valuation" | "technical_chart" | "technical_signals" | "social_risk" | "social_topics" | "social_heat" | "social_sentiment" | "fundamental_verification" | "valuation_verification" | "volume_verification" | "portfolio_overlap" | "opportunity_check" | "trade_review" | "watchlist" | "learning_card" | "rule_deviation" | "recent_alerts" | "ai_summary" | "investment_goal" | "risk_tolerance" | "etf_basics" | "simulation_portfolio" | "term_explainer" | "pretrade_checklist" | "weekly_digest" | "drawdown_watch" | "liquidity_watch" | "quant_strategy" | "quant_backtest" | "quant_paper" | "quant_risk" | "quant_sensitivity" | "quant_schedule" | "quant_audit" | "quant_strategy_overview" | "quant_strategy_config" | "quant_news" | "quant_social_sentiment" | "quant_fundamental_validation" | "quant_portfolio_impact" | "quant_signal_history" | "quant_strategy_comparison" | "quant_ai_report";
export type Density = "simple" | "standard" | "professional";
export type ThemeId = "light_quiet" | "paper_reading" | "clear_blue" | "dark_focus" | "high_contrast";
export type WorkspaceTheme = { themeId: ThemeId; mode: "light" | "dark"; accent: "indigo" | "blue" | "slate"; fontScale: "small" | "medium" | "large"; radius: "compact" | "standard" | "soft"; chartStyle: "line" | "area"; motion: "reduced" | "standard"; marketColors: "cn" | "accessible" };
export type Workspace = { id: string; name: string; description: string; strategy: string; modules: WorkspaceModule[]; workflow: WorkspaceWorkflowStep[]; alertFrequency: "off" | "daily" | "weekly" | "monthly" | "event_based"; density: Density; explanationLevel: "beginner" | "intermediate" | "professional"; preferredAssets: string[]; preferredSectors: string[]; theme: WorkspaceTheme; updatedAt: string };
export type WorkspacePatchOperation =
  | { op: "add_module"; module: ModuleType; width: WorkspaceModule["width"] }
  | { op: "remove_module"; module: ModuleType }
  | { op: "set_visibility"; module: ModuleType; visible: boolean }
  | { op: "move_module"; module: ModuleType; to: number }
  | { op: "resize_module"; module: ModuleType; width: WorkspaceModule["width"] }
  | { op: "set_theme"; theme: ThemeId }
  | { op: "set_workflow"; workflow: WorkspaceWorkflowStep[] }
  | { op: "set_alert_frequency"; frequency: Workspace["alertFrequency"] }
  | { op: "apply_template"; template: WorkspaceTemplateId }
  | { op: "restore_default" };
export type WorkspacePreferenceSignals = { holdingPeriod?:"short_term"|"medium_term"|"long_term"; lossComfort?:string; weeklyTime?:string; viewFrequency?:"daily"|"weekly"|"monthly"; focusSocialContent?:boolean; showTechnicalIndicators?:boolean };
export type WorkspaceRecommendation = { type: "workspace_recommendation"; userStage: UserStage; goal: ExploratoryGoal; recommendedTemplate: WorkspaceTemplateId; reason: string; modules: ModuleType[]; workflow: WorkspaceWorkflowStep[]; preferences:WorkspacePreferenceSignals };
export type WorkspaceChangePreview = { preview: Workspace; patch: WorkspacePatchOperation[]; summary: string; affectedModules: ModuleType[]; changes: string[]; warnings: string[]; questions: string[]; intent: string; canApply: boolean; needsConfirmation: true; recommendation?: WorkspaceRecommendation };
export type WorkspaceTemplateId = "long_term" | "etf" | "active" | "beginner_safe_start" | "social_risk" | "trade_review" | "risk_control" | "custom";
export type SocialSignal = { category: string; excerpt: string; detail: string };
export type SocialAnalysis = { scores: { emotion: number; urgency: number; profitShowcase: number; evidence: number; riskDisclosure: number; following: number }; signals: SocialSignal[]; level: "低" | "中" | "高"; identifiedCodes: string[]; questions: string[] };
export type PrecheckResult = { reasonType: string; violations: string[]; checks: Array<{ title: string; severity: "低" | "中" | "高"; fact: string; explanation: string }>; afterSingleWeight: number; afterSectorWeight: number; questions: string[]; canContinue: boolean };

export const MODULE_LABELS: Record<ModuleType, string> = {
  portfolio_overview: "组合概览", portfolio_risk: "持仓风险", etf_overlap: "ETF 重复暴露", sector_exposure: "行业暴露", financial_quality: "财报体检",
  valuation: "估值位置", technical_chart: "技术图表", technical_signals: "技术指标", social_risk: "社交内容风险", social_topics:"社交热点主题", social_heat:"热度变化", social_sentiment:"情绪分布", fundamental_verification:"基本面核验", valuation_verification:"估值核验", volume_verification:"资金与成交量核验", portfolio_overlap:"与持仓重合度", opportunity_check: "机会检查", trade_review: "最近交易行为",
  watchlist: "关注列表", learning_card: "金融知识", rule_deviation: "规则偏离", recent_alerts: "最近风险提醒", ai_summary: "AI 摘要",
  investment_goal: "投资目标", risk_tolerance: "风险边界", etf_basics: "ETF 入门", simulation_portfolio: "模拟持仓", term_explainer: "术语解释", pretrade_checklist: "交易前检查", weekly_digest: "每周摘要", drawdown_watch: "回撤观察", liquidity_watch: "流动性提醒",
  quant_strategy:"量化策略",quant_backtest:"历史模拟",quant_paper:"模拟组合",quant_risk:"量化风险",quant_sensitivity:"参数敏感性",quant_schedule:"研究计划",quant_audit:"量化审计",
  quant_strategy_overview:"策略概览",quant_strategy_config:"策略配置",quant_news:"新闻事件分析",quant_social_sentiment:"社交情绪分析",quant_fundamental_validation:"基本面验证",quant_portfolio_impact:"持仓影响分析",quant_signal_history:"信号历史",quant_strategy_comparison:"策略对比",quant_ai_report:"AI 研究报告",
};
const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

export const DEFAULT_THEME: WorkspaceTheme = { themeId: "light_quiet", mode: "light", accent: "indigo", fontScale: "medium", radius: "standard", chartStyle: "line", motion: "standard", marketColors: "accessible" };
export const THEME_LABELS: Record<ThemeId, string> = { light_quiet: "安静浅色", paper_reading: "纸张阅读", clear_blue: "清透蓝", dark_focus: "深色专注", high_contrast: "高对比" };

export const DEFAULT_PROFILE: InvestorProfile = {
  profileId: "profile-default", name: "我的投资规则", strategy: "long_term_fundamental", riskLevel: "medium",
  holdingPeriod: "long_term", preferredMetrics: ["operating_cash_flow", "profit_growth"], maxSingleWeight: .3,
  maxSectorWeight: .5, maxDrawdown: .2, allowLeverage: false, avoidChasing: true, requireTradeReason: true,
  requireExitCondition: true, explanationLevel: "beginner", alertFrequency: "weekly",
};

const percentAfter = (text: string, labels: string[], fallback: number) => {
  for (const label of labels) {
    const match = text.match(new RegExp(`${label}[^。；，,]{0,12}?(?:不超过|上限|最多|控制在)?\\s*(\\d+(?:\\.\\d+)?)\\s*%`));
    if (match) return Math.min(1, Math.max(.01, Number(match[1]) / 100));
  }
  return fallback;
};

export function parseProfile(text: string): ProfileDraft {
  const source = text.trim();
  if (!source) throw new Error("请先用自己的话描述投资习惯和提醒边界");
  const profileId = id("profile");
  let strategy: Strategy = "custom";
  if (["长期", "基本面", "现金流", "利润增长"].some((word) => source.includes(word))) strategy = "long_term_fundamental";
  else if (source.toUpperCase().includes("ETF") || source.includes("指数")) strategy = "etf_allocation";
  else if (["波段", "均线", "技术"].some((word) => source.includes(word))) strategy = "swing_trading";
  else if (["主题", "赛道"].some((word) => source.includes(word))) strategy = "thematic";
  const maxSingleWeight = percentAfter(source, ["单一持仓", "单只", "单股"], .3);
  const maxSectorWeight = percentAfter(source, ["行业", "板块"], .5);
  const maxDrawdown = percentAfter(source, ["回撤", "最大亏损"], .2);
  const preferredMetrics = [["现金流", "operating_cash_flow"], ["利润增长", "profit_growth"], ["ROE", "roe"], ["估值", "pe"], ["股息", "dividend_yield"]]
    .filter(([label]) => source.toLowerCase().includes(label.toLowerCase())).map(([, metric]) => metric);
  const profile: InvestorProfile = { ...DEFAULT_PROFILE, profileId, strategy, preferredMetrics, maxSingleWeight, maxSectorWeight, maxDrawdown, holdingPeriod: source.includes("长期") ? "long_term" : source.includes("短期") ? "short_term" : "medium_term" };
  const rules: InvestmentRule[] = [
    { id: id("rule"), category: "portfolio", field: "single_asset_weight", operator: "<=", value: maxSingleWeight, enabled: true, priority: "high", explanation: `单一资产占比不超过 ${(maxSingleWeight * 100).toFixed(0)}%` },
    { id: id("rule"), category: "portfolio", field: "sector_weight", operator: "<=", value: maxSectorWeight, enabled: true, priority: "high", explanation: `单一行业占比不超过 ${(maxSectorWeight * 100).toFixed(0)}%` },
    { id: id("rule"), category: "behavior", field: "chasing", operator: "forbidden", value: true, enabled: true, priority: "high", explanation: "连续上涨或害怕错过时先复核依据" },
    { id: id("rule"), category: "behavior", field: "trade_reason", operator: "required", value: true, enabled: true, priority: "high", explanation: "每笔交易需要记录理由" },
    { id: id("rule"), category: "behavior", field: "exit_condition", operator: "required", value: true, enabled: true, priority: "high", explanation: "每笔交易需要记录退出或失效条件" },
  ];
  const assumptions = [];
  const questions = [];
  if (!/(单一持仓|单只|单股)/.test(source)) { assumptions.push("暂按单一资产上限 30% 生成候选规则"); questions.push("单一资产占比多少时需要提醒？"); }
  if (!/(行业|板块)/.test(source)) assumptions.push("暂按单一行业上限 50% 生成候选规则");
  if (!preferredMetrics.length) questions.push("你最想优先核对现金流、利润增长还是估值？");
  return { profile, rules, assumptions, questions, needsConfirmation: true };
}

const WORKSPACE_TEMPLATES: Record<WorkspaceTemplateId, { name: string; strategy: string; density: Density; explanation: Workspace["explanationLevel"]; description: string; modules: ModuleType[]; workflow: WorkspaceWorkflowStep[]; alertFrequency: Workspace["alertFrequency"] }> = {
  long_term: { name: "长期投资工作台", strategy: "long_term_fundamental", density: "standard", explanation: "intermediate", description: "围绕经营质量、估值和组合风险定期复核", modules: ["portfolio_overview", "financial_quality", "valuation", "sector_exposure", "portfolio_risk", "weekly_digest"], workflow: ["research", "review_risk", "weekly_review"], alertFrequency: "weekly" },
  etf: { name: "ETF 工作台", strategy: "etf_allocation", density: "standard", explanation: "beginner", description: "先看底层持仓、重复暴露，再看组合风险", modules: ["portfolio_overview", "etf_basics", "etf_overlap", "sector_exposure", "portfolio_risk", "weekly_digest"], workflow: ["research", "check_etf_overlap", "review_risk", "confirm_next_step"], alertFrequency: "weekly" },
  active: { name: "波段观察工作台", strategy: "swing_trading", density: "professional", explanation: "professional", description: "保留趋势观察，但先执行交易前风险检查", modules: ["watchlist", "technical_chart", "technical_signals", "pretrade_checklist", "portfolio_risk", "trade_review"], workflow: ["research", "review_risk", "pretrade_check", "confirm_next_step"], alertFrequency: "event_based" },
  beginner_safe_start: { name: "新手起步工作台", strategy: "beginner", density: "simple", explanation: "beginner", description: "先学习和模拟，再逐步建立自己的风险检查流程", modules: ["investment_goal", "risk_tolerance", "etf_basics", "portfolio_risk", "simulation_portfolio", "term_explainer", "pretrade_checklist"], workflow: ["learn", "simulate", "review_risk", "confirm_next_step"], alertFrequency: "weekly" },
  social_risk: { name: "社交热点观察工作台", strategy: "social_risk", density: "standard", explanation: "beginner", description: "先看样本边界和内容风险，再用基本面、估值与持仓交叉核验", modules: ["social_topics", "social_heat", "social_sentiment", "social_risk", "fundamental_verification", "valuation_verification", "volume_verification", "portfolio_overlap"], workflow: ["check_social_claim", "research", "review_risk", "confirm_next_step"], alertFrequency: "event_based" },
  trade_review: { name: "交易复盘工作台", strategy: "reviewer", density: "standard", explanation: "intermediate", description: "把交易记录、行为偏差和复盘报告放在同一流程", modules: ["trade_review", "rule_deviation", "portfolio_risk", "ai_summary", "weekly_digest"], workflow: ["review_trade", "generate_report", "weekly_review"], alertFrequency: "weekly" },
  risk_control: { name: "风险控制工作台", strategy: "risk_first", density: "standard", explanation: "beginner", description: "优先观察集中度、回撤、流动性和个人规则偏离", modules: ["portfolio_risk", "drawdown_watch", "sector_exposure", "liquidity_watch", "rule_deviation", "pretrade_checklist"], workflow: ["review_risk", "pretrade_check", "confirm_next_step"], alertFrequency: "event_based" },
  custom: { name: "自定义工作台", strategy: "custom", density: "standard", explanation: "beginner", description: "按自己的研究流程调整", modules: ["recent_alerts", "portfolio_risk", "social_risk", "trade_review"], workflow: ["research", "review_risk", "confirm_next_step"], alertFrequency: "daily" },
};

const TEMPLATE_ALIASES: Record<string, WorkspaceTemplateId> = { "长期基本面": "long_term", "长期投资工作台": "long_term", "ETF 配置": "etf", "ETF 工作台": "etf", "波段交易": "active", "新手学习": "beginner_safe_start", "新手工作台": "beginner_safe_start", "社交风险检查": "social_risk", "交易复盘工作台": "trade_review", "风险控制工作台": "risk_control", "自定义工作台": "custom" };

export function createWorkspace(template: string | WorkspaceTemplateId = "long_term"): Workspace {
  const templateId = (template in WORKSPACE_TEMPLATES ? template : TEMPLATE_ALIASES[template]) as WorkspaceTemplateId | undefined;
  const selected = WORKSPACE_TEMPLATES[templateId ?? "custom"];
  return { id: id("workspace"), name: selected.name, description: selected.description, strategy: selected.strategy, modules: selected.modules.map((type, order) => ({ type, order, visible: true, width: order === 0 ? "full" : "half", density: selected.density })), workflow: selected.workflow, alertFrequency: selected.alertFrequency, density: selected.density, explanationLevel: selected.explanation, preferredAssets: [], preferredSectors: [], theme: DEFAULT_THEME, updatedAt: now() };
}

export function classifyWorkspaceNeed(text: string): { stage: UserStage; goal: ExploratoryGoal; template: WorkspaceTemplateId; reason: string; questions: string[]; preferences:WorkspacePreferenceSignals } {
  const source = text.trim();
  let stage: UserStage = "unknown"; let goal: ExploratoryGoal = "unknown"; let template: WorkspaceTemplateId = "custom";
  if (/(小白|新手|不知道.*开始|不知道.*看什么|想挣钱)/.test(source)) { stage = "beginner"; goal = "learn_and_start"; template = "beginner_safe_start"; }
  if (/(只想学习|先学习|学习基础)/.test(source)) { stage = "learner"; goal = "learn_basics"; template = "beginner_safe_start"; }
  if (/ETF|指数基金/i.test(source)) { stage = "etf_user"; goal = "analyze_etf"; template = "etf"; }
  if (/(长期|价值投资|基本面)/.test(source)) { stage = "long_term"; goal = "build_process"; template = "long_term"; }
  if (/(短线|波段|交易频繁)/.test(source)) { stage = "active_trader"; goal = "build_process"; template = "active"; }
  if (/(复盘|交易记录)/.test(source)) { stage = "reviewer"; goal = "review_trades"; template = "trade_review"; }
  if (/(风险优先|控制风险|怕亏|承受.*低)/.test(source)) { stage = "risk_first"; goal = "diagnose_portfolio"; template = "risk_control"; }
  if (/(小红书|社交平台|别人推荐|群里|跟风)/.test(source)) { goal = "check_social_risk"; template = "social_risk"; }
  if (/(模拟|不想真实交易)/.test(source)) { goal = "simulate_investing"; if (stage === "unknown") stage = "learner"; template = "beginner_safe_start"; }
  if (/(已经有持仓|我的持仓|诊断持仓)/.test(source)) { goal = "diagnose_portfolio"; if (stage === "unknown") stage = "risk_first"; template = "risk_control"; }
  if (/(没时间|很忙|不看盘)/.test(source)) { goal = goal === "unknown" ? "track_portfolio" : goal; if (stage === "unknown") stage = "long_term"; if (template === "custom") template = "long_term"; }
  const questions: string[] = [];
  if (!/(长期|短期|波段|月|年)/.test(source)) questions.push("你更接近长期持有，还是会在几周到几个月内调整？");
  if (!/(亏损|回撤|风险|承受)/.test(source)) questions.push("出现多大幅度的亏损时，你会明显不安并希望收到提醒？");
  if (!/(没时间|每天|每周|小时|分钟)/.test(source)) questions.push("你每周大约愿意花多少时间查看和复核？");
  const reasons: Record<WorkspaceTemplateId, string> = { beginner_safe_start: "你目前更需要建立可理解、可模拟的基本流程，而不是立即面对大量行情和交易入口。", etf: "ETF 的关键不是名称，而是底层持仓、行业暴露和不同产品之间的重合。", long_term: "长期方式更适合把经营质量、估值和定期复核放在同一条流程中。", active: "更频繁的交易需要先检查仓位和退出条件，再看技术信号。", social_risk: "社交内容需要先拆分事实、传闻和紧迫措辞，再评估是否影响现有持仓。", trade_review: "复盘价值来自把交易事实、行为模式和下一次检查项连接起来。", risk_control: "风险优先时应先看集中度、回撤和流动性，而不是增加更多行情噪音。", custom: "信息还不足，先保留当前工作台并询问少量关键问题。" };
  const lossMatch=source.match(/(?:承受|接受|回撤|亏损)[^\d]{0,8}(\d+(?:\.\d+)?)\s*%/);
  const timeMatch=source.match(/每周[^\d]{0,8}(\d+(?:\.\d+)?)\s*(分钟|小时)/);
  const preferences:WorkspacePreferenceSignals={
    holdingPeriod:/(长期|一年以上)/.test(source)?"long_term":/(短期|几周)/.test(source)?"short_term":/(几个月|中期)/.test(source)?"medium_term":undefined,
    lossComfort:lossMatch?`${lossMatch[1]}%`:undefined,
    weeklyTime:timeMatch?`${timeMatch[1]}${timeMatch[2]}`:undefined,
    viewFrequency:/(每周|没时间|不看盘)/.test(source)?"weekly":/(每天|每日)/.test(source)?"daily":/(每月)/.test(source)?"monthly":undefined,
    focusSocialContent:/(小红书|社交平台|群里|跟风)/.test(source)||undefined,
    showTechnicalIndicators:/(不要|隐藏|不看).*(技术|K线)/.test(source)?false:/(需要|显示|关注).*(技术|K线)/.test(source)?true:undefined,
  };
  return { stage, goal, template, reason: reasons[template], questions: questions.slice(0, 3), preferences };
}

export function previewWorkspaceChange(workspace: Workspace, rawInstruction: string): WorkspaceChangePreview {
  const instruction = rawInstruction.replace(/K\s*线/gi, "K线").trim();
  let preview = structuredClone(workspace);
  const changes: string[] = [];
  const patch: WorkspacePatchOperation[] = [];
  const affected = new Set<ModuleType>();
  const warnings: string[] = []; let questions: string[] = [];
  const finish = (intent: string, recommendation?: WorkspaceRecommendation): WorkspaceChangePreview => {
    preview.modules.forEach((item, order) => { item.order = order; }); preview.updatedAt = now();
    return { preview, patch, summary: changes.join("；") || "需要补充信息后才能生成配置", affectedModules: [...affected], changes, warnings, questions: questions.slice(0, 3), intent, canApply: changes.length > 0 && !warnings.length, needsConfirmation: true, recommendation };
  };
  if (/(帮我|替我|自动).*(买入|卖出|下单|调仓)|^(买入|卖出)/.test(instruction)) { warnings.push("工作台助手不能执行交易，只能配置界面和风险检查。"); questions = ["你想把这笔计划加入观察列表，还是进入交易前风险检查？"]; return finish("trade_execution_blocked"); }
  if (/(单只|单股|单一持仓|行业).{0,12}(上限|比例).{0,8}\d+\s*%/.test(instruction)) { warnings.push("这会改变投资风险规则，不能作为界面配置直接应用。请到“我的规则”再次确认。"); return finish("risk_rule_blocked"); }
  if (instruction.includes("恢复默认")) { const reset = createWorkspace("long_term"); preview = { ...reset, id: workspace.id }; changes.push("恢复长期投资默认布局"); patch.push({ op: "restore_default" }); preview.modules.forEach((item)=>affected.add(item.type)); return finish("reset_workspace"); }

  const need = classifyWorkspaceNeed(instruction);
  const fuzzyRequest = /(想挣钱|小白|新手|不知道.*看什么|不知道.*适合|帮我安排|没时间|只想学习|学习模式|先模拟|已经有持仓|持仓复盘|社交平台影响|小红书|雪球|热门主题|社交热点|只.*ETF|(创建|新建).*(ETF|长期|复盘|风险|社交).*工作台)/i.test(instruction);
  if (fuzzyRequest) {
    const candidate = createWorkspace(need.template);
    preview = { ...candidate, id: workspace.id };
    if (/(没时间|很忙|不看盘)/.test(instruction)) { preview.alertFrequency = "weekly"; if (!preview.modules.some((item)=>item.type === "weekly_digest")) preview.modules.push({ type:"weekly_digest", visible:true, order:preview.modules.length, width:"half", density:preview.density }); preview.modules = preview.modules.filter((item)=>!(["technical_chart","technical_signals"] as ModuleType[]).includes(item.type)); }
    changes.push(`应用“${candidate.name}”`, `工作流程调整为：${preview.workflow.map((item)=>WORKFLOW_LABELS[item]).join(" → ")}`);
    patch.push({ op: "apply_template", template: need.template }, { op: "set_workflow", workflow: preview.workflow });
    preview.modules.forEach((item)=>affected.add(item.type)); questions = need.questions;
    const recommendation: WorkspaceRecommendation = { type:"workspace_recommendation", userStage:need.stage, goal:need.goal, recommendedTemplate:need.template, reason:need.reason, modules:preview.modules.map((item)=>item.type), workflow:preview.workflow, preferences:need.preferences };
    return finish("workspace_recommendation", recommendation);
  }
  if(/忘记.*短线/.test(instruction)){preview.strategy="custom";preview.modules.forEach((item)=>{if(["technical_chart","technical_signals"].includes(item.type)){item.visible=false;affected.add(item.type);patch.push({op:"set_visibility",module:item.type,visible:false});}});preview.workflow=["research","review_risk","confirm_next_step"];patch.push({op:"set_workflow",workflow:preview.workflow});changes.push("关闭短线技术模块并恢复通用风险复核流程");}
  if (/主要做|主要配置|关注/.test(instruction) && /ETF/i.test(instruction)) { preview.strategy = "etf_allocation"; preview.preferredAssets = ["ETF"]; changes.push("投资模式调整为 ETF 配置"); }
  const sectorInstruction = instruction.replace(/科技感/g, "");
  const sectors = ["科技", "医药", "消费", "金融", "新能源", "半导体", "人工智能", "红利"].filter((item) => sectorInstruction.includes(item));
  if (sectors.length) { preview.preferredSectors = sectors; changes.push(`关注行业调整为${sectors.join("、")}`); }
  if (instruction.includes("财报") && /顶部|最前|第一/.test(instruction)) {
    let target = preview.modules.find((item) => item.type === "financial_quality");
    if (!target) { target = { type: "financial_quality", visible: true, order: 0, width: "full", density: preview.density }; preview.modules.push(target); patch.push({op:"add_module",module:"financial_quality",width:"full"}); }
    target.visible = true; preview.modules = [target, ...preview.modules.filter((item) => item !== target)]; changes.push("财报体检移动到顶部"); patch.push({op:"move_module",module:"financial_quality",to:0}); affected.add("financial_quality");
  }
  const requestedModules: Array<[RegExp, ModuleType, string]> = [
    [/ETF\s*(重复暴露|重复持仓)|重复暴露|重复持仓/i, "etf_overlap", "ETF 重复暴露"],
    [/行业暴露|行业分布/, "sector_exposure", "行业暴露"],
    [/持仓风险|组合风险/, "portfolio_risk", "持仓风险"],
    [/最近风险提醒|风险提醒模块/, "recent_alerts", "最近风险提醒"],
    [/社交内容风险|跟风风险/, "social_risk", "社交内容风险"],
    [/交易复盘/, "trade_review", "最近交易行为"],
    [/关注列表|自选列表/, "watchlist", "关注列表"],
    [/交易前检查|风险检查流程/, "pretrade_checklist", "交易前检查"],
    [/每周摘要|周报/, "weekly_digest", "每周摘要"],
    [/回撤/, "drawdown_watch", "回撤观察"],
    [/流动性/, "liquidity_watch", "流动性提醒"],
    [/术语解释/, "term_explainer", "术语解释"],
    [/模拟持仓|模拟投资/, "simulation_portfolio", "模拟持仓"],
  ];
  for (const [pattern, moduleType, label] of requestedModules) {
    if (!pattern.test(instruction)) continue;
    let target = preview.modules.find((item) => item.type === moduleType);
    if (/(增加|添加|显示|固定)/.test(instruction)) {
      if (!target) {
        target = { type: moduleType, visible: true, order: preview.modules.length, width: "half", density: preview.density };
        preview.modules.push(target);
        changes.push(`添加${label}`);
        patch.push({op:"add_module",module:moduleType,width:"half"}); affected.add(moduleType);
      } else if (!target.visible) {
        target.visible = true;
        changes.push(`显示${label}`);
        patch.push({op:"set_visibility",module:moduleType,visible:true}); affected.add(moduleType);
      }
    }
    if (target && /(顶部|最前|第一|置顶)/.test(instruction)) {
      target.visible = true;
      preview.modules = [target, ...preview.modules.filter((item) => item !== target)];
      changes.push(`${label}移动到顶部`);
      patch.push({op:"move_module",module:moduleType,to:0}); affected.add(moduleType);
    }
    if (target && /(删除)/.test(instruction)) {
      preview.modules = preview.modules.filter((item)=>item.type !== moduleType);
      changes.push(`删除${label}`); patch.push({op:"remove_module",module:moduleType}); affected.add(moduleType);
    } else if (target && /(隐藏|不看|去掉)/.test(instruction)) {
      target.visible = false;
      changes.push(`隐藏${label}`);
      patch.push({op:"set_visibility",module:moduleType,visible:false}); affected.add(moduleType);
    }
    if (target && /(放大|整行|全宽)/.test(instruction)) { target.width="full"; changes.push(`${label}调整为全宽`); patch.push({op:"resize_module",module:moduleType,width:"full"}); affected.add(moduleType); }
    if (target && /(缩小|半宽)/.test(instruction)) { target.width="half"; changes.push(`${label}调整为半宽`); patch.push({op:"resize_module",module:moduleType,width:"half"}); affected.add(moduleType); }
  }
  if (/(隐藏|不看|去掉).*(K线|技术|趋势)/.test(instruction)) { preview.modules.forEach((item) => { if (["technical_chart", "technical_signals"].includes(item.type)) { item.visible = false; affected.add(item.type); patch.push({op:"set_visibility",module:item.type,visible:false}); } }); changes.push("隐藏技术图表和技术指标"); }
  if (/(简洁|极简|低刺激|只显示结论|少一点)/.test(instruction)) { preview.density = "simple"; preview.modules.forEach((item) => { item.density = "simple"; }); changes.push("信息密度调整为简洁"); }
  if (/(专业|数据密集|紧凑|详细数据|更多数据)/.test(instruction)) { preview.density = "professional"; preview.modules.forEach((item) => { item.density = "professional"; }); changes.push("信息密度调整为专业"); }
  if (/(白话|新手解释)/.test(instruction)) { preview.explanationLevel = "beginner"; changes.push("解释难度调整为白话"); }
  if (/(晚上|夜间|深色|控制台)/.test(instruction)) { preview.theme = { ...preview.theme, themeId: "dark_focus", mode: "dark" }; changes.push("主题调整为深色专注"); patch.push({op:"set_theme",theme:"dark_focus"}); }
  else if (/(纸张|阅读主题)/.test(instruction)) { preview.theme = { ...preview.theme, themeId: "paper_reading", mode: "light" }; changes.push("主题调整为纸张阅读"); patch.push({op:"set_theme",theme:"paper_reading"}); }
  else if (/(高对比|文字深一点)/.test(instruction)) { preview.theme = { ...preview.theme, themeId: "high_contrast", mode: "light" }; changes.push("主题调整为高对比"); patch.push({op:"set_theme",theme:"high_contrast"}); }
  else if (/(清透蓝|背景更亮|减少紫色|科技感|浅色|专业研究风)/.test(instruction)) { preview.theme = { ...preview.theme, themeId: "clear_blue", mode: "light", accent: "blue" }; changes.push("主题调整为清透蓝"); patch.push({op:"set_theme",theme:"clear_blue"}); }
  if (/(大字|字体大)/.test(instruction)) { preview.theme = { ...preview.theme, fontScale: "large" }; changes.push("字体调整为大号"); }
  if (/(轻量动画|轻微动效)/.test(instruction)) { preview.theme = { ...preview.theme, motion: "standard" }; changes.push("动效调整为轻量"); }
  if (/(减少动效|关闭动效|低动态)/.test(instruction)) { preview.theme = { ...preview.theme, motion: "reduced" }; changes.push("动效调整为减少"); }
  if (/(减少红绿|少用红绿)/.test(instruction)) { preview.theme = { ...preview.theme, marketColors: "accessible" }; changes.push("涨跌之外减少红绿颜色"); }
  const frequency = [["关闭提醒", "off"], ["每天", "daily"], ["每日", "daily"], ["每周", "weekly"], ["每月", "monthly"], ["事件触发", "event_based"]] as const;
  frequency.some(([label, value]) => { if (instruction.includes(label)) { preview.alertFrequency = value; changes.push(`风险提醒调整为${label}`); patch.push({op:"set_alert_frequency",frequency:value}); return true; } return false; });
  if (/输入股票后先做风险检查/.test(instruction)) { preview.workflow=["research","review_risk","pretrade_check","confirm_next_step"]; changes.push("输入股票后先做风险检查"); patch.push({op:"set_workflow",workflow:preview.workflow}); }
  if (/交易复盘后自动生成报告/.test(instruction)) { preview.workflow=["review_trade","generate_report","weekly_review"]; changes.push("交易复盘后生成报告草稿"); patch.push({op:"set_workflow",workflow:preview.workflow}); }
  if (/每次查看\s*ETF.*重复暴露/i.test(instruction)) { preview.workflow=["research","check_etf_overlap","review_risk","confirm_next_step"]; changes.push("查看 ETF 时先显示重复暴露"); patch.push({op:"set_workflow",workflow:preview.workflow}); }
  if (!changes.length) questions.push("你想解决什么问题？也可以直接说“我是新手”“我没时间看盘”或“我已经有持仓”。");
  return finish(changes.length ? "update_workspace" : "clarification");
}

export const WORKFLOW_LABELS: Record<WorkspaceWorkflowStep,string> = { learn:"学习基础", simulate:"模拟", research:"查看资料", check_social_claim:"核实社交说法", review_risk:"检查风险", pretrade_check:"交易前检查", confirm_next_step:"自行确认下一步", review_trade:"复盘交易", generate_report:"生成复盘草稿", weekly_review:"每周复核", check_etf_overlap:"检查 ETF 重复暴露" };

const includes = (text: string, terms: string[]) => terms.filter((term) => text.includes(term));
export function analyzeSocialContent(text: string): SocialAnalysis {
  const emotion = includes(text, ["起飞", "翻倍", "最后机会", "错过后悔", "必涨", "闭眼买", "赶紧上车"]);
  const urgency = includes(text, ["今天必须买", "明天就没机会", "最后一班车", "现在不上车就晚了", "马上"]);
  const authority = includes(text, ["老师说", "内部消息", "朋友在机构", "大V说", "主力已经进场", "大资金进场"]);
  const profit = includes(text, ["收益截图", "收益率", "赚了", "翻倍", "盈利截图"]);
  const evidence = includes(text, ["公告", "财报", "年报", "数据", "来源", "链接", "估值", "现金流"]);
  const risk = includes(text, ["风险", "回撤", "亏损", "不确定", "止损", "失效条件"]);
  const scores = { emotion: Math.min(100, emotion.length * 24 + authority.length * 14), urgency: Math.min(100, urgency.length * 30), profitShowcase: Math.min(100, profit.length * 32), evidence: Math.min(100, evidence.length * 18), riskDisclosure: Math.min(100, risk.length * 24), following: 0 };
  scores.following = Math.min(100, Math.round(scores.emotion * .3 + scores.urgency * .25 + scores.profitShowcase * .15 + (100 - scores.evidence) * .2 + authority.length * 10));
  const signals: SocialSignal[] = [];
  if (urgency.length) signals.push({ category: "时间压力", excerpt: urgency[0], detail: "紧迫措辞会压缩核实时间，不能替代公告、财报或价格数据。" });
  if (emotion.length) signals.push({ category: "情绪化表达", excerpt: emotion[0], detail: "情绪词反映传播方式，不证明标的质量或未来走势。" });
  if (authority.length) signals.push({ category: "权威暗示", excerpt: authority[0], detail: "无法仅凭身份暗示核实消息真伪，需要原始来源。" });
  if (profit.length) signals.push({ category: "收益展示", excerpt: profit[0], detail: "内容突出成功结果，但未说明亏损样本、时间区间和成本。" });
  if (!evidence.length) signals.push({ category: "证据不足", excerpt: "未提供可点击来源", detail: "暂未观察到公告、财报或可复核数据。相关主张保持未知。" });
  if (!risk.length) signals.push({ category: "风险缺失", excerpt: "未说明不确定性", detail: "内容没有描述判断失效条件、回撤或反面情景。" });
  const identifiedCodes = [...new Set(text.match(/(?<!\d)\d{6}(?!\d)/g) ?? [])];
  return { scores, signals, level: scores.following >= 65 ? "高" : scores.following >= 35 ? "中" : "低", identifiedCodes, questions: ["这条内容中哪一项事实可以在公告或财报中核对？", "如果不考虑近期热度，你仍会基于什么理由关注它？"] };
}

export function precheckTrade(input: { amount: number; portfolioValue: number; currentAssetValue: number; currentSectorValue: number; reason: string; holdingPeriod: string; exitCondition: string; recentChange: number; source: string; similarAssets: string[] }, profile: InvestorProfile): PrecheckResult {
  const total = input.portfolioValue + input.amount;
  const afterSingleWeight = total ? (input.currentAssetValue + input.amount) / total : 0;
  const afterSectorWeight = total ? (input.currentSectorValue + input.amount) / total : 0;
  const checks: PrecheckResult["checks"] = []; const violations: string[] = [];
  const add = (title: string, severity: "低" | "中" | "高", fact: string, explanation: string, violation?: string) => { checks.push({ title, severity, fact, explanation }); if (violation) violations.push(violation); };
  if (!input.reason.trim()) add("交易理由", "高", "没有填写可复核理由", "缺少理由时无法在未来检查原判断是否变化。", "缺少交易理由");
  if (!input.holdingPeriod) add("持有期限", "中", "没有填写预计持有期限", "不同期限需要核对的证据不同。", "缺少持有期限");
  if (!input.exitCondition) add("退出条件", "高", "没有填写判断失效条件", "缺少条件容易让复盘变成事后解释。", "缺少退出条件");
  if (afterSingleWeight > profile.maxSingleWeight) add("单一持仓", "高", `计划后 ${(afterSingleWeight * 100).toFixed(1)}%，个人上限 ${(profile.maxSingleWeight * 100).toFixed(0)}%`, "这是仓位集中问题，不代表标的一定有问题。", "超过单一持仓上限");
  if (afterSectorWeight > profile.maxSectorWeight) add("行业集中", "高", `计划后 ${(afterSectorWeight * 100).toFixed(1)}%，个人上限 ${(profile.maxSectorWeight * 100).toFixed(0)}%`, "同一行业资产可能同时受相似因素影响。", "超过行业上限");
  if (profile.avoidChasing && input.recentChange >= 10) add("近期涨幅", "中", `提供的近期涨幅为 ${input.recentChange.toFixed(1)}%`, "近期上涨不能证明后续方向，需要重新核对依据。", "触发不追连续上涨规则");
  if (input.similarAssets.length) add("重复暴露", "中", `已有相似资产：${input.similarAssets.join("、")}`, "名称不同也可能暴露于相同主题。", "可能重复暴露");
  const social = analyzeSocialContent(input.reason);
  if (["social", "friend"].includes(input.source) || social.scores.following >= 45) add("社交内容触发", social.scores.following >= 65 ? "高" : "中", `可观察跟风风险 ${social.scores.following}/100`, "只反映语言和证据特征，不判断作者动机。", "社交信息触发");
  return { reasonType: social.scores.following >= 45 ? "跟风" : /现金流|利润|营收|财报/.test(input.reason) ? "基本面" : /估值|PE|PB/.test(input.reason) ? "估值" : input.reason ? "不明确" : "不明确", violations, checks, afterSingleWeight, afterSectorWeight, questions: ["什么情况说明这次判断可能错了？", "如果价格回撤 10%，你会依据什么既定规则处理？"], canContinue: !checks.some((item) => item.severity === "高") };
}
