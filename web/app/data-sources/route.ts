import {NextResponse} from "next/server";
import {addDashboardDataSource,listDashboardDataSources} from "@/app/lib/dashboard-server";
export async function GET(){try{return NextResponse.json({data_sources:await listDashboardDataSources()});}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"无法读取数据源"},{status:401});}}
export async function POST(request:Request){try{return NextResponse.json({data_source:await addDashboardDataSource(await request.json())});}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"无法添加数据源"},{status:422});}}
