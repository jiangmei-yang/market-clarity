import { NextResponse } from "next/server";
import { cancelAgentTask } from "../../../../lib/agent-os";
export async function POST(_:Request,context:{params:Promise<{task_id:string}>}){try{return NextResponse.json(await cancelAgentTask((await context.params).task_id));}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"无法取消任务"},{status:409});}}
