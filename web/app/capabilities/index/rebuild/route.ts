import {NextResponse} from "next/server";
import {rebuildCapabilityIndex,summarizeCapabilityIndex} from "@/app/lib/capability-index-server";
export async function POST(request:Request){const body=await request.json().catch(()=>({})) as {confirmed?:boolean};if(body.confirmed!==true)return NextResponse.json({status:"blocked",message:"全量重建需要明确确认"},{status:409});return NextResponse.json(summarizeCapabilityIndex(await rebuildCapabilityIndex()));}
