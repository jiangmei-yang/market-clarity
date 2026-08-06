import type { AssetForecastKnowledgeHit } from "./asset-forecast-rag";

export const ASSET_FORECAST_INPUT_VERSION = "asset_forecast.input.v1" as const;
export const ASSET_FORECAST_OUTPUT_VERSION = "asset_forecast.output.v1" as const;
export const ASSET_PROJECTION_MONTHS = [1, 3, 6, 12] as const;

export type AssetForecastMode = "ai_rag" | "partial_ai_rag" | "rules";
export type AssetForecastInput = {
  schema_version: typeof ASSET_FORECAST_INPUT_VERSION;
  locale?: "zh-CN" | "en";
  asset: {
    code: string;
    name: string;
    base_value: number;
  };
  decision: {
    action: string;
    horizon: string;
    reason: string;
  };
  evidence_context?: {
    assessment?: { status?: string; summary?: string };
    feed?: { updated_at?: string; items?: Array<{ published_at?: string; title?: string; source?: string; relation?: string }> };
    reliability?: { status?: string };
  };
};

export type AssetForecastSource = {
  source_id: string;
  label: string;
  status: "available" | "stale" | "unavailable";
  as_of?: string;
};

export type AssetForecastPointInput = {
  month: number;
  cumulative_return_pct: number;
};

export type AssetForecastScenarioInput = {
  key: "downside" | "base" | "upside";
  probability_pct: number;
  rationale: string;
  source_refs: string[];
  points: AssetForecastPointInput[];
};

export type AssetForecastSection = {
  summary: string;
  confidence_score: number;
  confidence_reason: string;
  scenarios: AssetForecastScenarioInput[];
  drivers: string[];
  risks: string[];
  invalidation_signals: string[];
};

export type AssetProjectionPoint = {
  month: number;
  value: number;
  change: number;
  changePct: number;
};

export type AssetProjectionPath = {
  key: "downside" | "flat" | "upside";
  label: string;
  annualReturnPct: number;
  probabilityPct: number;
  rationale: string;
  sourceRefs: string[];
  points: AssetProjectionPoint[];
};

export type AssetForecastView = {
  mode: "ai_rag" | "rules";
  summary: string;
  confidence: {
    score: number;
    label: "low" | "medium" | "high";
    reason: string;
  };
  paths: AssetProjectionPath[];
  drivers: string[];
  risks: string[];
  invalidationSignals: string[];
};

export type AssetForecastDataSnapshot = {
  market?: {
    as_of?: string;
    source?: string;
    last_price?: number;
    return_20d_pct?: number;
    return_60d_pct?: number;
    return_120d_pct?: number;
    volatility_60d_annualized_pct?: number;
    max_drawdown_250d_pct?: number;
    vs_ma20_pct?: number;
    vs_ma60_pct?: number;
    atr_14d_pct?: number;
    volume_ratio_20d?: number;
    range_position_20d_pct?: number;
    positive_sessions_20d_pct?: number;
    latest_body_pct?: number;
    latest_upper_shadow_pct?: number;
    latest_lower_shadow_pct?: number;
  };
  financial?: {
    report_date?: string;
    revenue_yoy_pct?: number | null;
    profit_yoy_pct?: number | null;
    cash_conversion?: number | null;
    debt_ratio_pct?: number | null;
    checks?: Array<{ title: string; state: string; finding: string; evidence: string }>;
  };
  evidence?: {
    status?: string;
    summary?: string;
    items?: Array<{ published_at: string; title: string; source: string; relation: string }>;
  };
};

