import { NextResponse } from "next/server";
import { restoreAssistantWorkspaceVersion } from "../../../lib/assistant-server";
export async function POST(request:Request,context:{params:Promise<{id:string}>}){try{const body=await request.json().catch(()=>({})) as Record<string,unknown>;if(body.confirmed!==true)return NextResponse.json({message:"请明确确认恢复历史版本"},{status:422});return NextResponse.json(await restoreAssistantWorkspaceVersion((await context.params).id));}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"无法恢复工作台"},{status:409});}}
