import { NextResponse } from "next/server";
import { retryAgentTool } from "../../../../../../lib/agent-os";

export async function POST(_:Request,context:{params:Promise<{task_id:string;tool_id:string}>}){
  const params=await context.params;
  try{return NextResponse.json(await retryAgentTool(params.task_id,params.tool_id));}
  catch(error){return NextResponse.json({status:"failed",error_code:"AGENT_TOOL_RETRY_FAILED",message:error instanceof Error?error.message:"无法重试工具步骤",allow_signal:false,allow_trade:false},{status:409});}
}