export type AssetProjection = {
  schema_version: typeof ASSET_FORECAST_OUTPUT_VERSION;
  forecast_id: string;
  generated_at: string;
  mode: AssetForecastMode;
  provider: string;
  model: string;
  baseValue: number;
  basis: string;
  summary: string;
  confidence: {
    score: number;
    label: "low" | "medium" | "high";
    reason: string;
  };
  paths: AssetProjectionPath[];
  drivers: string[];
  risks: string[];
  invalidationSignals: string[];
  dataSnapshot: AssetForecastDataSnapshot;
  knowledge: {
    hits: AssetForecastKnowledgeHit[];
    vector_method: Record<string, unknown>;
  };
  evidenceBasis: "provided_previous_step" | "retrieved_in_forecast" | "unavailable";
  forecasts: {
    evidence: AssetForecastView;
    technical: AssetForecastView;
  };
  quality: {
    status: "passed" | "degraded";
    checks: {
      evidence_probability_total: number;
      technical_probability_total: number;
      source_isolation: boolean;
      required_horizons: boolean;
      paths_distinct: boolean;
      channel_modes: {
        evidence: AssetForecastView["mode"];
        technical: AssetForecastView["mode"];
      };
    };
  };
  sources: AssetForecastSource[];
  disclaimer: string;
  warning?: string;
};

export const DEFAULT_ASSET_SCENARIOS: AssetForecastScenarioInput[] = [
  {
    key: "downside",
    probability_pct: 30,
    rationale: "资料不足时采用逐期限扩大的压力路径",
    source_refs: ["fallback_method"],
    points: [
      { month: 1, cumulative_return_pct: -4 },
      { month: 3, cumulative_return_pct: -9 },
      { month: 6, cumulative_return_pct: -15 },
      { month: 12, cumulative_return_pct: -24 },
    ],
  },
  {
    key: "base",
    probability_pct: 45,
    rationale: "资料不足时采用接近持平的基准路径",
    source_refs: ["fallback_method"],
    points: [
      { month: 1, cumulative_return_pct: 0 },
      { month: 3, cumulative_return_pct: 1 },
      { month: 6, cumulative_return_pct: 2 },
      { month: 12, cumulative_return_pct: 4 },
    ],
  },
  {
    key: "upside",
    probability_pct: 25,
    rationale: "资料不足时采用逐期限扩大的改善路径",
    source_refs: ["fallback_method"],
    points: [
      { month: 1, cumulative_return_pct: 3 },
      { month: 3, cumulative_return_pct: 7 },
      { month: 6, cumulative_return_pct: 14 },
      { month: 12, cumulative_return_pct: 25 },
    ],
  },
];

const ENGLISH_DEFAULT_ASSET_SCENARIOS: AssetForecastScenarioInput[] = DEFAULT_ASSET_SCENARIOS.map((scenario) => ({
  ...scenario,
  rationale: {
    downside: "A widening stress path is used when evidence is insufficient",
    base: "A near-flat base path is used when evidence is insufficient",
    upside: "A widening improvement path is used when evidence is insufficient",
  }[scenario.key],
  points: scenario.points.map((point) => ({ ...point })),
}));

const roundMoney = (value: number) => Math.round(value * 100) / 100;
const roundPercent = (value: number) => Math.round(value * 100) / 100;
const boundedString = (value: unknown, maximum: number) => typeof value === "string" ? value.trim().slice(0, maximum) : "";

export function validateAssetForecastInput(value: unknown): AssetForecastInput {
  if (!value || typeof value !== "object") throw new Error("预测请求必须是 JSON 对象");
  const input = value as Partial<AssetForecastInput>;
  const t = (zh: string, en: string) => input.locale === "en" ? en : zh;
  if (input.schema_version !== ASSET_FORECAST_INPUT_VERSION) throw new Error(t("不支持的资产预测输入版本", "Unsupported asset-forecast input version"));
  if (!input.asset || !/^\d{6}$/.test(input.asset.code ?? "")) throw new Error(t("资产代码必须是 6 位 A 股代码", "The asset code must be a six-digit A-share code"));
  if (typeof input.asset.name !== "string" || !input.asset.name.trim() || input.asset.name.length > 80) throw new Error(t("资产名称无效", "Invalid asset name"));
  if (!Number.isFinite(input.asset.base_value) || Number(input.asset.base_value) < 0 || Number(input.asset.base_value) > 1_000_000_000) throw new Error(t("操作后持仓金额无效", "Invalid post-plan position value"));
  if (!input.decision || typeof input.decision.reason !== "string" || input.decision.reason.trim().length < 6 || input.decision.reason.length > 2000) throw new Error(t("请提供可用于预测的决策理由", "Provide a decision rationale for forecasting"));
  if (!["买入", "补仓", "卖出", "继续观察"].includes(input.decision.action ?? "")) throw new Error(t("不支持的预测操作类型", "Unsupported forecast action"));
  if (!["1周", "1个月", "3个月", "6个月", "12个月"].includes(input.decision.horizon ?? "")) throw new Error(t("预测观察期限无效", "Invalid forecast horizon"));
  return input as AssetForecastInput;
}

