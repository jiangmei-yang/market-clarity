import { authenticatedOwnerKey, getUserDatabase } from "./user-snapshot";
import { PARTICIPANT_SEGMENTS, type ParticipantRelation, type ParticipantSegment } from "./user-study-validation";

export const STRATEGY_LAB_EVENTS = [
  "lab_viewed", "lab_revisited", "plan_created", "plan_revised", "run_started", "run_completed",
  "run_failed", "result_viewed", "save_started", "save_completed", "comprehension_submitted",
  "decision_handoff", "abandoned",
] as const;
export type StrategyLabEventName = typeof STRATEGY_LAB_EVENTS[number];
export type StrategyLabStudyInput = {
  sessionId: string;
  event: StrategyLabEventName;
  participantRelation: ParticipantRelation;
  participantSegment: ParticipantSegment;
  durationMs?: number;
  mode?: "idea" | "goal";
  dataMode?: "demo" | "live" | "cached" | "stale" | "partial";
  errorCategory?: "validation" | "model" | "data" | "timeout" | "cancelled" | "storage" | "unknown";
  understandingScore?: number;
  attemptIndex?: number;
  buildId?: string;
  cohortKey?: string;
};
export type StrategyLabStudySummary = {
  started: number;
  planned: number;
  runCompleted: number;
  saved: number;
  abandoned: number;
  revisited: number;
  participants: number;
  firstFiveSaved: number;
  internalParticipants: number;
  completionSeconds: number | null;
  p95RunSeconds: number | null;
  failures: number;
  retries: number;
  comprehensionPassed: number;
  segments: Record<string, number>;
  buildId: string | null;
  cohortKey: string | null;
  safetyIncidents: number | null;
  safetyReviewed: boolean;
};

type StoredEvent = { event_name: StrategyLabEventName; attempt_index: number };
const DAY = 86_400_000;
const RUN_EVENTS = new Set<StrategyLabEventName>(["run_started", "run_completed", "run_failed", "result_viewed"]);
const transitionRequirements: Partial<Record<StrategyLabEventName, StrategyLabEventName[]>> = {
  plan_created: ["lab_viewed", "lab_revisited"],
  plan_revised: ["plan_created"],
  save_started: ["result_viewed"],
  save_completed: ["save_started"],
  comprehension_submitted: ["save_completed"],
  decision_handoff: ["save_completed"],
  abandoned: ["lab_viewed", "lab_revisited"],
};

export function assessStrategyLabEventTransition(existing: StoredEvent[], next: StrategyLabEventName, attemptIndex = 0) {
  const names = new Set(existing.map(item => item.event_name));
  if (existing.some(item => item.event_name === next && item.attempt_index === attemptIndex)) return "idempotent" as const;
  if (names.has("abandoned") || names.has("save_completed") && !["comprehension_submitted", "decision_handoff"].includes(next)) throw new Error("该体验会话已经结束");
  if (!existing.length && next !== "lab_viewed") throw new Error("体验会话必须从进入事件开始");

  if (RUN_EVENTS.has(next)) {
    if (!Number.isInteger(attemptIndex) || attemptIndex < 1 || attemptIndex > 100) throw new Error("运行尝试序号无效");
    if (next === "run_started") {
      if (!names.has("plan_created")) throw new Error("运行前必须先生成规则");
      if (names.has("run_completed")) throw new Error("已有成功结果，不能继续重试");
      if (attemptIndex > 1 && !existing.some(item => item.event_name === "run_failed" && item.attempt_index === attemptIndex - 1)) throw new Error("重试必须紧接上一次失败");
    } else if (next === "run_completed" || next === "run_failed") {
      if (!existing.some(item => item.event_name === "run_started" && item.attempt_index === attemptIndex)) throw new Error("运行结果缺少对应的开始事件");
      if (existing.some(item => ["run_completed", "run_failed"].includes(item.event_name) && item.attempt_index === attemptIndex)) throw new Error("同一次运行已经结束");
    } else if (!existing.some(item => item.event_name === "run_completed" && item.attempt_index === attemptIndex)) {
      throw new Error("查看结果前必须完成对应运行");
    }
    return "record" as const;
  }

  const required = transitionRequirements[next];
  if (required && !required.some(event => names.has(event))) throw new Error(`体验事件顺序无效：${next}`);
  return "record" as const;
}

export function assessStrategyLabTransition(existing: StrategyLabEventName[], next: StrategyLabEventName) {
  const records = existing.map(event_name => ({ event_name, attempt_index: RUN_EVENTS.has(event_name) ? 1 : 0 }));
  return assessStrategyLabEventTransition(records, next, RUN_EVENTS.has(next) ? 1 : 0);
}

