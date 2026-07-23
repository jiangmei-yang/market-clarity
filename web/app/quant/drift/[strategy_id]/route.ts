import {NextResponse} from "next/server";
import {compareBacktestPaper} from "@/app/lib/quant-safety";
export async function GET(_:Request,{params}:{params:Promise<{strategy_id:string}>}){const {strategy_id}=await params;return NextResponse.json({strategy_id,status:"unavailable",message:"尚未取得同策略的回测与模拟成对结果，不能计算偏差。",allow_signal:false});}
export async function POST(request:Request,{params}:{params:Promise<{strategy_id:string}>}){try{const {strategy_id}=await params;return NextResponse.json({strategy_id,...compareBacktestPaper(await request.json())});}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"偏差计算失败"},{status:422});}}