function extractJSONObject(content: string) {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("模型未返回 JSON 对象");
  return JSON.parse(content.slice(start, end + 1)) as Record<string, unknown>;
}

function parseForecastSection(
  value: unknown,
  allowedSourceRefs: Set<string>,
  requiredSourceRef: string | undefined,
  label: string,
  forbiddenContent?: RegExp,
) {
  if (!value || typeof value !== "object") throw new Error(`模型缺少${label}`);
  const parsed = value as Record<string, unknown>;
  const summary = boundedString(parsed.summary, 360);
  const confidenceReason = boundedString(parsed.confidence_reason, 280);
  const confidenceScore = Number(parsed.confidence_score);
  if (!summary || !confidenceReason || !Number.isFinite(confidenceScore) || confidenceScore < 0 || confidenceScore > 100) throw new Error("模型置信度格式无效");

  const rawScenarios = Array.isArray(parsed.scenarios) ? parsed.scenarios as Array<Record<string, unknown>> : [];
  if (rawScenarios.length !== 3) throw new Error("模型必须返回三个预测情景");
  let scenarios = (["downside", "base", "upside"] as const).map((key) => {
    const raw = rawScenarios.find((item) => item.key === key);
    if (!raw) throw new Error(`模型缺少 ${key} 情景`);
    const probability = Number(raw.probability_pct);
    const rationale = boundedString(raw.rationale, 240);
    const refs = Array.isArray(raw.source_refs) ? raw.source_refs.map((item) => boundedString(item, 100)).filter(Boolean).slice(0, 8) : [];
    if (!Number.isFinite(probability) || probability < 0 || probability > 100 || !rationale || !refs.length || refs.some((ref) => !allowedSourceRefs.has(ref))) throw new Error(`${key} 情景字段或来源引用无效`);
    const rawPoints = Array.isArray(raw.points) ? raw.points as Array<Record<string, unknown>> : [];
    const points = ASSET_PROJECTION_MONTHS.map((month) => {
      const point = rawPoints.find((item) => Number(item.month) === month);
      const cumulative = Number(point?.cumulative_return_pct);
      if (!Number.isFinite(cumulative) || cumulative < -100 || cumulative > 200) throw new Error(`${key} 的 ${month} 月预测超出范围`);
      return { month, cumulative_return_pct: roundPercent(cumulative) };
    });
    return { key, probability_pct: roundPercent(probability), rationale, source_refs: refs, points };
  });
  const probabilityTotal = scenarios.reduce((sum, item) => sum + item.probability_pct, 0);
  if (Math.abs(probabilityTotal - 100) > 0.5) throw new Error("三个情景概率之和必须为 100");
  if (requiredSourceRef) {
    if (!allowedSourceRefs.has(requiredSourceRef)) throw new Error(`${label}的必需来源不可用`);
    scenarios = scenarios.map((scenario) => scenario.source_refs.includes(requiredSourceRef)
      ? scenario
      : { ...scenario, source_refs: [...scenario.source_refs, requiredSourceRef] });
  }
  for (const month of ASSET_PROJECTION_MONTHS) {
    const values = scenarios.map((scenario) => scenario.points.find((point) => point.month === month)!.cumulative_return_pct);
    if (!(values[0] <= values[1] && values[1] <= values[2])) throw new Error(`${month} 月情景排序无效`);
  }
  const strings = (key: string) => Array.isArray(parsed[key])
    ? (parsed[key] as unknown[]).map((item) => boundedString(item, 180)).filter(Boolean).slice(0, 6)
    : [];
  const drivers = strings("drivers");
  const risks = strings("risks");
  const invalidationSignals = strings("invalidation_signals");
  const sectionText = [
    summary,
    confidenceReason,
    ...scenarios.flatMap((scenario) => [scenario.rationale]),
    ...drivers,
    ...risks,
    ...invalidationSignals,
  ].join(" ");
  if (forbiddenContent?.test(sectionText)) throw new Error(`${label}包含另一通道信息或无数据支持的推断`);
  return {
    summary,
    confidence_score: roundPercent(confidenceScore),
    confidence_reason: confidenceReason,
    scenarios,
    drivers,
    risks,
    invalidation_signals: invalidationSignals,
  };
}

