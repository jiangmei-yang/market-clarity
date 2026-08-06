import { NextResponse } from "next/server";
import { GET as readEvidenceRoute } from "../../evidence/[code]/route";
import { GET as readFinancialRoute } from "../../financial/[code]/route";
import { GET as readInformationRoute } from "../../information/[code]/route";
import { callAIProviderWithFallback, readProviderState } from "../../../lib/ai-provider-catalog";
import { ASSET_FORECAST_VECTOR_METHOD, searchAssetForecastKnowledge } from "../../../lib/asset-forecast-rag";
import {
  buildAssetProjection,
  DEFAULT_ASSET_SCENARIOS,
  parseAssetForecastSection,
  validateAssetForecastLanguage,
  validateAssetForecastInput,
  type AssetForecastDataSnapshot,
  type AssetForecastSource,
} from "../../../lib/decision-asset-projection";

type HistoryPoint = { date?: string; open?: number; close?: number; high?: number; low?: number; volume?: number };
type InformationPayload = {
  source?: string;
  provider?: string;
  data_timestamp?: string;
  quote?: { current_price?: number; update_time?: string };
  history?: { data?: HistoryPoint[]; source?: string };
  reliability?: { status?: string };
};
type FinancialPayload = {
  report_date?: string;
  headline?: {
    revenue_yoy?: number | null;
    profit_yoy?: number | null;
    cash_conversion?: number | null;
    debt_ratio?: number | null;
  };
  checks?: Array<{ title?: string; state?: string; finding?: string; evidence?: string }>;
  reliability?: { status?: string };
};
type EvidencePayload = {
  assessment?: { status?: string; summary?: string };
  feed?: { updated_at?: string; items?: Array<{ published_at?: string; title?: string; source?: string; relation?: string }> };
  reliability?: { status?: string };
};

const rounded = (value: number) => Number(value.toFixed(2));
const finite = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : undefined;
const sourceStatus = (status?: string): AssetForecastSource["status"] => status === "stale" ? "stale" : status === "unavailable" || status === "blocked" ? "unavailable" : "available";

