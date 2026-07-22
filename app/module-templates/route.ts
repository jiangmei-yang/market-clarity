import {NextResponse} from "next/server";
import {listDashboardModuleTemplates,saveDashboardModuleTemplate} from "@/app/lib/dashboard-server";

export async function GET(){try{return NextResponse.json({templates:await listDashboardModuleTemplates()});}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"无法读取模块模板"},{status:401});}}
export async function POST(request:Request){try{return NextResponse.json({template:await saveDashboardModuleTemplate(await request.json())},{status:201});}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"无法保存模块模板"},{status:422});}}
