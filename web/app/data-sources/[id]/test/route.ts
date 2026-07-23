import {NextResponse} from "next/server";
import {DASHBOARD_DATA_SOURCES} from "@/app/lib/dashboard-system";
import {listDashboardDataSources} from "@/app/lib/dashboard-server";

export async function POST(_:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const source=(await listDashboardDataSources()).find(item=>item.sourceId===id)??DASHBOARD_DATA_SOURCES.find(item=>item.sourceId===id);
  if(!source)return NextResponse.json({message:"数据源不存在"},{status:404});
  return NextResponse.json({source_id:source.sourceId,available:source.available,status:source.statusLabel,tested_at:new Date().toISOString()});
}
