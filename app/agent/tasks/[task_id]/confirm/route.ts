import { NextResponse } from "next/server";
import { confirmAgentTask } from "../../../../lib/agent-os";
export async function POST(request:Request,context:{params:Promise<{task_id:string}>}){try{const body=await request.json().catch(()=>({})) as Record<string,unknown>;if(body.confirmed!==true)return NextResponse.json({message:"请明确确认执行"},{status:422});return NextResponse.json(await confirmAgentTask((await context.params).task_id));}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"无法确认任务"},{status:409});}}
