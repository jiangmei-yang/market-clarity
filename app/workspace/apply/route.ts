import { NextResponse } from "next/server";
import { confirmAssistantCommand } from "../../lib/assistant-server";
export async function POST(request:Request){try{const body=await request.json() as Record<string,unknown>;if(body.confirmed!==true)return NextResponse.json({message:"请明确确认应用修改"},{status:422});if(typeof body.command_id!=="string")return NextResponse.json({message:"缺少 command_id"},{status:422});return NextResponse.json(await confirmAssistantCommand(body.command_id));}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"无法应用修改"},{status:409});}}
