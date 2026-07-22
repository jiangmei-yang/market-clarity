import {NextResponse} from "next/server";
import {recordScheduleRun} from "@/app/lib/quant-research-server";

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const body=await request.json() as {success?:boolean;error_code?:string;message?:string};
    if(typeof body.success!=="boolean")return NextResponse.json({message:"缺少 success 状态"},{status:422});
    return NextResponse.json({schedule:await recordScheduleRun((await params).id,{success:body.success,errorCode:body.error_code,message:body.message})});
  }catch(error){return NextResponse.json({message:error instanceof Error?error.message:"无法记录计划运行结果"},{status:422});}
}