export function isStrategyLabRevisit(priorSavedAt: string | undefined, nowMs = Date.now()) {
  if (!priorSavedAt) return false;
  const priorMs = Date.parse(priorSavedAt);
  return Number.isFinite(priorMs) && nowMs - priorMs >= 14 * DAY;
}

export function isSafetyReviewCurrent(reviewedAt: string | undefined, eventDates: string[]) {
  const reviewMs = Date.parse(reviewedAt ?? "");
  if (!Number.isFinite(reviewMs) || eventDates.length === 0) return false;
  return eventDates.every(value => {
    const eventMs = Date.parse(value);
    return Number.isFinite(eventMs) && eventMs <= reviewMs;
  });
}

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(item => item.toString(16).padStart(2, "0")).join("");
}

async function pseudonym(value: string) {
  const secret = process.env.MVP_STUDY_HASH_KEY || process.env.AI_PROVIDER_ENCRYPTION_KEY || (process.env.NODE_ENV === "production" ? "" : ["local", "development", "only"].join("-"));
  if (!secret) throw new Error("服务器尚未配置体验研究化名密钥");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(item => item.toString(16).padStart(2, "0")).join("");
}

export function configuredStrategyLabBuildId() {
  const buildId = process.env.NEXT_PUBLIC_BUILD_ID?.trim();
  if (!buildId && process.env.NODE_ENV === "production") throw new Error("生产环境必须配置策略体验构建编号");
  return buildId || "local-unversioned";
}

