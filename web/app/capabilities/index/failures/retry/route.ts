import {NextResponse} from "next/server";
import {retryCapabilityIndexFailures} from "@/app/lib/capability-index-server";
export async function POST(request:Request){const body=await request.json().catch(()=>({})) as {confirmed?:boolean};if(body.confirmed!==true)return NextResponse.json({status:"blocked",message:"重试失败索引任务需要明确确认"},{status:409});return NextResponse.json(await retryCapabilityIndexFailures());}
