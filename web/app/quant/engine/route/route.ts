import {NextResponse} from "next/server";
import {parseQuantGoal,routeQuantEngine,type QuantEngineId} from "@/app/lib/quant-engine-router";
export async function POST(request:Request){try{const body=await request.json() as {goal?:string;requested_engine?:QuantEngineId};const goal=parseQuantGoal(String(body.goal??""));return NextResponse.json({goal,route:routeQuantEngine(goal,body.requested_engine),allow_live_order:false});}catch(error){return NextResponse.json({status:"failed",message:error instanceof Error?error.message:"引擎路由失败",allow_live_order:false},{status:400});}}
