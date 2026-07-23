import {NextResponse} from "next/server";
import {backtestNaturalStrategy} from "@/app/lib/natural-language-strategy-server";
export async function POST(request:Request){try{const body=await request.json() as Parameters<typeof backtestNaturalStrategy>[1]&{strategy_id?:string};if(!body.strategy_id)return NextResponse.json({message:"缺少 strategy_id"},{status:422});return NextResponse.json(await backtestNaturalStrategy(body.strategy_id,body));}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"策略回测失败"},{status:422});}}
