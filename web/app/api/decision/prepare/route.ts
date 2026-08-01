import { NextResponse } from "next/server";
import { GET as readEvidenceRoute } from "../../evidence/[code]/route";
import { POST as forecastAssetRoute } from "../projection/route";
import { callAIProviderWithFallback, readProviderState } from "../../../lib/ai-provider-catalog";
import { buildAssetProjection, type AssetProjection } from "../../../lib/decision-asset-projection";
import { DECISION_KNOWLEDGE_VECTOR_METHOD, searchDecisionKnowledge } from "../../../lib/decision-knowledge-rag";
import {
  analyzeDecisionReasonLocally,
  DECISION_VALIDATION_OUTPUT_VERSION,
  parseDecisionAIOutput,
  validateDecisionValidationInput,
  type DecisionEvidencePayload,
  type DecisionValidationOutput,
} from "../../../lib/decision-validation-contract";
import { aggregateReliability, reliability, type ReliabilityState } from "../../../lib/failure-control";

const completed = (message: string, mode: "healthy" | "degraded" = "healthy") => reliability({
  status: mode,
  message,
  last_success_at: new Date().toISOString(),
  allow_signal: false,
});

const tradeAction = (action: string) => ({ "买入": "buy", "补仓": "add", "卖出": "sell", "继续观察": "watch" }[action] ?? action);