export function parseAssetForecastAIOutput(
  content: string,
  allowedSourceRefs: { evidence: Set<string>; technical: Set<string> },
  requirements: { evidence?: string; technical?: string } = {},
) {
  const parsed = extractJSONObject(content);
  return {
    evidence: parseForecastSection(parsed.evidence_forecast, allowedSourceRefs.evidence, requirements.evidence, "公开资料预测", /K\s*线|均线|ATR|波动率|回撤|成交量|蜡烛|技术面/i),
    technical: parseForecastSection(parsed.technical_forecast, allowedSourceRefs.technical, requirements.technical, "K 线技术预测", /(?:公告|财报)(?:显示|表明|确认)|(?:现金流|利润|订单)(?:改善|恶化|增长|下降)|资金(?:持续)?(?:流入|流出)|主力(?:买入|卖出|流入|流出)/i),
  };
}

export function parseAssetForecastSection(
  content: string,
  allowedSourceRefs: Set<string>,
  requiredSourceRef: string | undefined,
  label: string,
  forbiddenContent?: RegExp,
) {
  return parseForecastSection(extractJSONObject(content), allowedSourceRefs, requiredSourceRef, label, forbiddenContent);
}

export function validateAssetForecastLanguage<T extends AssetForecastSection>(forecast: T, locale?: "zh-CN" | "en") {
  if (locale !== "en") return forecast;
  const userFacingText = [
    forecast.summary,
    forecast.confidence_reason,
    ...forecast.scenarios.map((scenario) => scenario.rationale),
    ...forecast.drivers,
    ...forecast.risks,
    ...forecast.invalidation_signals,
  ];
  if (userFacingText.some((value) => /[\u3400-\u9fff]/.test(value))) throw new Error("AI returned non-English user-facing fields");
  return forecast;
}

function buildForecastView(
  baseValue: number,
  scenarios: AssetForecastScenarioInput[],
  content: {
    summary: string;
    confidenceScore: number;
    confidenceReason: string;
    drivers: string[];
    risks: string[];
    invalidationSignals: string[];
    mode: "ai_rag" | "rules";
    locale?: "zh-CN" | "en";
  },
): AssetForecastView {
  const labels = content.locale === "en"
    ? { downside: "Downside", base: "Base", upside: "Upside" } as const
    : { downside: "压力情景", base: "基准情景", upside: "改善情景" } as const;
  const paths = scenarios.map((scenario) => {
    const points = ASSET_PROJECTION_MONTHS.map((month) => {
      const input = scenario.points.find((point) => point.month === month);
      if (!input || !Number.isFinite(input.cumulative_return_pct) || input.cumulative_return_pct < -100 || input.cumulative_return_pct > 200) throw new Error("情景缺少有效的逐期限预测");
      const value = baseValue * (1 + input.cumulative_return_pct / 100);
      return { month, value: roundMoney(value), change: roundMoney(value - baseValue), changePct: roundPercent(input.cumulative_return_pct) };
    });
    return {
      key: scenario.key === "base" ? "flat" as const : scenario.key,
      label: labels[scenario.key],
      annualReturnPct: points.find((point) => point.month === 12)?.changePct ?? 0,
      probabilityPct: scenario.probability_pct,
      rationale: scenario.rationale,
      sourceRefs: scenario.source_refs,
      points,
    };
  });
  const score = Math.max(0, Math.min(100, content.confidenceScore));
  return {
    mode: content.mode,
    summary: content.summary,
    confidence: {
      score,
      label: score >= 70 ? "high" : score >= 40 ? "medium" : "low",
      reason: content.confidenceReason,
    },
    paths,
    drivers: content.drivers,
    risks: content.risks,
    invalidationSignals: content.invalidationSignals,
  };
}

