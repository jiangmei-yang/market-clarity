import {NextResponse} from "next/server";
import {readPilotState,readPilotSummary,recordPilotExposure,setPilotState} from "@/app/lib/pilot-study";

export async function GET(){try{return NextResponse.json({status:"ready",user:await readPilotState(),summary:await readPilotSummary()});}catch(error){return NextResponse.json({status:"unavailable",message:error instanceof Error?error.message:"付费测试状态暂不可用"},{status:503});}}
export async function POST(request:Request){try{const body=await request.json() as {joined?:boolean;event?:string};if(body.event==="view")return NextResponse.json(await recordPilotExposure());if(typeof body.joined!=="boolean")return NextResponse.json({message:"需要明确加入或退出"},{status:422});return NextResponse.json(await setPilotState(body.joined));}catch(error){return NextResponse.json({status:"failed",message:error instanceof Error?error.message:"付费测试操作失败"},{status:503});}}
