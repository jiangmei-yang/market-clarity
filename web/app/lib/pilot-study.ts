import {authenticatedOwnerKey,getUserDatabase} from "./user-snapshot";

export const PILOT_OFFER={
  id:"weekly-thesis-review-19",
  name:"每周持仓判断复核",
  priceMonthly:19,
  trialDays:14,
  promise:"每周汇总持仓相关的新证据、原判断变化和需要重新核对的风险。",
} as const;

async function ensureTable(db:D1Database){await db.prepare(`CREATE TABLE IF NOT EXISTS pilot_interest (
  owner_key TEXT PRIMARY KEY NOT NULL,
  offer_id TEXT NOT NULL,
  price_monthly INTEGER NOT NULL,
  status TEXT NOT NULL,
  joined_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`).run();}
async function ensureExposureTable(db:D1Database){await db.prepare(`CREATE TABLE IF NOT EXISTS pilot_exposures (
  owner_key TEXT PRIMARY KEY NOT NULL, offer_id TEXT NOT NULL,
  first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, view_count INTEGER NOT NULL
)`).run();}

export async function readPilotState(){const owner=await authenticatedOwnerKey();if(!owner)return{joined:false};const db=await getUserDatabase();await ensureTable(db);const row=await db.prepare("SELECT status,joined_at FROM pilot_interest WHERE owner_key=?").bind(owner).all() as {results?:Array<{status:string;joined_at:string}>};const saved=row.results?.[0];return{joined:saved?.status==="joined",joinedAt:saved?.joined_at};}

export async function setPilotState(joined:boolean){const owner=await authenticatedOwnerKey();if(!owner)throw new Error("请先登录");const db=await getUserDatabase();await ensureTable(db);const now=new Date().toISOString();await db.prepare(`INSERT INTO pilot_interest(owner_key,offer_id,price_monthly,status,joined_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(owner_key) DO UPDATE SET offer_id=excluded.offer_id,price_monthly=excluded.price_monthly,status=excluded.status,updated_at=excluded.updated_at`).bind(owner,PILOT_OFFER.id,PILOT_OFFER.priceMonthly,joined?"joined":"withdrawn",now,now).run();return{status:joined?"joined":"withdrawn",offer:PILOT_OFFER};}

export async function recordPilotExposure(){const owner=await authenticatedOwnerKey();if(!owner)throw new Error("请先登录");const db=await getUserDatabase();await ensureExposureTable(db);const now=new Date().toISOString();await db.prepare(`INSERT INTO pilot_exposures(owner_key,offer_id,first_seen_at,last_seen_at,view_count) VALUES(?,?,?,?,1) ON CONFLICT(owner_key) DO UPDATE SET offer_id=excluded.offer_id,last_seen_at=excluded.last_seen_at,view_count=pilot_exposures.view_count+1`).bind(owner,PILOT_OFFER.id,now,now).run();return{status:"recorded" as const};}

export async function readPilotSummary(){const db=await getUserDatabase();await ensureTable(db);await ensureExposureTable(db);const response=await db.prepare("SELECT COUNT(*) total_responses,SUM(CASE WHEN status='joined' THEN 1 ELSE 0 END) joined FROM pilot_interest").all() as {results?:Array<Record<string,number|null>>};const exposure=await db.prepare("SELECT COUNT(*) exposed,SUM(view_count) views FROM pilot_exposures").all() as {results?:Array<Record<string,number|null>>};const row=response.results?.[0]??{};const seen=exposure.results?.[0]??{};return{responses:Number(row.total_responses??0),joined:Number(row.joined??0),exposed:Number(seen.exposed??0),views:Number(seen.views??0),offer:PILOT_OFFER};}
