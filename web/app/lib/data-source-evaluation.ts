import {authenticatedOwnerKey,getUserDatabase} from "./user-snapshot";
import {DATA_SOURCE_EVALUATION_SAMPLE} from "./data-source-evaluation-sample";

export type DataProbeStatus="healthy"|"degraded"|"stale"|"unavailable";
export type DataProbe={
  code:string;
  name:string;
  market:{status:DataProbeStatus;latencyMs:number;source:string;dataTimestamp:string|null;cacheHit:boolean;sourceCount:number;message:string};
  evidence:{status:DataProbeStatus;latencyMs:number;source:string;dataTimestamp:string|null;cacheHit:boolean;sourceCount:number;itemCount:number;message:string};
};
export type DataSourceEvaluationRun={
  id:string;
  runAt:string;
  environment:"product-routes";
  sampleSize:number;
  probes:DataProbe[];
  summary:{healthy:number;degraded:number;stale:number;unavailable:number;successRate:number;p50LatencyMs:number;p95LatencyMs:number;cacheHitRate:number;sourceCoverageRate:number};
  disclosure:string;
};

async function ensureTable(db:D1Database){await db.prepare(`CREATE TABLE IF NOT EXISTS data_source_evaluation_runs (
  owner_key TEXT NOT NULL, run_id TEXT NOT NULL, run_at TEXT NOT NULL, payload TEXT NOT NULL,
  PRIMARY KEY(owner_key,run_id)
)`).run();}

function percentile(values:number[],quantile:number){if(!values.length)return 0;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.max(0,Math.ceil(sorted.length*quantile)-1))];}
function finiteNumber(value:unknown,label:string,{min=0,max=120_000}:{min?:number;max?:number}={}){const result=Number(value);if(!Number.isFinite(result)||result<min||result>max)throw new Error(`${label}超出允许范围`);return Math.round(result);}
function cleanText(value:unknown,fallback:string,max=240){const result=String(value??fallback).trim();return(result||fallback).slice(0,max);}
function cleanTimestamp(value:unknown){if(value==null||value==="")return null;const result=String(value);if(!Number.isFinite(Date.parse(result)))throw new Error("数据时间格式无效");return result.slice(0,64);}
function cleanStatus(value:unknown):DataProbeStatus{if(!["healthy","degraded","stale","unavailable"].includes(String(value)))throw new Error("采样状态无效");return value as DataProbeStatus;}
function cleanSide(value:unknown,label:string,includeItems=false):DataProbe["market"]|DataProbe["evidence"]{
  if(!value||typeof value!=="object")throw new Error(`${label}采样格式无效`);
  const side=value as Record<string,unknown>;
  const base={status:cleanStatus(side.status),latencyMs:finiteNumber(side.latencyMs,`${label}延迟`),source:cleanText(side.source,"暂无",180),dataTimestamp:cleanTimestamp(side.dataTimestamp),cacheHit:Boolean(side.cacheHit),sourceCount:finiteNumber(side.sourceCount,`${label}来源数`,{max:100}),message:cleanText(side.message,"暂无说明")};
  return includeItems?{...base,itemCount:finiteNumber(side.itemCount,`${label}资料数`,{max:10_000})}:base;
}

export function summarizeDataProbes(probes:DataProbe[]):DataSourceEvaluationRun["summary"]{
  const statuses=probes.flatMap(item=>[item.market.status,item.evidence.status]);
  const latencies=probes.flatMap(item=>[item.market.latencyMs,item.evidence.latencyMs]).filter(Number.isFinite);
  const cacheHits=probes.flatMap(item=>[item.market.cacheHit,item.evidence.cacheHit]).filter(Boolean).length;
  const covered=probes.filter(item=>item.market.sourceCount>0&&item.evidence.sourceCount>0).length;
  const count=(status:DataProbeStatus)=>statuses.filter(item=>item===status).length;
  const successful=count("healthy")+count("degraded");
  return{healthy:count("healthy"),degraded:count("degraded"),stale:count("stale"),unavailable:count("unavailable"),successRate:statuses.length?Math.round(successful/statuses.length*100):0,p50LatencyMs:percentile(latencies,.5),p95LatencyMs:percentile(latencies,.95),cacheHitRate:statuses.length?Math.round(cacheHits/statuses.length*100):0,sourceCoverageRate:probes.length?Math.round(covered/probes.length*100):0};
}

function validateRun(value:unknown):DataSourceEvaluationRun{
  if(!value||typeof value!=="object")throw new Error("采样结果格式无效");
  const input=value as Partial<DataSourceEvaluationRun>;
  if(!Array.isArray(input.probes)||input.probes.length!==DATA_SOURCE_EVALUATION_SAMPLE.length)throw new Error("必须完成 10 只股票的固定样本");
  const probes=input.probes.map((item,index)=>{
    const expected=DATA_SOURCE_EVALUATION_SAMPLE[index];
    if(!item||String(item.code)!==expected.code||String(item.name)!==expected.name)throw new Error("固定样本顺序或内容已被修改");
    return{code:expected.code,name:expected.name,market:cleanSide(item.market,"行情") as DataProbe["market"],evidence:cleanSide(item.evidence,"公告",true) as DataProbe["evidence"]};
  });
  return{id:`data_${crypto.randomUUID().replaceAll("-","").slice(0,16)}`,runAt:new Date().toISOString(),environment:"product-routes",sampleSize:probes.length,probes,summary:summarizeDataProbes(probes),disclosure:"由当前登录用户的浏览器调用产品行情与公告路由实测；样本只代表本次时间与网络环境。"};
}

export async function saveDataSourceEvaluationRun(value:unknown){const owner=await authenticatedOwnerKey();if(!owner)throw new Error("请先登录");const run=validateRun(value);const db=await getUserDatabase();await ensureTable(db);await db.prepare(`INSERT INTO data_source_evaluation_runs(owner_key,run_id,run_at,payload) VALUES(?,?,?,?)`).bind(owner,run.id,run.runAt,JSON.stringify(run)).run();return run;}

export async function readLatestDataSourceEvaluationRun(){const owner=await authenticatedOwnerKey();if(!owner)return null;const db=await getUserDatabase();await ensureTable(db);const response=await db.prepare(`SELECT payload FROM data_source_evaluation_runs WHERE owner_key=? ORDER BY run_at DESC LIMIT 1`).bind(owner).all() as {results?:Array<{payload:string}>};const payload=response.results?.[0]?.payload;if(!payload)return null;try{return JSON.parse(payload) as DataSourceEvaluationRun;}catch{return null;}}
