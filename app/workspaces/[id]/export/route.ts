import {NextResponse} from "next/server";
import {dashboardState} from "@/app/lib/dashboard-server";
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){try{const state=await dashboardState((await params).id);return NextResponse.json({schema:"anxin-dashboard-v1",workspace:state.workspace,exported_at:new Date().toISOString()});}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"无法导出工作台"},{status:404});}}
