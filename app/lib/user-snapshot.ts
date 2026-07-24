import { getChatGPTUser } from "../chatgpt-auth";

export type UserSnapshot = {
  rules?: unknown;
  holdings?: unknown;
  watched?: unknown;
  decisionRecords?: unknown;
  latestDecision?: unknown;
  quantVerifications?: unknown;
  investorProfile?: unknown;
  investmentRules?: unknown;
  workspaces?: unknown;
  activeWorkspaceId?: unknown;
  opportunityChecks?: unknown;
  workspaceVersions?: unknown;
  workspaceRedoVersions?: unknown;
  workspaceAudit?: unknown;
  dashboardVersions?: unknown;
  dashboardRedoVersions?: unknown;
  dashboardPrivacy?: unknown;
  dashboardDataSources?: unknown;
  dashboardModuleTemplates?: unknown;
  exploratoryPreferences?: unknown;
  agentTasks?: unknown;
  quantTasks?: unknown;
  quantStrategies?: unknown;
  quantSchedules?: unknown;
  quantSignals?: unknown;
  quantAudit?: unknown;
  quantPaperPortfolios?: unknown;
  quantBacktests?: unknown;
  strategyDrafts?: unknown;
  naturalLanguageStrategies?: unknown;
  strategyRuns?: unknown;
  strategyNotifications?: unknown;
  strategyBacktestHistory?: unknown;
  strategyAudit?: unknown;
  aiDefaultProviderId?: string;
  aiTaskRouting?: unknown;
  modelEvaluationRuns?: unknown;
  savedAt?: string;
};

export function mergeUserSnapshotState(current: UserSnapshot, patch: UserSnapshot): UserSnapshot {
  const next = { ...current, ...patch };
  delete next.savedAt;
  return next;
}

type D1Result<T> = { results?: T[] };

export async function getUserDatabase() {
  const { env } = await import("cloudflare:workers");
  const binding = (env as unknown as { DB?: D1Database }).DB;
  if (!binding) throw new Error("云端个人数据存储尚未配置");
  return binding;
}

export async function authenticatedOwnerKey() {
  const user = await getChatGPTUser();
  if (!user) return null;
  const bytes = new TextEncoder().encode(user.email.trim().toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function ensureTable(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS user_snapshots (
    owner_key TEXT PRIMARY KEY NOT NULL,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`).run();
}

export async function readUserSnapshot() {
  const owner = await authenticatedOwnerKey();
  if (!owner) return { status: "unauthorized" as const };
  const db = await getUserDatabase();
  await ensureTable(db);
  const row = await db.prepare("SELECT payload, updated_at FROM user_snapshots WHERE owner_key = ?")
    .bind(owner).all() as D1Result<{ payload: string; updated_at: string }>;
  const saved = row.results?.[0];
  if (!saved) return { status: "empty" as const };
  return { status: "ready" as const, snapshot: JSON.parse(saved.payload) as UserSnapshot, updatedAt: saved.updated_at };
}

export async function writeUserSnapshot(snapshot: UserSnapshot) {
  const owner = await authenticatedOwnerKey();
  if (!owner) return { status: "unauthorized" as const };
  const db = await getUserDatabase();
  await ensureTable(db);
  const updatedAt = new Date().toISOString();
  const payload = JSON.stringify({ ...snapshot, savedAt: updatedAt });
  if (payload.length > 750_000) throw new Error("个人数据超过当前云端备份上限，请先导出并精简历史记录");
  await db.prepare(`INSERT INTO user_snapshots (owner_key, payload, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(owner_key) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`)
    .bind(owner, payload, updatedAt).run();
  try {
    const { syncUserContextIndex } = await import("./capability-index-server");
    await syncUserContextIndex();
  } catch {
    // Personal writes remain authoritative; index health reports any later sync failure.
  }
  return { status: "saved" as const, updatedAt };
}

export async function mergeAndWriteUserSnapshot(patch: UserSnapshot) {
  const current = await readUserSnapshot();
  if (current.status === "unauthorized") return current;
  const merged = mergeUserSnapshotState(current.status === "ready" ? current.snapshot : {}, patch);
  return writeUserSnapshot(merged);
}

export async function deleteUserSnapshot() {
  const owner = await authenticatedOwnerKey();
  if (!owner) return { status: "unauthorized" as const };
  const db = await getUserDatabase();
  await ensureTable(db);
  await db.prepare("DELETE FROM user_snapshots WHERE owner_key = ?").bind(owner).run();
  return { status: "deleted" as const };
}
