import {NextResponse} from "next/server";
import {continueAgentTask} from "../../../../lib/agent-os";

export async function POST(request:Request,context:{params:Promise<{task_id:string}>}){
  try{
    const body=await request.json() as {answers?:Record<string,string>};
    return NextResponse.json(await continueAgentTask((await context.params).task_id,body.answers??{}));
  }catch(error){
    return NextResponse.json({message:error instanceof Error?error.message:"无法继续任务"},{status:422});
  }
}