export function buildAssetProjection(
  baseValue: number,
  scenarios: AssetForecastScenarioInput[] = DEFAULT_ASSET_SCENARIOS,
  metadata: {
    mode?: AssetForecastMode;
    provider?: string;
    model?: string;
    summary?: string;
    confidenceScore?: number;
    confidenceReason?: string;
    drivers?: string[];
    risks?: string[];
    invalidationSignals?: string[];
    evidenceMode?: "ai_rag" | "rules";
    dataSnapshot?: AssetForecastDataSnapshot;
    knowledgeHits?: AssetForecastKnowledgeHit[];
    vectorMethod?: Record<string, unknown>;
    sources?: AssetForecastSource[];
    evidenceBasis?: AssetProjection["evidenceBasis"];
    technicalForecast?: {
      scenarios: AssetForecastScenarioInput[];
      summary: string;
      confidenceScore: number;
      confidenceReason: string;
      drivers: string[];
      risks: string[];
      invalidationSignals: string[];
      mode?: "ai_rag" | "rules";
    };
    warning?: string;
    locale?: "zh-CN" | "en";
  } = {},
): AssetProjection {
  const isEnglish = metadata.locale === "en";
  const t = (zh: string, en: string) => isEnglish ? en : zh;
  const localizedScenarios = isEnglish && scenarios === DEFAULT_ASSET_SCENARIOS ? ENGLISH_DEFAULT_ASSET_SCENARIOS : scenarios;
  if (!Number.isFinite(baseValue) || baseValue < 0) throw new Error("操作后金额必须是非负有限数值");
  if (scenarios.length !== 3) throw new Error("资产路径必须包含三个情景");
  const evidenceView = buildForecastView(baseValue, localizedScenarios, {
    summary: metadata.summary ?? t("实时资料或 AI 暂不可用，当前仅显示受限的降级情景。", "Live sources or AI are unavailable; only bounded fallback scenarios are shown."),
    confidenceScore: metadata.confidenceScore ?? 20,
    confidenceReason: metadata.confidenceReason ?? t("缺少足够的实时资料或有效模型输出", "Insufficient live evidence or validated model output"),
    drivers: metadata.drivers ?? [],
    risks: metadata.risks ?? [t("个股未来收益具有较高不确定性", "Future single-stock returns are highly uncertain")],
    invalidationSignals: metadata.invalidationSignals ?? [t("取得新的正式披露或财务数据后重新生成", "Regenerate after new formal disclosures or financial data")],
    mode: metadata.evidenceMode ?? (metadata.mode === "ai_rag" ? "ai_rag" : "rules"),
    locale: metadata.locale,
  });
  const technical = metadata.technicalForecast;
  const technicalScenarios = technical?.scenarios ?? (isEnglish ? ENGLISH_DEFAULT_ASSET_SCENARIOS : DEFAULT_ASSET_SCENARIOS);
  const technicalView = buildForecastView(baseValue, technicalScenarios, {
    summary: technical?.summary ?? t("K 线资料或 AI 暂不可用，当前仅显示受限的降级情景。", "Price history or AI is unavailable; only bounded fallback scenarios are shown."),
    confidenceScore: technical?.confidenceScore ?? 15,
    confidenceReason: technical?.confidenceReason ?? t("没有通过校验的技术预测输出", "No validated technical forecast output"),
    drivers: technical?.drivers ?? [],
    risks: technical?.risks ?? [t("历史价格形态可能随时失效", "Historical price patterns may fail at any time")],
    invalidationSignals: technical?.invalidationSignals ?? [t("价格突破当前波动区间后重新生成", "Regenerate after price leaves the current range")],
    mode: technical?.mode ?? (metadata.mode === "ai_rag" ? "ai_rag" : "rules"),
    locale: metadata.locale,
  });
  const evidenceRefs = new Set(evidenceView.paths.flatMap((path) => path.sourceRefs));
  const technicalRefs = new Set(technicalView.paths.flatMap((path) => path.sourceRefs));
  const evidenceForbidden = ["market_history", "forecast_price_regime"];
  const technicalForbidden = ["formal_disclosures", "financial_report", "user_thesis", "forecast_disclosure_quality", "forecast_financial_quality"];
  const sourceIsolation = evidenceForbidden.every((ref) => !evidenceRefs.has(ref)) && technicalForbidden.every((ref) => !technicalRefs.has(ref));
  const requiredHorizons = [...evidenceView.paths, ...technicalView.paths]
    .every((path) => ASSET_PROJECTION_MONTHS.every((month) => path.points.some((point) => point.month === month)));
  const evidenceProbabilityTotal = roundPercent(evidenceView.paths.reduce((sum, path) => sum + path.probabilityPct, 0));
  const technicalProbabilityTotal = roundPercent(technicalView.paths.reduce((sum, path) => sum + path.probabilityPct, 0));
  const pathsDistinct = JSON.stringify(evidenceView.paths.map((path) => path.points.map((point) => point.changePct)))
    !== JSON.stringify(technicalView.paths.map((path) => path.points.map((point) => point.changePct)));
  const qualityPassed = metadata.mode === "ai_rag"
    && sourceIsolation
    && requiredHorizons
    && Math.abs(evidenceProbabilityTotal - 100) <= 0.5
    && Math.abs(technicalProbabilityTotal - 100) <= 0.5
    && pathsDistinct;
  return {
    schema_version: ASSET_FORECAST_OUTPUT_VERSION,
    forecast_id: `forecast_${crypto.randomUUID().replaceAll("-", "").slice(0, 14)}`,
    generated_at: new Date().toISOString(),
    mode: metadata.mode ?? "rules",
    provider: metadata.provider ?? t("本地规则", "Local rules"),
    model: metadata.model ?? "bounded-path-fallback-v1",
    baseValue: roundMoney(baseValue),
    basis: t("操作后单股持仓金额", "Post-plan single-stock position value"),
    summary: evidenceView.summary,
    confidence: evidenceView.confidence,
    paths: evidenceView.paths,
    drivers: evidenceView.drivers,
    risks: evidenceView.risks,
    invalidationSignals: evidenceView.invalidationSignals,
    dataSnapshot: metadata.dataSnapshot ?? {},
    knowledge: { hits: metadata.knowledgeHits ?? [], vector_method: metadata.vectorMethod ?? {} },
    evidenceBasis: metadata.evidenceBasis ?? "unavailable",
    forecasts: { evidence: evidenceView, technical: technicalView },
    quality: {
      status: qualityPassed ? "passed" : "degraded",
      checks: {
        evidence_probability_total: evidenceProbabilityTotal,
        technical_probability_total: technicalProbabilityTotal,
        source_isolation: sourceIsolation,
        required_horizons: requiredHorizons,
        paths_distinct: pathsDistinct,
        channel_modes: { evidence: evidenceView.mode, technical: technicalView.mode },
      },
    },
    sources: metadata.sources ?? [],
    disclaimer: t("这是基于当前资料的 AI 条件情景，不是目标价、收益保证或投资建议。逐期限收益由模型提出并经程序校验，金额仅由程序换算。", "These AI-generated conditional scenarios use current data. They are not target prices, return guarantees, or investment advice. Model-proposed returns are validated in code; values are calculated deterministically."),
    ...(metadata.warning ? { warning: metadata.warning } : {}),
  };
}
