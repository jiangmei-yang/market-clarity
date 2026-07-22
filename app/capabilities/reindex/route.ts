import {NextResponse} from "next/server";
import {buildCapabilityRegistry,capabilityHealth} from "@/app/lib/capability-rag";
import {readProviderState} from "@/app/lib/ai-provider-catalog";
export async function POST(request:Request){const body=await request.json().catch(()=>({})) as {confirmed?:boolean};if(body.confirmed!==true)return NextResponse.json({status:"blocked",message:"重新索引前需要管理员确认"},{status:409});const registry=buildCapabilityRegistry((await readProviderState()).providers);return NextResponse.json({...capabilityHealth(registry),message:"能力索引已从当前 Registry 重新生成"});}
