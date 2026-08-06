import type { AssetProjection } from "./decision-asset-projection";
import type { DecisionKnowledgeHit } from "./decision-knowledge-rag";
import type { ReliabilityState } from "./failure-control";

export const DECISION_VALIDATION_INPUT_VERSION = "decision_validation.input.v1" as const;
export const DECISION_VALIDATION_OUTPUT_VERSION = "decision_validation.output.v1" as const;

export type DecisionClaimType = "observable_fact" | "unverified_external_claim" | "prediction_or_inference" | "emotion_or_motivation";
export type DecisionClaim = {
  text: string;
  type: DecisionClaimType;
  verifiability: "verifiable" | "partially_verifiable" | "needs_source" | "not_directly_verifiable";
  required_evidence: string;
};

export type DecisionValidationInput = {
  schema_version: typeof DECISION_VALIDATION_INPUT_VERSION;
  request_id?: string;
  plan: {
    code: string;
    name: string;
    action: "买入" | "补仓" | "卖出" | "继续观察";
    amount: number;
    projected_holding: number;
    reason: string;
    horizon: string;
  };
  context: {
    portfolio_capital: number;
    current_holding: number;
    locale: string;
  };
};

export type DecisionReasonAnalysis = {
  summary: string;
  claims: DecisionClaim[];
  source_hint: string;
  urgency: string;
  suggested_invalidation: string;
  mode: "openai" | "rules";
};

export type DecisionEvidencePayload = {
  assessment?: { status: string; summary: string; mode: "rules" | "openai"; evidence_indices?: number[] };
  feed?: { items?: Array<{ published_at: string; title: string; summary: string; source: string; url: string; category: string; relation: string; corroborating_sources?: string[] }>; data_mode?: string; updated_at?: string; sources?: string[]; message?: string };
  radar?: { total: number; official_count: number; media_count: number; opinion_count: number; source_count: number; coverage: string; disclaimer: string };
  reliability?: ReliabilityState;
};

export type DecisionValidationOutput = {
  schema_version: typeof DECISION_VALIDATION_OUTPUT_VERSION;
  type: "decision_validation_review";
  task_id: string;
  status: "awaiting_confirmation" | "degraded";
  created_at: string;
  provider: string;
  model: string;
  planner_mode: "provider" | "local_fallback";
  plan: {
    task_id: string;
    goal: string;
    steps: Array<{ id: string; title: string; tool: string; status: "completed" | "failed"; requires_confirmation: boolean }>;
    requires_confirmation: true;
  };
  tool_calls: Array<{
    tool_id: string;
    status: "completed" | "failed";
    input: Record<string, unknown>;
    output: unknown;
    sources: Array<{ source_id: string; status: "available" | "missing" | "unavailable"; label: string }>;
    reliability: ReliabilityState;
  }>;
  result: {
    reason_analysis: DecisionReasonAnalysis;
    knowledge: { hits: DecisionKnowledgeHit[]; vector_method: Record<string, unknown> };
    evidence?: DecisionEvidencePayload;
    asset_projection: AssetProjection;
    suggested_invalidation: string;
  };
  sources: Array<{ source_id: string; status: "available" | "missing" | "unavailable"; label: string }>;
  warnings: string[];
  requires_confirmation: true;
  reliability: ReliabilityState;
};

const claimMetadata: Record<DecisionClaimType, Pick<DecisionClaim, "verifiability" | "required_evidence">> = {
  observable_fact: { verifiability: "partially_verifiable", required_evidence: "带日期的行情、公告或财务数据" },
  unverified_external_claim: { verifiability: "needs_source", required_evidence: "交易所公告、公司公告或正式定期报告" },
  prediction_or_inference: { verifiability: "not_directly_verifiable", required_evidence: "明确推断依据，并检查不同情景" },
  emotion_or_motivation: { verifiability: "not_directly_verifiable", required_evidence: "区分当前感受与可核实证据" },
};

