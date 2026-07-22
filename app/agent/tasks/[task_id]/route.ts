import { NextResponse } from "next/server";
import { getAgentTask } from "../../../lib/agent-os";
export async function GET(_:Request,context:{params:Promise<{task_id:string}>}){try{return NextResponse.json(await getAgentTask((await context.params).task_id));}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"任务不存在"},{status:404});}}
