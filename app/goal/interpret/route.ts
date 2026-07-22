import {NextResponse} from "next/server";
import {createAgentTask} from "@/app/lib/agent-os";
export async function POST(request:Request){try{const body=await request.json() as {goal?:string;page?:string;selected_provider?:string};if(!body.goal?.trim())return NextResponse.json({message:"请描述你的目标"},{status:422});return NextResponse.json({task:await createAgentTask({goal:body.goal,route:body.page??"/agent",selected_provider:body.selected_provider})});}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"目标解析失败"},{status:422});}}