const sentences = (text: string) => text.split(/[。！？；;，,\n]+/).map((item) => item.trim()).filter(Boolean).slice(0, 8);

function localClaimType(text: string): DecisionClaimType {
  if (/(朋友|听说|据说|网上|小红书|群里|消息|传闻|新闻|friend|heard|rumou?r|online|social media|news)/i.test(text)) return "unverified_external_claim";
  if (/(应该|肯定|必然|会涨|反弹|目标价|认为|预计|可能|should|certain|will rise|rebound|target price|I think|expect|may improve)/i.test(text)) return "prediction_or_inference";
  if (/(害怕|焦虑|后悔|回本|翻本|错过|冲动|担心|afraid|anxious|regret|break even|miss out|impulsive|worried)/i.test(text)) return "emotion_or_motivation";
  return "observable_fact";
}

const claim = (text: string, type: DecisionClaimType, locale = "zh-CN"): DecisionClaim => {
  const metadata = claimMetadata[type];
  if (locale !== "en") return { text, type, ...metadata };
  return {
    text,
    type,
    verifiability: metadata.verifiability,
    required_evidence: ({
      observable_fact: "Dated market data, disclosures, or financial data",
      unverified_external_claim: "Exchange filings, company disclosures, or formal periodic reports",
      prediction_or_inference: "Explicit reasoning and comparison across scenarios",
      emotion_or_motivation: "A clear separation between current feelings and verifiable evidence",
    } as Record<DecisionClaimType, string>)[type],
  };
};

export function analyzeDecisionReasonLocally(reason: string, locale = "zh-CN"): DecisionReasonAnalysis {
  const isEnglish = locale === "en";
  const claims = sentences(reason).map((text) => claim(text, localClaimType(text), locale));
  const external = claims.find((item) => item.type === "unverified_external_claim");
  const urgent = claims.find((item) => item.type === "emotion_or_motivation");
  return {
    summary: claims.length ? (isEnglish ? `The system structured the wording into ${claims.length} item(s); ${claims.filter((item) => item.type === "unverified_external_claim").length} require external-source verification.` : `系统将原话整理为 ${claims.length} 项，其中 ${claims.filter((item) => item.type === "unverified_external_claim").length} 项需要外部来源核实。`) : isEnglish ? "No usable rationale was provided." : "尚未取得可整理的理由。",
    claims,
    source_hint: external ? (isEnglish ? "The rationale contains an external claim; check original formal disclosures first" : "原话包含外部说法，优先核对法定披露原文") : isEnglish ? "No explicit external source was identified" : "未识别出明确外部来源",
    urgency: urgent?.text ?? (isEnglish ? "No clear urgency language was identified" : "未识别出明显紧迫性表达"),
    suggested_invalidation: isEnglish ? "If later formal disclosures do not support the core rationale, or public information clearly contradicts it, reassess the decision." : "如果核心理由未被后续正式披露支持，或公开信息与该理由明显相反，则重新评估本次判断。",
    mode: "rules",
  };
}

