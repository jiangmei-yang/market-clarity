import {NextResponse} from "next/server";import {backtestTask} from "@/app/lib/quant-research-server";
export async function POST(request:Request){try{return NextResponse.json({result:await backtestTask(await request.json())});}catch(error){const message=error instanceof Error?error.message:"无法运行历史模拟";return NextResponse.json({message},{status:message.includes("确认")?409:422});}}
