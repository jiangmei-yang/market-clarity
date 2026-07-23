import { NextResponse } from "next/server";
import { workspaceState } from "../../lib/assistant-server";
export async function GET(){try{const state=await workspaceState();return NextResponse.json({versions:state.versions,audit:state.audit});}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"无法读取工作台历史"},{status:503});}}