export function parseDecisionAIOutput(content: string, originalReason: string, locale = "zh-CN"): DecisionReasonAnalysis {
  const isEnglish = locale === "en";
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("模型未返回 JSON");
  const value = JSON.parse(content.slice(start, end + 1)) as Record<string, unknown>;
  const rawClaims = Array.isArray(value.claims) ? value.claims : [];
  if (!rawClaims.length || rawClaims.length > 8) throw new Error("模型理由拆解数量无效");
  const allowed = new Set<DecisionClaimType>(["observable_fact", "unverified_external_claim", "prediction_or_inference", "emotion_or_motivation"]);
  const claims = rawClaims.map((item) => {
    if (!item || typeof item !== "object") throw new Error("模型理由拆解格式无效");
    const raw = item as Record<string, unknown>;
    const text = typeof raw.text === "string" ? raw.text.trim().slice(0, 240) : "";
    const type = raw.type as DecisionClaimType;
    if (!text || !originalReason.includes(text) || !allowed.has(type)) throw new Error("模型添加了原话中不存在的内容");
    return claim(text, type, locale);
  });
  const bounded = (key: string, fallback: string, maximum = 240) => typeof value[key] === "string" && value[key] ? String(value[key]).trim().slice(0, maximum) : fallback;
  const invalidationCandidate = bounded("suggested_invalidation", "", 320);
  const conditionalInvalidation = /^(如果|若|一旦|当.+(?:时|则)|if\b|when\b|unless\b)/i.test(invalidationCandidate)
    || /(?:未能|没有|不再|低于|高于|恶化|相反).*(?:则|重新评估|失效)/.test(invalidationCandidate);
  const suggestedInvalidation = conditionalInvalidation
    ? invalidationCandidate
    : isEnglish ? "If later formal disclosures do not support the core rationale, or public information clearly contradicts it, reassess the decision." : "如果核心理由未被后续正式披露支持，或公开信息与该理由明显相反，则重新评估本次判断。";
  return {
    summary: bounded("summary", isEnglish ? `The system structured the wording into ${claims.length} item(s).` : `系统将原话整理为 ${claims.length} 项。`),
    claims,
    source_hint: bounded("source_hint", isEnglish ? "No explicit external source was identified" : "未识别出明确外部来源"),
    urgency: bounded("urgency", isEnglish ? "No clear urgency language was identified" : "未识别出明显紧迫性表达"),
    suggested_invalidation: suggestedInvalidation,
    mode: "openai",
  };
}

export function validateDecisionValidationInput(value: unknown): DecisionValidationInput {
  if (!value || typeof value !== "object") throw new Error("请求必须是 JSON 对象");
  const input = value as Partial<DecisionValidationInput>;
  if (input.schema_version !== DECISION_VALIDATION_INPUT_VERSION) throw new Error("不支持的 Decision Validation 输入版本");
  if (!input.plan || !/^\d{6}$/.test(input.plan.code ?? "")) throw new Error("请输入 6 位 A 股代码");
  if (typeof input.plan.name !== "string" || !input.plan.name.trim() || input.plan.name.length > 80) throw new Error("股票名称无效");
  if (!["买入", "补仓", "卖出", "继续观察"].includes(input.plan.action ?? "")) throw new Error("不支持的操作类型");
  if (!Number.isFinite(input.plan.amount) || Number(input.plan.amount) < 0 || Number(input.plan.amount) > 1_000_000_000) throw new Error("计划金额无效");
  if (!Number.isFinite(input.plan.projected_holding) || Number(input.plan.projected_holding) < 0 || Number(input.plan.projected_holding) > 1_000_000_000) throw new Error("操作后持仓无效");
  if (typeof input.plan.reason !== "string" || input.plan.reason.trim().length < 6 || input.plan.reason.length > 2000) throw new Error("请用一句话说明操作理由");
  if (typeof input.plan.horizon !== "string" || !["1周", "1个月", "3个月", "6个月", "12个月"].includes(input.plan.horizon)) throw new Error("观察期限无效");
  if (!input.context || !Number.isFinite(input.context.portfolio_capital) || Number(input.context.portfolio_capital) <= 0 || Number(input.context.portfolio_capital) > 10_000_000_000) throw new Error("组合资金无效");
  if (!Number.isFinite(input.context.current_holding) || Number(input.context.current_holding) < 0 || Number(input.context.current_holding) > 1_000_000_000) throw new Error("当前持仓无效");
  const expectedHolding = input.plan.action === "卖出"
    ? Math.max(0, Number(input.context.current_holding) - Number(input.plan.amount))
    : input.plan.action === "继续观察"
      ? Number(input.context.current_holding)
      : Number(input.context.current_holding) + Number(input.plan.amount);
  if (Math.abs(Number(input.plan.projected_holding) - expectedHolding) > 0.01) throw new Error("操作后持仓与当前持仓及计划金额不一致");
  return input as DecisionValidationInput;
}
