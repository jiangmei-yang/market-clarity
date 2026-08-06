import {NextResponse} from "next/server";
import {proposeFactorPlan} from "@/app/lib/factor-research";

export async function POST(request:Request){
  const body=await request.json().catch(()=>({})) as {question?:unknown};
  const question=typeof body.question==="string"?body.question.trim():"";
  if(!question)return NextResponse.json({message:"请先描述想研究的因子问题"},{status:422});
  return NextResponse.json({plan:proposeFactorPlan(question)});
}
