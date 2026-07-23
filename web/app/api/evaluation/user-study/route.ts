import {NextResponse} from "next/server";
import {deleteCurrentUserStudyData,exportCurrentUserStudyCsv,exportCurrentUserStudySessionsCsv,readUserStudySummary,saveUserStudyEvent,saveUserStudySession} from "@/app/lib/user-study";
import {validateStudyInput,type StudyInput} from "@/app/lib/user-study-validation";

export async function GET(request:Request){
  try{
    const url=new URL(request.url);
    if(url.searchParams.get("format")==="csv")return new Response(await exportCurrentUserStudyCsv(),{headers:{"content-type":"text/csv;charset=utf-8","content-disposition":"attachment; filename=anxin-user-study.csv"}});
    if(url.searchParams.get("format")==="sessions")return new Response(await exportCurrentUserStudySessionsCsv(),{headers:{"content-type":"text/csv;charset=utf-8","content-disposition":"attachment; filename=anxin-test-sessions.csv"}});
    return NextResponse.json({status:"ready",summary:await readUserStudySummary(),scope:"仅汇总明确同意的真实提交；不包含模拟用户。"});
  }catch(error){return NextResponse.json({status:"unavailable",message:error instanceof Error?error.message:"用户研究数据暂不可用"},{status:503});}
}

export async function POST(request:Request){
  let body:Record<string,unknown>;
  try{body=await request.json() as Record<string,unknown>;}catch{return NextResponse.json({message:"请求格式无效"},{status:400});}
  if(body.eventType==="session"){
    if(!body.sessionId||!["started","completed","abandoned"].includes(String(body.status)))return NextResponse.json({message:"测试会话事件无效"},{status:422});
    try{return NextResponse.json(await saveUserStudySession(body as Parameters<typeof saveUserStudySession>[0]));}catch(error){return NextResponse.json({status:"failed",message:error instanceof Error?error.message:"测试会话保存失败"},{status:503});}
  }
  let clean:StudyInput;
  try{if(!body.reviewId)throw new Error("缺少审查记录");clean=validateStudyInput(body as StudyInput);}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"匿名反馈格式无效"},{status:422});}
  try{return NextResponse.json(await saveUserStudyEvent(clean));}catch(error){return NextResponse.json({status:"failed",message:error instanceof Error?error.message:"匿名反馈保存失败"},{status:503});}
}

export async function DELETE(request:Request){
  try{const body=await request.json() as {confirmed?:boolean};if(body.confirmed!==true)return NextResponse.json({message:"删除匿名体验反馈前必须明确确认"},{status:422});return NextResponse.json(await deleteCurrentUserStudyData());}
  catch(error){return NextResponse.json({message:error instanceof Error?error.message:"无法删除匿名体验反馈"},{status:503});}
}
