import {NextResponse} from "next/server";
import {saveNewQuantTask} from "@/app/lib/quant-research-server";
export async function POST(request:Request){try{const body=await request.json() as {goal?:string};if(!body.goal?.trim())return NextResponse.json({message:"请描述策略目标"},{status:422});return NextResponse.json({task:await saveNewQuantTask(body.goal),requires_confirmation:true});}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"策略预览失败"},{status:422});}}
