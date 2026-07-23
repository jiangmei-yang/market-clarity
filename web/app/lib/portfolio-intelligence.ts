export type ThesisStatus = "尚未建立判断" | "判断仍待核实" | "暂无明显变化" | "出现需要关注的变化" | "失效条件可能触发" | "已到复核时间" | "已结束观察";

export type InvestmentThesis = {
  id: string;
  stockCode: string;
  title: string;
  originalStatement: string;
  confirmedFacts: string[];
  externalClaims: string[];
  userInferences: string[];
  supportingEvidence: string[];
  contradictingEvidence: string[];
  openQuestions: string[];
  invalidationConditions: string[];
  horizon: string;
  nextReviewAt: string;
  status: ThesisStatus;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
};

export type StrategyTemplate = "宽基ETF定投" | "股债再平衡" | "红利低波动" | "ETF趋势过滤" | "基本面长期持有" | "单股仓位纪律";
export type StrategyProfile = {
  id: string;
  name: string;
  templateType: StrategyTemplate;
  assetScope: string;
  entryRules: string[];
  addRules: string[];
  reduceRules: string[];
  exitRules: string[];
  expectedHoldingPeriod: string;
  rebalanceFrequency: "每周" | "每月" | "每季";
  maxPositionRatio: number;
  maxIndustryRatio: number;
  maxDrawdown: number;
  pauseConditions: string[];
  applicableRegimes: string[];
  excludedRegimes: string[];
  version: number;
  status: "启用" | "暂停" | "模拟观察中";
  createdAt: string;
  updatedAt: string;
};

export type StrategyHealthSnapshot = {
  strategyId: string;
  checkedAt: string;
  dataCutoff: string;
  status: "暂无明显偏离" | "数据不足" | "需要复核" | "超出个人边界" | "模拟观察中" | "已暂停";
  positionDeviation: string;
  frequencyDeviation: string;
  drawdownState: string;
  concentrationState: string;
  dataCoverage: string;
  triggeredRules: string[];
  messages: string[];
};

export type ReviewOutcome = {
  id: string;
  thesisId?: string;
  decisionId?: string;
  triggerType: "到期" | "失效条件" | "数据更新" | "方法偏离" | "用户主动";
  changes: string[];
  stillSupported: string[];
  weakened: string[];
  unresolved: string[];
  userAction: "维持判断" | "修改判断" | "结束观察" | "稍后复核";
  nextReviewAt?: string;
  createdAt: string;
};

export type MonitoringAlert = {
  id: string;
  stockCode: string;
  thesisId?: string;
  sourceType: "正式披露" | "行情数据" | "财务数据" | "媒体报道" | "市场观点" | "用户个人判断";
  source: string;
  occurredAt: string;
  title: string;
  change: string;
  relation: "提供支持" | "产生冲突" | "仍无法判断" | "数据不足";
  matchedRule: string;
  severity: "需要处理" | "一般";
  status: "待处理" | "稍后处理" | "已完成";
};

export type ShadowSimulation = {
  id: string;
  strategyId: string;
  signalAt: string;
  theoreticalPrice: number;
  executable: "可能成交" | "涨跌停限制" | "数据不足";
  simulatedPosition: number;
  simulatedCost: number;
  benchmarkChange: number;
  deviations: string[];
  viewed: boolean;
  enteredDecision: boolean;
};

export type ProductEventName = "onboarding_started" | "onboarding_completed" | "demo_portfolio_selected" | "holding_added" | "holding_imported" | "thesis_created" | "thesis_updated" | "invalidation_added" | "monitoring_alert_opened" | "monitoring_alert_snoozed" | "strategy_created" | "strategy_enabled" | "strategy_health_viewed" | "quant_verification_started" | "quant_verification_completed" | "decision_started" | "decision_completed" | "decision_modified" | "decision_delayed" | "review_completed" | "advanced_feature_interest";
export type ProductEvent = { name: ProductEventName; occurredAt: string; context?: Record<string, string | number | boolean> };

