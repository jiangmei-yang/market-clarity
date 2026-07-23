import {NextResponse} from "next/server";
import {runNaturalStrategy} from "@/app/lib/natural-language-strategy-server";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{return NextResponse.json(await runNaturalStrategy((await params).id,await request.json()));}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"策略运行失败"},{status:422});}}
