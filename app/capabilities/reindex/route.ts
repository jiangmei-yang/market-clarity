import {NextResponse} from "next/server";
import {rebuildCapabilityIndex,summarizeCapabilityIndex} from "@/app/lib/capability-index-server";
export async function POST(request:Request){const body=await request.json().catch(()=>({})) as {confirmed?:boolean};if(body.confirmed!==true)return NextResponse.json({status:"blocked",message:"重新索引前需要管理员确认"},{status:409});const status=summarizeCapabilityIndex(await rebuildCapabilityIndex());return NextResponse.json({...status,message:"能力索引已从当前 Registry 全量重建"});}