export const STRATEGY_TEMPLATES: Record<StrategyTemplate, Omit<StrategyProfile, "id" | "createdAt" | "updatedAt" | "version" | "status">> = {
  "宽基ETF定投": { name: "宽基 ETF 定投", templateType: "宽基ETF定投", assetScope: "宽基ETF", entryRules: ["按固定周期投入"], addRules: ["不因单日涨跌临时加码"], reduceRules: ["目标资金用途变化时复核"], exitRules: ["资产配置目标改变时退出"], expectedHoldingPeriod: "3年以上", rebalanceFrequency: "每月", maxPositionRatio: 40, maxIndustryRatio: 50, maxDrawdown: 25, pauseConditions: ["连续3次偏离原计划"], applicableRegimes: ["长期闲置资金"], excludedRegimes: ["短期必须使用的资金"] },
  "股债再平衡": { name: "股债再平衡", templateType: "股债再平衡", assetScope: "宽基ETF与债券ETF", entryRules: ["先确认目标股债比例"], addRules: ["只在月度检查或偏离阈值时再平衡"], reduceRules: ["恢复目标比例"], exitRules: ["资金目标改变时重设方法"], expectedHoldingPeriod: "1年以上", rebalanceFrequency: "每月", maxPositionRatio: 60, maxIndustryRatio: 60, maxDrawdown: 18, pauseConditions: ["数据缺失时不执行模拟信号"], applicableRegimes: ["需要分散配置"], excludedRegimes: ["单一主题集中投资"] },
  "红利低波动": { name: "红利与低波动", templateType: "红利低波动", assetScope: "红利股票与ETF", entryRules: ["盈利和分红记录可核实"], addRules: ["分红逻辑未削弱且仓位未超限"], reduceRules: ["盈利质量或分红能力明显削弱"], exitRules: ["原分红假设失效"], expectedHoldingPeriod: "1年以上", rebalanceFrequency: "每季", maxPositionRatio: 20, maxIndustryRatio: 35, maxDrawdown: 20, pauseConditions: ["连续4个不利阶段暂停加仓"], applicableRegimes: ["现金流相对稳定"], excludedRegimes: ["利润高度周期且现金流不可验证"] },
  "ETF趋势过滤": { name: "ETF 趋势过滤", templateType: "ETF趋势过滤", assetScope: "流动性较好的ETF", entryRules: ["趋势条件确认后进入观察"], addRules: ["只按固定频率检查"], reduceRules: ["趋势条件失效时进入复核"], exitRules: ["退出条件确认且可成交"], expectedHoldingPeriod: "1至6个月", rebalanceFrequency: "每周", maxPositionRatio: 30, maxIndustryRatio: 40, maxDrawdown: 15, pauseConditions: ["连续3次模拟信号不利"], applicableRegimes: ["趋势相对清晰"], excludedRegimes: ["停牌或流动性不足"] },
  "基本面长期持有": { name: "基本面长期持有", templateType: "基本面长期持有", assetScope: "A股个股", entryRules: ["核心经营判断可写清并有公开资料"], addRules: ["新证据支持原判断且仓位未超限"], reduceRules: ["核心假设被削弱时先复核"], exitRules: ["失效条件被正式数据确认"], expectedHoldingPeriod: "6个月以上", rebalanceFrequency: "每季", maxPositionRatio: 20, maxIndustryRatio: 35, maxDrawdown: 20, pauseConditions: ["经营现金流持续恶化"], applicableRegimes: ["可持续跟踪基本面"], excludedRegimes: ["仅依赖短期传闻"] },
  "单股仓位纪律": { name: "单股仓位纪律", templateType: "单股仓位纪律", assetScope: "A股个股", entryRules: ["每次操作前计算计划后仓位"], addRules: ["计划后比例不得超过个人上限"], reduceRules: ["超限时进入复核"], exitRules: ["用户确认的退出规则触发"], expectedHoldingPeriod: "按判断期限", rebalanceFrequency: "每月", maxPositionRatio: 20, maxIndustryRatio: 35, maxDrawdown: 20, pauseConditions: ["7日内修改计划超过3次"], applicableRegimes: ["所有低频持仓"], excludedRegimes: ["高频交易"] },
};

export function createStrategy(templateType: StrategyTemplate, now = new Date().toISOString()): StrategyProfile {
  return { ...STRATEGY_TEMPLATES[templateType], id: `strategy-${templateType}-${now}`, version: 1, status: "启用", createdAt: now, updatedAt: now };
}