async function ensureTables(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS strategy_lab_study_events_v3 (
    owner_key TEXT NOT NULL, event_key TEXT NOT NULL PRIMARY KEY, session_key TEXT NOT NULL, participant_key TEXT NOT NULL,
    cohort_key TEXT NOT NULL, participant_relation TEXT NOT NULL, participant_segment TEXT NOT NULL,
    event_name TEXT NOT NULL, attempt_index INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, duration_ms INTEGER,
    mode TEXT, data_mode TEXT, error_category TEXT, understanding_score INTEGER, build_id TEXT NOT NULL,
    UNIQUE(session_key,event_name,attempt_index)
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS strategy_lab_study_cohorts (
    cohort_key TEXT PRIMARY KEY, build_id TEXT NOT NULL, participant_relation TEXT NOT NULL, opened_at TEXT NOT NULL
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS strategy_lab_safety_reviews (
    cohort_key TEXT NOT NULL, build_id TEXT NOT NULL, reviewed_at TEXT NOT NULL, incident_count INTEGER NOT NULL,
    PRIMARY KEY(cohort_key,build_id)
  )`).run();
  await db.prepare("DELETE FROM strategy_lab_study_events_v3 WHERE created_at < datetime('now','-90 days')").run();
}

function validate(input: StrategyLabStudyInput) {
  if (!input.sessionId || input.sessionId.length < 8 || input.sessionId.length > 160) throw new Error("研究会话编号无效");
  if (!STRATEGY_LAB_EVENTS.includes(input.event)) throw new Error("研究事件无效");
  if (input.event === "lab_revisited") throw new Error("复访状态只能由服务器判定");
  if (!["external", "team_member"].includes(input.participantRelation)) throw new Error("样本关系无效");
  if (!PARTICIPANT_SEGMENTS.includes(input.participantSegment)) throw new Error("参与者类型无效");
  if (input.durationMs !== undefined && (!Number.isFinite(input.durationMs) || input.durationMs < 0 || input.durationMs > DAY)) throw new Error("研究耗时无效");
  if (input.understandingScore !== undefined && (!Number.isInteger(input.understandingScore) || input.understandingScore < 0 || input.understandingScore > 3)) throw new Error("理解检查分数无效");
  if (input.event === "comprehension_submitted" && input.understandingScore === undefined) throw new Error("缺少理解检查分数");
  if (input.mode !== undefined && !(["idea", "goal"] as const).includes(input.mode)) throw new Error("研究入口无效");
  if (input.dataMode !== undefined && !(["demo", "live", "cached", "stale", "partial"] as const).includes(input.dataMode)) throw new Error("数据模式无效");
  if (input.errorCategory !== undefined && !(["validation", "model", "data", "timeout", "cancelled", "storage", "unknown"] as const).includes(input.errorCategory)) throw new Error("错误类别无效");
  if (RUN_EVENTS.has(input.event) && (!Number.isInteger(input.attemptIndex) || input.attemptIndex! < 1 || input.attemptIndex! > 100)) throw new Error("运行尝试序号无效");
  if (!RUN_EVENTS.has(input.event) && input.attemptIndex !== undefined && input.attemptIndex !== 0) throw new Error("非运行事件不能携带尝试序号");
  if (!input.buildId || input.buildId.length > 120) throw new Error("缺少有效构建编号");
  if (!input.cohortKey || input.cohortKey.length > 80) throw new Error("缺少有效招募批次");
  return input;
}

export async function resolveStrategyLabInvite(raw: string) {
  const code = String(raw ?? "").trim();
  if (!code) throw new Error("请输入受邀体验码");
  const external = process.env.MVP_PILOT_EXTERNAL_CODE?.trim();
  const internal = process.env.MVP_PILOT_INTERNAL_CODE?.trim() || (process.env.NODE_ENV !== "production" ? "LOCAL-TEAM" : "");
  const codeHash = await sha256(code);
  const externalMatch = external && codeHash === await sha256(external);
  const internalMatch = internal && codeHash === await sha256(internal);
  if (!externalMatch && !internalMatch) throw new Error("体验码无效或本轮招募已结束");
  return {
    participantRelation: (externalMatch ? "external" : "team_member") as ParticipantRelation,
    cohortKey: (await pseudonym(`cohort:${code}`)).slice(0, 16),
  };
}

async function activeExternalCohort() {
  const code = process.env.MVP_PILOT_EXTERNAL_CODE?.trim();
  if (!code) return null;
  return { cohortKey: (await pseudonym(`cohort:${code}`)).slice(0, 16), buildId: configuredStrategyLabBuildId() };
}

export async function saveStrategyLabStudyEvent(raw: StrategyLabStudyInput) {
  const input = validate(raw);
  const owner = await authenticatedOwnerKey();
  if (!owner) throw new Error("请先登录");
  const db = await getUserDatabase();
  await ensureTables(db);

  await db.prepare("INSERT OR IGNORE INTO strategy_lab_study_cohorts(cohort_key,build_id,participant_relation,opened_at) VALUES(?,?,?,?)")
    .bind(input.cohortKey, input.buildId, input.participantRelation, new Date().toISOString()).run();
  const cohort = await db.prepare("SELECT build_id,participant_relation FROM strategy_lab_study_cohorts WHERE cohort_key=?")
    .bind(input.cohortKey).all() as { results?: Array<{ build_id: string; participant_relation: string }> };
  if (cohort.results?.[0]?.build_id !== input.buildId || cohort.results?.[0]?.participant_relation !== input.participantRelation) throw new Error("该招募批次已绑定其他构建或样本关系，请使用新的体验码");

  const sessionKey = await pseudonym(`${owner}:${input.sessionId}`);
  const participantKey = await pseudonym(`strategy-lab-participant:${owner}`);
  const existing = await db.prepare("SELECT event_name,attempt_index,participant_relation,participant_segment,build_id,cohort_key,created_at FROM strategy_lab_study_events_v3 WHERE session_key=? ORDER BY created_at")
    .bind(sessionKey).all() as { results?: Array<StoredEvent & { participant_relation: string; participant_segment: string; build_id: string; cohort_key: string; created_at: string }> };
  const rows = existing.results ?? [];
  const attemptIndex = RUN_EVENTS.has(input.event) ? input.attemptIndex! : 0;
  const transition = assessStrategyLabEventTransition(rows, input.event, attemptIndex);
  if (transition === "idempotent") return { status: "recorded" as const, event: input.event, idempotent: true };
  const first = rows[0];
  if (first && (first.build_id !== input.buildId || first.cohort_key !== input.cohortKey || first.participant_relation !== input.participantRelation || first.participant_segment !== input.participantSegment)) throw new Error("同一会话的构建、批次或样本属性不能改变");

  let eventName: StrategyLabEventName = input.event;
  if (input.event === "lab_viewed") {
    const prior = await db.prepare("SELECT created_at FROM strategy_lab_study_events_v3 WHERE participant_key=? AND cohort_key=? AND build_id=? AND event_name='save_completed' AND session_key!=? ORDER BY created_at DESC LIMIT 1")
      .bind(participantKey, input.cohortKey, input.buildId, sessionKey).all() as { results?: Array<{ created_at: string }> };
    if (isStrategyLabRevisit(prior.results?.[0]?.created_at)) eventName = "lab_revisited";
  }
  const now = new Date().toISOString();
  const eventKey = await pseudonym(`${sessionKey}:${eventName}:${attemptIndex}`);
  await db.prepare(`INSERT OR IGNORE INTO strategy_lab_study_events_v3(
    owner_key,event_key,session_key,participant_key,cohort_key,participant_relation,participant_segment,event_name,
    attempt_index,created_at,duration_ms,mode,data_mode,error_category,understanding_score,build_id
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    owner, eventKey, sessionKey, participantKey, input.cohortKey, input.participantRelation, input.participantSegment,
    eventName, attemptIndex, now, input.durationMs == null ? null : Math.round(input.durationMs), input.mode ?? null,
    input.dataMode ?? null, input.errorCategory ?? null, input.understandingScore ?? null, input.buildId,
  ).run();
  return { status: "recorded" as const, event: eventName, idempotent: false };
}

export async function recordStrategyLabSafetyReview(raw: { reviewCode: string; incidentCount: number }) {
  const expected = process.env.MVP_PILOT_REVIEW_CODE?.trim();
  if (!expected || await sha256(raw.reviewCode.trim()) !== await sha256(expected)) throw new Error("负责人复核码无效");
  if (!Number.isInteger(raw.incidentCount) || raw.incidentCount < 0 || raw.incidentCount > 100) throw new Error("事故数量无效");
  const active = await activeExternalCohort();
  if (!active) throw new Error("尚未配置外部体验批次");
  const db = await getUserDatabase();
  await ensureTables(db);
  const evidence = await db.prepare("SELECT COUNT(DISTINCT participant_key) participant_count FROM strategy_lab_study_events_v3 WHERE participant_relation='external' AND cohort_key=? AND build_id=? AND created_at >= datetime('now','-90 days')")
    .bind(active.cohortKey, active.buildId).all() as { results?: Array<{ participant_count: number }> };
  const participantCount = Number(evidence.results?.[0]?.participant_count ?? 0);
  if (participantCount < 1) throw new Error("当前外部批次尚无可复核体验记录");
  const reviewedAt = new Date().toISOString();
  await db.prepare("INSERT OR REPLACE INTO strategy_lab_safety_reviews(cohort_key,build_id,reviewed_at,incident_count) VALUES(?,?,?,?)")
    .bind(active.cohortKey, active.buildId, reviewedAt, raw.incidentCount).run();
  return { status: "recorded" as const, participantCount, reviewedAt };
}

function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
}

const emptySummary = (): StrategyLabStudySummary => ({
  started: 0, planned: 0, runCompleted: 0, saved: 0, abandoned: 0, revisited: 0, participants: 0,
  firstFiveSaved: 0, internalParticipants: 0, completionSeconds: null, p95RunSeconds: null, failures: 0,
  retries: 0, comprehensionPassed: 0, segments: {}, buildId: null, cohortKey: null, safetyIncidents: null,
  safetyReviewed: false,
});

export async function readStrategyLabStudySummary(): Promise<StrategyLabStudySummary> {
  const db = await getUserDatabase();
  await ensureTables(db);
  const active = await activeExternalCohort();
  const internal = await db.prepare("SELECT COUNT(DISTINCT participant_key) count FROM strategy_lab_study_events_v3 WHERE participant_relation='team_member' AND created_at >= datetime('now','-90 days')").all() as { results?: Array<{ count: number }> };
  if (!active) return { ...emptySummary(), internalParticipants: Number(internal.results?.[0]?.count ?? 0) };

  const response = await db.prepare("SELECT session_key,participant_key,participant_segment,event_name,attempt_index,created_at,duration_ms,understanding_score FROM strategy_lab_study_events_v3 WHERE participant_relation='external' AND cohort_key=? AND build_id=? AND created_at >= datetime('now','-90 days') ORDER BY created_at")
    .bind(active.cohortKey, active.buildId).all() as { results?: Array<Record<string, unknown>> };
  const cohort = response.results ?? [];
  const sessions = new Map<string, typeof cohort>();
  for (const row of cohort) {
    const key = String(row.session_key);
    sessions.set(key, [...(sessions.get(key) ?? []), row]);
  }
  const firstSessions = new Map<string, typeof cohort>();
  for (const rows of sessions.values()) {
    const participant = String(rows[0]?.participant_key);
    if (!firstSessions.has(participant)) firstSessions.set(participant, rows);
  }
  const primary = [...firstSessions.values()];
  const has = (rows: typeof cohort, event: string) => rows.some(row => row.event_name === event);
  const segments: Record<string, number> = {};
  for (const rows of primary) {
    const segment = String(rows[0]?.participant_segment);
    segments[segment] = (segments[segment] ?? 0) + 1;
  }
  const completionMs = primary.filter(rows => has(rows, "save_completed")).map(rows => Number(rows.find(row => row.event_name === "save_completed")?.duration_ms)).filter(Number.isFinite);
  const successfulRuns = primary.flatMap(rows => rows.filter(row => row.event_name === "run_completed"));
  const runMs = successfulRuns.map(row => Number(row.duration_ms)).filter(Number.isFinite);
  const failedAttempts = primary.flatMap(rows => rows.filter(row => row.event_name === "run_failed")).length;
  const totalStartedAttempts = primary.flatMap(rows => rows.filter(row => row.event_name === "run_started")).length;
  const review = await db.prepare("SELECT incident_count,reviewed_at FROM strategy_lab_safety_reviews WHERE cohort_key=? AND build_id=?")
    .bind(active.cohortKey, active.buildId).all() as { results?: Array<{ incident_count: number; reviewed_at: string }> };
  const reviewRow = review.results?.[0];
  const safetyReviewed = Boolean(reviewRow && isSafetyReviewCurrent(reviewRow.reviewed_at, cohort.map(row => String(row.created_at))));
  const safetyIncidents = safetyReviewed ? Number(reviewRow!.incident_count) : null;
  const completionP50 = percentile(completionMs, .5);
  const runP95 = percentile(runMs, .95);
  return {
    started: primary.filter(rows => has(rows, "lab_viewed") || has(rows, "lab_revisited")).length,
    planned: primary.filter(rows => has(rows, "plan_created")).length,
    runCompleted: primary.filter(rows => has(rows, "run_completed")).length,
    saved: primary.filter(rows => has(rows, "save_completed")).length,
    abandoned: primary.filter(rows => has(rows, "abandoned")).length,
    revisited: new Set(cohort.filter(row => row.event_name === "lab_revisited").map(row => String(row.participant_key))).size,
    participants: primary.length,
    firstFiveSaved: primary.slice(0, 5).filter(rows => has(rows, "save_completed")).length,
    internalParticipants: Number(internal.results?.[0]?.count ?? 0),
    completionSeconds: completionP50 == null ? null : Math.round(completionP50 / 1000),
    p95RunSeconds: runP95 == null ? null : Math.round(runP95 / 1000),
    failures: failedAttempts,
    retries: Math.max(0, totalStartedAttempts - primary.filter(rows => has(rows, "run_started")).length),
    comprehensionPassed: primary.filter(rows => rows.some(row => row.event_name === "comprehension_submitted" && Number(row.understanding_score) === 3)).length,
    segments,
    buildId: active.buildId,
    cohortKey: active.cohortKey,
    safetyIncidents,
    safetyReviewed,
  };
}

export async function exportStrategyLabStudyCsv() {
  const owner = await authenticatedOwnerKey();
  if (!owner) throw new Error("请先登录");
  const db = await getUserDatabase();
  await ensureTables(db);
  const response = await db.prepare("SELECT substr(session_key,1,12) session,substr(cohort_key,1,12) cohort,participant_relation,participant_segment,event_name,attempt_index,created_at,duration_ms,mode,data_mode,error_category,understanding_score,build_id FROM strategy_lab_study_events_v3 WHERE owner_key=? AND created_at >= datetime('now','-90 days') ORDER BY created_at")
    .bind(owner).all() as { results?: Array<Record<string, unknown>> };
  const rows = [["化名会话", "招募批次", "样本关系", "参与者类型", "事件", "运行尝试", "时间", "耗时毫秒", "入口模式", "数据模式", "错误类别", "理解分数", "构建编号"],
    ...(response.results ?? []).map(row => [row.session, row.cohort, row.participant_relation, row.participant_segment, row.event_name, row.attempt_index, row.created_at, row.duration_ms, row.mode, row.data_mode, row.error_category, row.understanding_score, row.build_id])];
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return `\uFEFF${rows.map(row => row.map(escape).join(",")).join("\n")}`;
}

export async function deleteStrategyLabStudyData() {
  const owner = await authenticatedOwnerKey();
  if (!owner) throw new Error("请先登录");
  const db = await getUserDatabase();
  await ensureTables(db);
  await db.prepare("DELETE FROM strategy_lab_study_events_v3 WHERE owner_key=?").bind(owner).run();
  return { status: "deleted" as const };
}
