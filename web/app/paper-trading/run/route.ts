import {NextResponse} from "next/server";
import {savePaperRun} from "@/app/lib/quant-research-server";
export async function POST(request:Request){try{return NextResponse.json({paper_portfolio:await savePaperRun(await request.json())});}catch(error){const message=error instanceof Error?error.message:"模拟运行失败";return NextResponse.json({message},{status:message.includes("确认")?409:422});}}
