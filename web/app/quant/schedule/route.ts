import {NextResponse} from "next/server";import {createSchedule} from "@/app/lib/quant-research-server";
export async function POST(request:Request){try{return NextResponse.json({schedule:await createSchedule(await request.json())},{status:201});}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"无法创建计划"},{status:422});}}