function marketSnapshot(payload?: InformationPayload): AssetForecastDataSnapshot["market"] {
  const points = (payload?.history?.data ?? []).filter((item) => item.date && Number.isFinite(item.close) && Number(item.close) > 0).slice(-260);
  if (!points.length) return undefined;
  const closes = points.map((item) => Number(item.close));
  const latest = closes.at(-1)!;
  const returnFor = (days: number) => closes.length > days ? rounded((latest / closes.at(-(days + 1))! - 1) * 100) : undefined;
  const average = (days: number) => closes.length >= days ? closes.slice(-days).reduce((sum, item) => sum + item, 0) / days : undefined;
  const logReturns = closes.slice(-61).slice(1).map((item, index) => Math.log(item / closes.slice(-61)[index])).filter(Number.isFinite);
  const mean = logReturns.length ? logReturns.reduce((sum, item) => sum + item, 0) / logReturns.length : 0;
  const variance = logReturns.length > 1 ? logReturns.reduce((sum, item) => sum + (item - mean) ** 2, 0) / (logReturns.length - 1) : 0;
  let peak = closes[0];
  let maxDrawdown = 0;
  for (const close of closes) {
    peak = Math.max(peak, close);
    maxDrawdown = Math.min(maxDrawdown, close / peak - 1);
  }
  const ma20 = average(20);
  const ma60 = average(60);
  const latestPoint = points.at(-1)!;
  const latestOpen = finite(latestPoint.open);
  const latestHigh = finite(latestPoint.high);
  const latestLow = finite(latestPoint.low);
  const trueRanges = points.slice(-15).slice(1).map((point, index) => {
    const previousClose = Number(points.slice(-15)[index].close);
    const high = finite(point.high) ?? Number(point.close);
    const low = finite(point.low) ?? Number(point.close);
    return Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose));
  }).filter(Number.isFinite);
  const recent20 = points.slice(-20);
  const rangeHigh = Math.max(...recent20.map((point) => finite(point.high) ?? Number(point.close)));
  const rangeLow = Math.min(...recent20.map((point) => finite(point.low) ?? Number(point.close)));
  const priorVolumes = points.slice(-21, -1).map((point) => finite(point.volume)).filter((value): value is number => value !== undefined && value > 0);
  const averageVolume20 = priorVolumes.length ? priorVolumes.reduce((sum, value) => sum + value, 0) / priorVolumes.length : undefined;
  const latestVolume = finite(latestPoint.volume);
  const recentCloses = closes.slice(-21);
  const positiveSessions = recentCloses.slice(1).filter((close, index) => close > recentCloses[index]).length;
  const candleDenominator = latestOpen && latestOpen > 0 ? latestOpen : latest;
  return {
    as_of: payload?.data_timestamp ?? points.at(-1)?.date ?? payload?.quote?.update_time,
    source: payload?.history?.source ?? payload?.source ?? payload?.provider,
    last_price: rounded(finite(payload?.quote?.current_price) ?? latest),
    return_20d_pct: returnFor(20),
    return_60d_pct: returnFor(60),
    return_120d_pct: returnFor(120),
    volatility_60d_annualized_pct: logReturns.length > 1 ? rounded(Math.sqrt(variance) * Math.sqrt(250) * 100) : undefined,
    max_drawdown_250d_pct: rounded(maxDrawdown * 100),
    vs_ma20_pct: ma20 ? rounded((latest / ma20 - 1) * 100) : undefined,
    vs_ma60_pct: ma60 ? rounded((latest / ma60 - 1) * 100) : undefined,
    atr_14d_pct: trueRanges.length ? rounded(trueRanges.reduce((sum, value) => sum + value, 0) / trueRanges.length / latest * 100) : undefined,
    volume_ratio_20d: latestVolume && averageVolume20 ? rounded(latestVolume / averageVolume20) : undefined,
    range_position_20d_pct: rangeHigh > rangeLow ? rounded((latest - rangeLow) / (rangeHigh - rangeLow) * 100) : undefined,
    positive_sessions_20d_pct: recentCloses.length > 1 ? rounded(positiveSessions / (recentCloses.length - 1) * 100) : undefined,
    latest_body_pct: latestOpen ? rounded((latest - latestOpen) / candleDenominator * 100) : undefined,
    latest_upper_shadow_pct: latestHigh !== undefined ? rounded((latestHigh - Math.max(latestOpen ?? latest, latest)) / candleDenominator * 100) : undefined,
    latest_lower_shadow_pct: latestLow !== undefined ? rounded((Math.min(latestOpen ?? latest, latest) - latestLow) / candleDenominator * 100) : undefined,
  };
}

function financialSnapshot(payload?: FinancialPayload): AssetForecastDataSnapshot["financial"] {
  if (!payload?.headline && !payload?.checks?.length) return undefined;
  return {
    report_date: payload.report_date,
    revenue_yoy_pct: finite(payload.headline?.revenue_yoy) ?? null,
    profit_yoy_pct: finite(payload.headline?.profit_yoy) ?? null,
    cash_conversion: finite(payload.headline?.cash_conversion) ?? null,
    debt_ratio_pct: finite(payload.headline?.debt_ratio) ?? null,
    checks: (payload.checks ?? []).slice(0, 6).map((item) => ({
      title: String(item.title ?? ""),
      state: String(item.state ?? "unknown"),
      finding: String(item.finding ?? ""),
      evidence: String(item.evidence ?? ""),
    })),
  };
}

function evidenceSnapshot(payload?: EvidencePayload): AssetForecastDataSnapshot["evidence"] {
  if (!payload?.assessment && !payload?.feed?.items?.length) return undefined;
  return {
    status: payload.assessment?.status,
    summary: payload.assessment?.summary,
    items: (payload.feed?.items ?? []).slice(0, 6).map((item) => ({
      published_at: String(item.published_at ?? ""),
      title: String(item.title ?? ""),
      source: String(item.source ?? ""),
      relation: String(item.relation ?? ""),
    })),
  };
}