export function evaluateStrategy(strategy: StrategyProfile | undefined, holdings: Record<string, { value: number }>, capital: number, decisionCount = 0): StrategyHealthSnapshot | undefined {
  if (!strategy) return undefined;
  const ratios = Object.values(holdings).map((item) => capital > 0 ? item.value / capital * 100 : 0);
  const largest = Math.max(0, ...ratios);
  const triggered: string[] = [];
  if (largest > strategy.maxPositionRatio) triggered.push(`最大单股比例 ${largest.toFixed(1)}%，高于方法上限 ${strategy.maxPositionRatio}%`);
  if (decisionCount > 3 && strategy.rebalanceFrequency !== "每周") triggered.push(`最近记录 ${decisionCount} 次操作，需要核对是否超过${strategy.rebalanceFrequency}频率`);
  const noData = Object.keys(holdings).length === 0;
  return {
    strategyId: strategy.id,
    checkedAt: new Date().toISOString(),
    dataCutoff: new Date().toISOString().slice(0, 10),
    status: strategy.status === "暂停" ? "已暂停" : strategy.status === "模拟观察中" ? "模拟观察中" : noData ? "数据不足" : triggered.length ? "超出个人边界" : "暂无明显偏离",
    positionDeviation: noData ? "尚无持仓" : `最大单股 ${largest.toFixed(1)}% / 方法上限 ${strategy.maxPositionRatio}%`,
    frequencyDeviation: `记录到 ${decisionCount} 次决策；目标频率 ${strategy.rebalanceFrequency}`,
    drawdownState: "缺少可靠组合净值，暂不计算实际回撤",
    concentrationState: noData ? "数据不足" : largest > strategy.maxPositionRatio ? "超过方法边界" : "未超过方法边界",
    dataCoverage: noData ? "不可用" : `${Object.keys(holdings).length} 只持仓 · 手动金额`,
    triggeredRules: triggered,
    messages: triggered.length ? triggered : [noData ? "添加持仓后检查方法偏离" : "当前记录未触发方法偏离；不代表没有投资风险"],
  };
}

export const FEATURE_ACCESS = {
  free: { maxHoldings: 3, maxStrategies: 1, monthlyDecisionReviews: 5, quantVerification: false, fullHistory: false, shadowSimulation: false },
  pro: { maxHoldings: 20, maxStrategies: 1, monthlyDecisionReviews: Infinity, quantVerification: true, fullHistory: true, shadowSimulation: false },
  strategy: { maxHoldings: 50, maxStrategies: 8, monthlyDecisionReviews: Infinity, quantVerification: true, fullHistory: true, shadowSimulation: true },
} as const;

export function createDemoContext(now = new Date()): { holdings: Record<string, { name: string; value: number; quantity?: number; costPrice?: number; portfolio?: string; updatedAt?: string; source?: "演示" }>; theses: InvestmentThesis[]; strategies: StrategyProfile[]; alerts: MonitoringAlert[] } {
  const iso = now.toISOString();
  const review = new Date(now); review.setDate(review.getDate() + 7);
  const strategy = createStrategy("基本面长期持有", iso);
  const thesis: InvestmentThesis = { id: `thesis-600183-${iso}`, stockCode: "600183", title: "订单增长需要现金流验证", originalStatement: "覆铜板需求增长会带动收入，但要看到经营现金流同步改善。", confirmedFacts: ["最近一期利润变化可由正式披露核实"], externalClaims: ["市场讨论提到海外订单增长"], userInferences: ["订单增长最终应反映在收入和现金流"], supportingEvidence: [], contradictingEvidence: [], openQuestions: ["下一期经营现金流是否改善"], invalidationConditions: ["下一期经营现金流没有改善"], horizon: "3个月", nextReviewAt: review.toISOString(), status: "失效条件可能触发", createdAt: iso, updatedAt: iso };
  return {
    holdings: { "600183": { name: "生益科技", value: 70000, quantity: 2000, costPrice: 28.5, portfolio: "长期组合", updatedAt: iso, source: "演示" }, "600036": { name: "招商银行", value: 45000, portfolio: "长期组合", updatedAt: iso, source: "演示" }, "510300": { name: "沪深300ETF", value: 35000, portfolio: "核心配置", updatedAt: iso, source: "演示" } },
    theses: [thesis], strategies: [strategy],
    alerts: [{ id: `alert-600183-${iso}`, stockCode: "600183", thesisId: thesis.id, sourceType: "财务数据", source: "确定性演示资料", occurredAt: iso, title: "经营现金流变化需要重新核实", change: "演示财务数据未显示现金流与利润同步改善", relation: "产生冲突", matchedRule: thesis.invalidationConditions[0], severity: "需要处理", status: "待处理" }],
  };
}
