import { NextResponse } from "next/server";
import { createAgentTask, getAgentTask } from "../../lib/agent-os";
export async function GET(){try{return NextResponse.json({tasks:await getAgentTask()});}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"无法读取任务"},{status:503});}}
export async function POST(request:Request){try{const body=await request.json() as Record<string,unknown>;const goal=typeof body.goal==="string"?body.goal:"";return NextResponse.json(await createAgentTask({goal,route:typeof body.route==="string"?body.route:undefined,selected_provider:typeof body.selected_provider==="string"?body.selected_provider:undefined}));}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"无法创建任务"},{status:422});}}
