import { NextResponse } from "next/server";
import { executeResearch, listResearchState } from "@/app/lib/strategy-research/server";
import type { StrategyPlan } from "@/app/lib/strategy-research/types";
import { authenticatedOwnerKey } from "@/app/lib/user-snapshot";
export async function GET(){if(!await authenticatedOwnerKey())return NextResponse.json({message:"请先登录"},{status:401});try{const state=await listResearchState();return NextResponse.json({runs:state.runs,allow_live_order:false});}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"读取失败"},{status:503});}}
export async function POST(request:Request){
  if(!await authenticatedOwnerKey())return NextResponse.json({message:"请先登录"},{status:401});if(Number(request.headers.get("content-length")??0)>80_000)return NextResponse.json({message:"请求内容过大"},{status:413});
  const body=await request.json().catch(()=>null) as {plan?:StrategyPlan;confirmation_hash?:unknown;confirmed?:unknown;attempts_total?:unknown;simulate_partial?:unknown;simulate_stale?:unknown}|null;
  if(!body?.plan||typeof body.confirmation_hash!=="string")return NextResponse.json({message:"研究计划输入无效"},{status:422});
  try{const run=await executeResearch({plan:body.plan,confirmation_hash:body.confirmation_hash,confirmed:body.confirmed===true,attempts_total:Number(body.attempts_total)||1,partialSymbols:body.simulate_partial===true?["600000","600009","600028","600030","600036","600050"]:undefined,stale:body.simulate_stale===true,data_mode:body.plan.dsl.universe.mode==="custom"?"live":"demo"});return NextResponse.json({run});}catch(error){const message=error instanceof Error?error.message:"研究运行失败";return NextResponse.json({message},{status:/确认|失效|锁定历史已经打开过/.test(message)?409:422});}
}
