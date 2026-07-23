import {NextResponse} from "next/server";
import {parseQuantGoal,routeQuantEngine} from "@/app/lib/quant-engine-router";
export async function POST(request:Request){try{const body=await request.json() as {goal?:string};const goal=parseQuantGoal(String(body.goal??""));return NextResponse.json({goal,engine_route:routeQuantEngine(goal),requires_confirmation:false});}catch(error){return NextResponse.json({status:"failed",message:error instanceof Error?error.message:"目标解析失败",allow_trade:false},{status:400});}}