export async function POST(request: Request) {
  try {
    const input = validateDecisionValidationInput(await request.json());
    const isEnglish = input.context.locale === "en";
    const t = (zh: string, en: string) => isEnglish ? en : zh;
    const taskId = `decision_${crypto.randomUUID().replaceAll("-", "").slice(0, 14)}`;
    const createdAt = new Date().toISOString();
    const warnings: string[] = [];
    let provider = t("本地规则", "Local rules");
    let model = "decision-rules-v1";
    let plannerMode: DecisionValidationOutput["planner_mode"] = "local_fallback";
    let analysis = analyzeDecisionReasonLocally(input.plan.reason, input.context.locale);
    let modelReliability: ReliabilityState = completed(t("理由由本地规则整理", "The rationale was structured by local rules"), "degraded");

    try {
      const state = await readProviderState();
      const result = await callAIProviderWithFallback(state.providers.filter((item) => item.capabilities.preTradeCheck), [
        {
          role: "system",
          content: [
            t("你是 Decision Validation 编排器，不是投顾。只返回 JSON，不写额外文字。", "You orchestrate Decision Validation and do not provide investment advice. Return JSON only, with no extra text."),
            t("claims 只能逐字摘取用户原话，不能添加事实。type 只能是 observable_fact、unverified_external_claim、prediction_or_inference、emotion_or_motivation。", "Claims must quote the user's wording exactly and must not add facts. Type must be observable_fact, unverified_external_claim, prediction_or_inference, or emotion_or_motivation."),
            t("suggested_invalidation 只能是待用户确认的可核实条件，不能给出买卖建议、目标价或保证。", "suggested_invalidation must be a verifiable condition for user confirmation. Do not provide trading advice, target prices, or guarantees."),
            isEnglish ? "summary, source_hint, urgency, and suggested_invalidation must use English. claims.text must preserve the user's original wording." : "所有面向用户的字段必须使用简体中文。",
            t('输出：{"summary":"","claims":[{"text":"","type":""}],"source_hint":"","urgency":"","suggested_invalidation":""}', 'Output: {"summary":"","claims":[{"text":"","type":""}],"source_hint":"","urgency":"","suggested_invalidation":""}'),
          ].join("\n"),
        },
        { role: "user", content: JSON.stringify({ plan: input.plan, context: input.context }) },
      ], 800);
      analysis = parseDecisionAIOutput(result.content, input.plan.reason, input.context.locale);
      provider = result.provider;
      model = result.model;
      plannerMode = "provider";
      modelReliability = completed(t(`已使用 ${provider} 整理理由`, `The rationale was structured with ${provider}`));
    } catch (error) {
      warnings.push(t(`AI 编排暂不可用，已使用本地规则：${error instanceof Error ? error.message : "未知错误"}`, "AI orchestration was unavailable; local rules were used."));
    }

    const knowledgeHits = searchDecisionKnowledge(`${input.plan.reason} ${input.plan.action} ${input.plan.horizon}`, 3);
    const knowledgeReliability = completed(t(`受控风险知识库返回 ${knowledgeHits.length} 条说明`, `The controlled risk library returned ${knowledgeHits.length} item(s)`), knowledgeHits.length ? "healthy" : "degraded");

    let evidence: DecisionEvidencePayload | undefined;
    let evidenceReliability = completed(t("原话没有可检索内容", "The rationale contained no retrievable content"), "degraded");
    try {
      const response = await readEvidenceRoute(
        new Request(`http://internal/api/evidence/${input.plan.code}?reason=${encodeURIComponent(input.plan.reason)}`),
        { params: Promise.resolve({ code: input.plan.code }) },
      );
      if (!response.ok) throw new Error(`公告检索返回 ${response.status}`);
      evidence = await response.json() as DecisionEvidencePayload;
      evidenceReliability = evidence.reliability ?? completed("公开资料检索完成");
    } catch (error) {
      warnings.push(t(`公开资料检索暂不可用：${error instanceof Error ? error.message : "未知错误"}`, "Public-evidence retrieval is temporarily unavailable."));
      evidenceReliability = reliability({ status: "unavailable", message: t("公开资料检索暂不可用", "Public-evidence retrieval is temporarily unavailable"), error_code: "DECISION_EVIDENCE_UNAVAILABLE", retryable: true, allow_signal: false });
    }

    let projection: AssetProjection;
    let projectionReliability: ReliabilityState;
    try {
      const response = await forecastAssetRoute(new Request("http://internal/api/decision/projection", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          schema_version: "asset_forecast.input.v1",
          asset: { code: input.plan.code, name: input.plan.name, base_value: input.plan.projected_holding },
          decision: { action: input.plan.action, horizon: input.plan.horizon, reason: input.plan.reason },
          evidence_context: evidence,
          locale: input.context.locale === "en" ? "en" : "zh-CN",
        }),
      }));
      if (!response.ok) throw new Error(`预测服务返回 ${response.status}`);
      projection = await response.json() as AssetProjection;
      projectionReliability = completed(
        projection.mode === "ai_rag"
          ? t("公开资料预测与 K 线技术预测均已通过专用 JSON 校验", "Both public-evidence and technical forecasts passed dedicated JSON validation")
          : projection.mode === "partial_ai_rag"
            ? t("一个预测通道已通过 AI JSON 校验，另一个使用受限降级情景", "One forecast channel passed AI JSON validation; the other uses bounded fallback scenarios")
            : t("AI 预测已降级为受限情景", "AI forecasting fell back to bounded scenarios"),
        projection.mode === "ai_rag" ? "healthy" : "degraded",
      );
      if (projection.warning) warnings.push(projection.warning);
    } catch (error) {
      projection = buildAssetProjection(input.plan.projected_holding, undefined, {
        warning: error instanceof Error ? t(`预测服务不可用：${error.message}`, "The forecast service is unavailable") : t("预测服务不可用", "The forecast service is unavailable"),
        locale: input.context.locale === "en" ? "en" : "zh-CN",
      });
      projectionReliability = completed(t("预测服务不可用，已使用受限降级情景", "The forecast service is unavailable; bounded fallback scenarios were used"), "degraded");
      warnings.push(projection.warning ?? t("预测服务不可用", "The forecast service is unavailable"));
    }
    const sources: DecisionValidationOutput["sources"] = [
      { source_id: "user_input", status: "available", label: t("本次用户原话", "User wording") },
      { source_id: "decision_risk_knowledge", status: knowledgeHits.length ? "available" : "missing", label: t("受控风险知识库", "Controlled decision-risk library") },
      { source_id: "exchange_announcement", status: evidence ? "available" : "unavailable", label: t("交易所与公司公告", "Exchange and company disclosures") },
      { source_id: "ai_provider", status: plannerMode === "provider" ? "available" : "unavailable", label: provider },
      { source_id: "market_history", status: projection.dataSnapshot.market ? "available" : "unavailable", label: t("近 260 日日线", "260 daily bars") },
      { source_id: "financial_report", status: projection.dataSnapshot.financial ? "available" : "unavailable", label: t("公开财务报表", "Public financial statements") },
    ];
    const toolCalls: DecisionValidationOutput["tool_calls"] = [
      { tool_id: "structure_decision_reason", status: "completed", input: { reason: input.plan.reason }, output: analysis, sources: [sources[0], sources[3]], reliability: modelReliability },
      { tool_id: "retrieve_decision_knowledge", status: "completed", input: { query: input.plan.reason, limit: 3 }, output: { hits: knowledgeHits, vector_method: DECISION_KNOWLEDGE_VECTOR_METHOD }, sources: [sources[1]], reliability: knowledgeReliability },
      { tool_id: "verify_public_evidence", status: evidence ? "completed" : "failed", input: { code: input.plan.code, reason: input.plan.reason }, output: evidence ?? null, sources: [sources[2]], reliability: evidenceReliability },
      { tool_id: "project_asset_paths", status: "completed", input: { base_value: input.plan.projected_holding, months: [1, 3, 6, 12], evidence_basis: projection.evidenceBasis, channels: ["evidence", "technical"] }, output: projection, sources: [sources[0], sources[2], sources[3], sources[4], sources[5]], reliability: projectionReliability },
    ];
    const overall = aggregateReliability([modelReliability, knowledgeReliability, evidenceReliability, projectionReliability], t("Decision Validation 编排完成", "Decision Validation orchestration completed"));
    const steps = [
      { id: "step_1", title: t("整理用户原话", "Structure user wording"), tool: "structure_decision_reason", status: "completed" as const, requires_confirmation: false },
      { id: "step_2", title: t("检索受控风险知识", "Retrieve controlled risk knowledge"), tool: "retrieve_decision_knowledge", status: "completed" as const, requires_confirmation: false },
      { id: "step_3", title: t("核对公开资料", "Verify public evidence"), tool: "verify_public_evidence", status: evidence ? "completed" as const : "failed" as const, requires_confirmation: false },
      { id: "step_4", title: t("生成资产情景路径", "Generate asset scenario paths"), tool: "project_asset_paths", status: "completed" as const, requires_confirmation: false },
    ];
    const output: DecisionValidationOutput = {
      schema_version: DECISION_VALIDATION_OUTPUT_VERSION,
      type: "decision_validation_review",
      task_id: taskId,
      status: evidence ? "awaiting_confirmation" : "degraded",
      created_at: createdAt,
      provider,
      model,
      planner_mode: plannerMode,
      plan: { task_id: taskId, goal: t(`复核 ${input.plan.name} ${input.plan.action}计划`, `Review the ${tradeAction(input.plan.action)} plan for ${input.plan.name}`), steps, requires_confirmation: true },
      tool_calls: toolCalls,
      result: {
        reason_analysis: analysis,
        knowledge: { hits: knowledgeHits, vector_method: DECISION_KNOWLEDGE_VECTOR_METHOD },
        evidence,
        asset_projection: projection,
        suggested_invalidation: analysis.suggested_invalidation,
      },
      sources,
      warnings,
      requires_confirmation: true,
      reliability: overall,
    };
    return NextResponse.json(output);
  } catch (error) {
    return NextResponse.json({
      schema_version: DECISION_VALIDATION_OUTPUT_VERSION,
      type: "decision_validation_error",
      status: "invalid",
      message: error instanceof Error ? error.message : "无法准备决策复核",
    }, { status: 400 });
  }
}
