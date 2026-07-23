import {NextResponse} from "next/server";
import {changeNaturalStrategyStatus} from "@/app/lib/natural-language-strategy-server";
export async function POST(_:Request,{params}:{params:Promise<{id:string}>}){try{return NextResponse.json({strategy:await changeNaturalStrategyStatus((await params).id,"paused")});}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"无法暂停策略"},{status:422});}}