async function jsonFrom(responsePromise: Promise<Response>) {
  try {
    const response = await responsePromise;
    return response.ok ? await response.json() as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

const FORECAST_SECTION_INSTRUCTIONS = [
  "根对象只能包含 summary、confidence_score、confidence_reason、scenarios、drivers、risks、invalidation_signals。",
  "summary 不超过 180 字；confidence_score 是 0-100 数字；confidence_reason 不超过 140 字。",
  "scenarios 必须是 JSON 数组，不是对象；数组恰好三个对象，key 分别为 downside、base、upside。",
  "每个情景对象必须包含 key、probability_pct、rationale、source_refs、points；rationale 不超过 120 字。",
  "source_refs 必须是字符串数组。points 必须是 JSON 数组，恰好包含 month=1、3、6、12 四个对象，每个对象只有 month 和 cumulative_return_pct。",
  "drivers、risks、invalidation_signals 必须是字符串数组，各 1-3 项，每项不超过 80 字。",
  "三个情景概率合计 100，每一期都满足 downside <= base <= upside，累计收益率限定在 -100 到 200；-100 表示资产价值归零，不得更低。",
  "必须根据收到的数据单独估计每一期，不得套用固定路径、固定年化收益率或机械复利；同一路径允许随时间波动或反转。",
  "每个情景的 source_refs 至少包含一个 allowed_source_refs 中的 ID，不得发明 ID。",
  "如果输入包含 required_source_ref，至少一个情景的 source_refs 必须包含该 ID；该引用也可以表示检索未命中或资料不支持。",
  "资料不足时降低置信度、说明缺口并扩大情景区间，不得补充未提供的实时事实。",
  "只输出 JSON，不写 Markdown。",
].join("\n");

export async function POST(request: Request) {
  try {
    const input = validateAssetForecastInput(await request.json());
    const isEnglish = input.locale === "en";
    const t = (zh: string, en: string) => isEnglish ? en : zh;
    const context = { params: Promise.resolve({ code: input.asset.code }) };
    const suppliedEvidence = input.evidence_context && (input.evidence_context.assessment || input.evidence_context.feed?.items?.length)
      ? input.evidence_context
      : undefined;
    const [informationRaw, financialRaw, retrievedEvidenceRaw] = await Promise.all([
      jsonFrom(readInformationRoute(new Request(`http://internal/api/information/${input.asset.code}`), context)),
      jsonFrom(readFinancialRoute(new Request(`http://internal/api/financial/${input.asset.code}`), context)),
      suppliedEvidence
        ? Promise.resolve(undefined)
        : jsonFrom(readEvidenceRoute(new Request(`http://internal/api/evidence/${input.asset.code}?reason=${encodeURIComponent(input.decision.reason)}`), context)),
    ]);
    const information = informationRaw as InformationPayload | undefined;
    const financial = financialRaw as FinancialPayload | undefined;
    const evidence = (suppliedEvidence ?? retrievedEvidenceRaw) as EvidencePayload | undefined;
    const evidenceBasis = suppliedEvidence ? "provided_previous_step" as const : evidence ? "retrieved_in_forecast" as const : "unavailable" as const;
    const dataSnapshot: AssetForecastDataSnapshot = {
      market: marketSnapshot(information),
      financial: financialSnapshot(financial),
      evidence: evidenceSnapshot(evidence),
    };
    const sources: AssetForecastSource[] = [
      { source_id: "user_thesis", label: t("本次用户理由", "User thesis"), status: "available" },
      { source_id: "market_history", label: dataSnapshot.market?.source ?? t("近 260 日日线", "260 daily bars"), status: dataSnapshot.market ? sourceStatus(information?.reliability?.status) : "unavailable", as_of: dataSnapshot.market?.as_of },
      { source_id: "financial_report", label: t("公开财务报表", "Public financial statements"), status: dataSnapshot.financial ? sourceStatus(financial?.reliability?.status) : "unavailable", as_of: dataSnapshot.financial?.report_date },
      { source_id: "formal_disclosures", label: t("近 90 天公司公告", "Company disclosures from the past 90 days"), status: dataSnapshot.evidence ? sourceStatus(evidence?.reliability?.status) : "unavailable", as_of: evidence?.feed?.updated_at },
    ];
    const evidenceRagQuery = [
      input.decision.reason,
      input.decision.action,
      input.decision.horizon,
      dataSnapshot.financial ? "收入 利润 现金流 负债" : "",
      dataSnapshot.evidence?.status ?? "",
      "公告 披露 公开资料 财报 预测 情景 概率 置信度",
    ].join(" ");
    const technicalRagQuery = [
      input.asset.name,
      input.decision.horizon,
      "K线 趋势 动量 均线 波动 回撤 技术预测 情景 概率",
    ].join(" ");
    const evidenceKnowledge = searchAssetForecastKnowledge(evidenceRagQuery, 5)
      .filter((item) => item.document_id !== "forecast_price_regime");
    const technicalKnowledge = searchAssetForecastKnowledge(technicalRagQuery, 5)
      .filter((item) => ["forecast_price_regime", "forecast_common_risk", "forecast_scenario_calibration"].includes(item.document_id));
    const knowledgeHits = [...new Map(
      [...evidenceKnowledge, ...technicalKnowledge].map((item) => [item.document_id, item]),
    ).values()];
    const evidenceAllowedRefs = new Set([
      "user_thesis",
      ...sources
        .filter((item) => ["formal_disclosures", "financial_report"].includes(item.source_id) && item.status !== "unavailable")
        .map((item) => item.source_id),
      ...evidenceKnowledge.map((item) => item.document_id),
    ]);
    const technicalAllowedRefs = new Set([
      ...sources
        .filter((item) => item.source_id === "market_history" && item.status !== "unavailable")
        .map((item) => item.source_id),
      ...technicalKnowledge.map((item) => item.document_id),
    ]);
    const evidenceRequiredRef = dataSnapshot.evidence && evidenceAllowedRefs.has("formal_disclosures") ? "formal_disclosures" : undefined;
    const technicalRequiredRef = dataSnapshot.market && technicalAllowedRefs.has("market_history") ? "market_history" : undefined;
    const availableDataCount = sources.filter((item) => item.source_id !== "user_thesis" && item.status === "available").length;

    try {
      const state = await readProviderState();
      const eligible = state.providers
        .filter((provider) => provider.capabilities.preTradeCheck)
        .sort((left, right) => Number(right.providerId === state.defaultProviderId) - Number(left.providerId === state.defaultProviderId));
      const [evidenceResult, technicalResult] = await Promise.allSettled([
        callAIProviderWithFallback(eligible, [
          {
            role: "system",
            content: [
              "你是公开资料条件预测器，不是投顾。",
              "你只会收到上一步核实的公开资料、财务快照、用户待核实理由和对应方法 RAG；你没有 K 线或行情数据。",
              "预测必须以 evidence_snapshot 的核实状态和条目为核心。未命中、仅标题相关或资料不可用时，不得写成事实。",
              "缺少行业基准时不得把单一资产负债率直接解释为财务压力；金融企业的资产负债结构不能套用普通工业企业阈值。",
              "source_refs 不得引用 market_history 或任何行情来源。",
              isEnglish ? "All user-facing JSON strings must be in English. Preserve only quoted user input and original source titles in their original language." : "所有面向用户的 JSON 字符串必须使用简体中文。",
              FORECAST_SECTION_INSTRUCTIONS,
            ].join("\n"),
          },
          {
            role: "user",
            content: JSON.stringify({
              schema_version: input.schema_version,
              forecast_channel: "verified_public_evidence",
              asset: { code: input.asset.code, name: input.asset.name, base_value: input.asset.base_value },
              decision: input.decision,
              evidence_basis: evidenceBasis,
              evidence_snapshot: dataSnapshot.evidence,
              financial_snapshot: dataSnapshot.financial,
              rag_context: evidenceKnowledge,
              allowed_source_refs: [...evidenceAllowedRefs],
              required_source_ref: evidenceRequiredRef,
            }),
          },
        ], 1800),
        callAIProviderWithFallback(eligible, [
          {
            role: "system",
            content: [
              "你是 K 线技术条件预测器，不是投顾。",
              "你只会收到近 260 根真实 OHLCV 日 K 线生成的技术摘要和方法 RAG；你没有公告、财报、新闻或用户理由。",
              "必须综合收益、波动、回撤、均线、ATR、成交量比、区间位置、阳线比例和最新蜡烛实体/影线，不得把单一趋势机械外推。",
              "成交量只能描述交易活跃度，不能写成资金流入、资金流出、主力行为；不得提及基本面、公告、财报或新闻。",
              "没有 RSI、MACD 等指标时不得声称这些指标给出超买、超卖、金叉或死叉。",
              "source_refs 不得引用 formal_disclosures、financial_report 或 user_thesis。",
              isEnglish ? "All user-facing JSON strings must be in English." : "所有面向用户的 JSON 字符串必须使用简体中文。",
              FORECAST_SECTION_INSTRUCTIONS,
            ].join("\n"),
          },
          {
            role: "user",
            content: JSON.stringify({
              schema_version: input.schema_version,
              forecast_channel: "kline_technical",
              asset: { code: input.asset.code, name: input.asset.name, base_value: input.asset.base_value },
              horizon: input.decision.horizon,
              market_snapshot: dataSnapshot.market,
              rag_context: technicalKnowledge,
              allowed_source_refs: [...technicalAllowedRefs],
              required_source_ref: technicalRequiredRef,
            }),
          },
        ], 1800),
      ]);
      let evidenceForecast: ReturnType<typeof parseAssetForecastSection> | undefined;
      let technicalForecast: ReturnType<typeof parseAssetForecastSection> | undefined;
      const channelErrors: string[] = [];
      if (evidenceResult.status === "fulfilled") {
        try {
          evidenceForecast = parseAssetForecastSection(
            evidenceResult.value.content,
            evidenceAllowedRefs,
            evidenceRequiredRef,
            t("公开资料预测", "Public-evidence forecast"),
            /K\s*线|均线|ATR|波动率|回撤|成交量|蜡烛|技术面/i,
          );
          validateAssetForecastLanguage(evidenceForecast, input.locale);
        } catch (error) {
          channelErrors.push(`公开资料预测输出无效：${error instanceof Error ? error.message : "JSON 校验失败"}`);
        }
      } else {
        channelErrors.push(`公开资料预测调用失败：${evidenceResult.reason instanceof Error ? evidenceResult.reason.message : "AI 服务不可用"}`);
      }
      if (technicalResult.status === "fulfilled") {
        try {
          technicalForecast = parseAssetForecastSection(
            technicalResult.value.content,
            technicalAllowedRefs,
            technicalRequiredRef,
            t("K 线技术预测", "Technical price forecast"),
            /(?:公告|财报)(?:显示|表明|确认)|(?:现金流|利润|订单)(?:改善|恶化|增长|下降)|资金(?:持续)?(?:流入|流出)|主力(?:买入|卖出|流入|流出)/i,
          );
          validateAssetForecastLanguage(technicalForecast, input.locale);
        } catch (error) {
          channelErrors.push(`K 线技术预测输出无效：${error instanceof Error ? error.message : "JSON 校验失败"}`);
        }
      } else {
        channelErrors.push(`K 线技术预测调用失败：${technicalResult.reason instanceof Error ? technicalResult.reason.message : "AI 服务不可用"}`);
      }
      if (!evidenceForecast && !technicalForecast) throw new Error(channelErrors.join("；") || "两个 AI 预测通道均不可用");
      if (evidenceForecast && technicalForecast) {
        const evidencePathSignature = JSON.stringify(evidenceForecast.scenarios.map((scenario) => scenario.points.map((point) => point.cumulative_return_pct)));
        const technicalPathSignature = JSON.stringify(technicalForecast.scenarios.map((scenario) => scenario.points.map((point) => point.cumulative_return_pct)));
        if (evidencePathSignature === technicalPathSignature) {
          technicalForecast = undefined;
          channelErrors.push("K 线技术预测与公开资料预测返回相同固定路径，技术通道已降级");
        }
      }
      const successfulResults: Array<{ provider: string; model: string }> = [];
      if (evidenceResult.status === "fulfilled" && evidenceForecast) successfulResults.push(evidenceResult.value);
      if (technicalResult.status === "fulfilled" && technicalForecast) successfulResults.push(technicalResult.value);
      const providers = [...new Set(successfulResults.map((item) => item.provider))];
      const models = [...new Set(successfulResults.map((item) => item.model))];
      const mode = evidenceForecast && technicalForecast ? "ai_rag" as const : "partial_ai_rag" as const;
      return NextResponse.json(buildAssetProjection(input.asset.base_value, evidenceForecast?.scenarios ?? DEFAULT_ASSET_SCENARIOS, {
        mode,
        provider: providers.join(" / ") || t("本地规则", "Local rules"),
        model: models.join(" / ") || "bounded-path-fallback-v1",
        summary: evidenceForecast?.summary ?? t("公开资料 AI 输出未通过校验，当前仅显示该通道的受限降级情景。", "The public-evidence AI output failed validation; this channel shows bounded fallback scenarios."),
        confidenceScore: evidenceForecast?.confidence_score ?? Math.min(20, availableDataCount * 6),
        confidenceReason: evidenceForecast?.confidence_reason ?? t("公开资料预测输出不可用，不能据此形成方向判断。", "The public-evidence forecast is unavailable and cannot support a directional conclusion."),
        drivers: evidenceForecast?.drivers ?? [],
        risks: evidenceForecast?.risks ?? [t("公开资料预测通道当前不可用", "The public-evidence forecast channel is unavailable")],
        invalidationSignals: evidenceForecast?.invalidation_signals ?? [t("取得新资料后重新生成公开资料预测", "Regenerate the public-evidence forecast after new data arrives")],
        evidenceMode: evidenceForecast ? "ai_rag" : "rules",
        dataSnapshot,
        knowledgeHits,
        vectorMethod: ASSET_FORECAST_VECTOR_METHOD,
        sources,
        evidenceBasis,
        technicalForecast: {
          scenarios: technicalForecast?.scenarios ?? DEFAULT_ASSET_SCENARIOS,
          summary: technicalForecast?.summary ?? t("K 线 AI 输出未通过校验，当前仅显示该通道的受限降级情景。", "The technical AI output failed validation; this channel shows bounded fallback scenarios."),
          confidenceScore: technicalForecast?.confidence_score ?? 15,
          confidenceReason: technicalForecast?.confidence_reason ?? t("K 线技术预测输出不可用。", "The technical forecast output is unavailable."),
          drivers: technicalForecast?.drivers ?? [],
          risks: technicalForecast?.risks ?? [t("K 线技术预测通道当前不可用", "The technical forecast channel is unavailable")],
          invalidationSignals: technicalForecast?.invalidation_signals ?? [t("行情数据更新后重新生成 K 线技术预测", "Regenerate the technical forecast after market data updates")],
          mode: technicalForecast ? "ai_rag" : "rules",
        },
        warning: channelErrors.length ? t(`部分 AI 预测已降级：${channelErrors.join("；")}`, "One or more AI forecast channels fell back after validation failed.") : undefined,
        locale: input.locale,
      }));
    } catch (error) {
      return NextResponse.json(buildAssetProjection(input.asset.base_value, DEFAULT_ASSET_SCENARIOS, {
        mode: "rules",
        summary: t("AI 预测未通过调用或 JSON 校验，当前显示受限的非线性降级情景。", "AI invocation or JSON validation failed; bounded nonlinear fallback scenarios are shown."),
        confidenceScore: Math.min(25, availableDataCount * 8),
        confidenceReason: t(`可用资料类别 ${availableDataCount}/3；AI 输出不可用，不能据此形成方向判断。`, `${availableDataCount}/3 data categories are available; AI output is unavailable and cannot support a directional conclusion.`),
        dataSnapshot,
        knowledgeHits,
        vectorMethod: ASSET_FORECAST_VECTOR_METHOD,
        sources,
        evidenceBasis,
        warning: error instanceof Error ? t(`AI RAG 预测已降级：${error.message}`, "AI RAG forecasting fell back after validation or provider failure.") : t("AI RAG 预测已降级", "AI RAG forecasting fell back"),
        locale: input.locale,
      }));
    }
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "无法读取资产预测请求" }, { status: 400 });
  }
}
