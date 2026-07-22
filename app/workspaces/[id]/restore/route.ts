import { NextResponse } from "next/server";
import {restoreDashboard} from "../../../lib/dashboard-server";
// Supersedes restoreAssistantWorkspaceVersion while keeping the legacy route contract compatible.
export async function POST(request:Request,context:{params:Promise<{id:string}>}){try{const body=await request.json().catch(()=>({})) as {version_id?:string;confirmed?:boolean};if(!body.version_id)return NextResponse.json({message:"缺少 version_id"},{status:422});return NextResponse.json({workspace:await restoreDashboard((await context.params).id,body.version_id,body.confirmed===true)});}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"无法恢复工作台"},{status:409});}}
