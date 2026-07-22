export const FAILURE_STATUSES = ["healthy","degraded","stale","unavailable","blocked","failed","cancelled","retrying"] as const;
export type FailureStatus = typeof FAILURE_STATUSES[number];
export type FreshnessKind = "market_realtime"|"market_daily"|"news"|"social"|"financial"|"portfolio"|"user_upload";

export type ReliabilityState = {
  status: FailureStatus;
  last_success_at: string | null;
  data_timestamp: string | null;
  error_code: string | null;
  message: string;
  warnings: string[];
  retryable: boolean;
  fallback_used: string | null;
  allow_signal: boolean;
  allow_trade: false;
};

export type FreshnessState = {
  updated_at: string | null;
  max_age: number;
  freshness_status: "fresh"|"stale"|"unknown";
  source: string;
  fallback_source: string | null;
  age_seconds: number | null;
};

export const FRESHNESS_POLICY_SECONDS:Record<FreshnessKind,number>={
  market_realtime:15*60,
  market_daily:96*60*60,
  news:6*60*60,
  social:60*60,
  financial:120*24*60*60,
  portfolio:24*60*60,
  user_upload:365*24*60*60,
};

export function freshness(kind:FreshnessKind,updatedAt:string|null|undefined,source:string,fallbackSource:string|null=null,nowMs=Date.now()):FreshnessState{
  const maxAge=FRESHNESS_POLICY_SECONDS[kind];
  if(!updatedAt)return {updated_at:null,max_age:maxAge,freshness_status:"unknown",source,fallback_source:fallbackSource,age_seconds:null};
  const parsed=Date.parse(updatedAt);if(!Number.isFinite(parsed))return {updated_at:updatedAt,max_age:maxAge,freshness_status:"unknown",source,fallback_source:fallbackSource,age_seconds:null};
  const age=Math.max(0,Math.floor((nowMs-parsed)/1000));
  return {updated_at:updatedAt,max_age:maxAge,freshness_status:age<=maxAge?"fresh":"stale",source,fallback_source:fallbackSource,age_seconds:age};
}

export function reliability(input:Partial<ReliabilityState>&Pick<ReliabilityState,"status"|"message">):ReliabilityState{
  const signalSafe=input.status==="healthy"||input.status==="degraded";
  return {status:input.status,last_success_at:input.last_success_at??null,data_timestamp:input.data_timestamp??null,error_code:input.error_code??null,message:input.message,warnings:input.warnings??[],retryable:input.retryable??false,fallback_used:input.fallback_used??null,allow_signal:input.allow_signal??signalSafe,allow_trade:false};
}

export function aggregateReliability(items:ReliabilityState[],message="系统状态已汇总"):ReliabilityState{
  if(!items.length)return reliability({status:"unavailable",message:"暂无可检查的能力",error_code:"NO_CAPABILITIES",allow_signal:false});
  const order:FailureStatus[]=["failed","blocked","unavailable","stale","retrying","degraded","cancelled","healthy"];
  const status=order.find(candidate=>items.some(item=>item.status===candidate))??"unavailable";
  return reliability({status,message,last_success_at:items.map(item=>item.last_success_at).filter(Boolean).sort().at(-1)??null,data_timestamp:items.map(item=>item.data_timestamp).filter(Boolean).sort().at(-1)??null,error_code:items.find(item=>item.error_code)?.error_code??null,warnings:items.flatMap(item=>item.warnings),retryable:items.some(item=>item.retryable),fallback_used:items.find(item=>item.fallback_used)?.fallback_used??null,allow_signal:items.every(item=>item.allow_signal)&&["healthy","degraded"].includes(status)});
}

export class ControlledFailure extends Error{
  readonly code:string;readonly retryable:boolean;readonly retryAfterMs:number;readonly statusCode:number|null;
  constructor(message:string,options:{code:string;retryable?:boolean;retryAfterMs?:number;statusCode?:number|null}){super(message);this.name="ControlledFailure";this.code=options.code;this.retryable=options.retryable??false;this.retryAfterMs=Math.max(0,options.retryAfterMs??0);this.statusCode=options.statusCode??null;}
}

export function classifyProviderResponse(status:number,retryAfter:string|null=null):ControlledFailure{
  const retrySeconds=retryAfter?Number(retryAfter):0;const retryAfterMs=Number.isFinite(retrySeconds)&&retrySeconds>0?Math.min(retrySeconds*1000,30_000):0;
  if(status===401||status===403)return new ControlledFailure("API Key 未被服务商接受，请重新配置或检查模型权限。",{code:"AI_AUTH_INVALID",statusCode:status});
  if(status===429&&retryAfterMs)return new ControlledFailure("模型服务请求过于频繁，系统将按服务商要求稍后重试。",{code:"AI_RATE_LIMITED",statusCode:status,retryable:true,retryAfterMs});
  if(status===429)return new ControlledFailure("模型额度不足或请求受限，已停止自动重试。",{code:"AI_QUOTA_OR_RATE_LIMIT",statusCode:status});
  if(status===404)return new ControlledFailure("模型或调用地址不可用，请检查模型名称和调用模式。",{code:"AI_MODEL_UNAVAILABLE",statusCode:status});
  if(status>=500)return new ControlledFailure("模型服务暂时不可用。",{code:"AI_UPSTREAM_5XX",statusCode:status,retryable:true});
  return new ControlledFailure(`模型请求失败（${status}）。`,{code:"AI_REQUEST_FAILED",statusCode:status,retryable:false});
}

export async function withControlledRetry<T>(operation:(attempt:number)=>Promise<T>,options:{maxAttempts?:number;baseDelayMs?:number;sleep?:(ms:number)=>Promise<void>}={}):Promise<{value:T;attempts:number}>{
  const max=Math.max(1,options.maxAttempts??2);const base=Math.max(0,options.baseDelayMs??250);const sleep=options.sleep??((ms:number)=>new Promise(resolve=>setTimeout(resolve,ms)));
  let last:unknown;
  for(let attempt=1;attempt<=max;attempt++){
    try{return {value:await operation(attempt),attempts:attempt};}catch(error){last=error;const controlled=error instanceof ControlledFailure?error:null;if(!controlled?.retryable||attempt===max)throw error;await sleep(controlled.retryAfterMs||base*2**(attempt-1));}
  }
  throw last;
}

export function reliabilityFromFreshness(state:FreshnessState,options:{fallback?:boolean;message?:string}={}):ReliabilityState{
  if(state.freshness_status==="stale"||options.fallback)return reliability({status:"stale",message:options.message??"当前显示最近一次成功数据，不能据此生成新信号。",last_success_at:state.updated_at,data_timestamp:state.updated_at,fallback_used:state.fallback_source??state.source,allow_signal:false,warnings:["数据已降级或超过业务有效期"]});
  if(state.freshness_status==="unknown")return reliability({status:"unavailable",message:options.message??"无法确认数据时间。",error_code:"DATA_TIMESTAMP_UNKNOWN",allow_signal:false,retryable:true});
  return reliability({status:"healthy",message:options.message??"数据在有效期内。",last_success_at:state.updated_at,data_timestamp:state.updated_at,allow_signal:true});
}
