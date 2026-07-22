import { NextResponse } from "next/server";
import { createToolProposal } from "../../lib/agent-os";

export async function POST(request:Request){
  try{
    const body=await request.json() as Record<string,unknown>;
    const goal=typeof body.goal==="string"?body.goal.trim():"";
    if(!goal)return NextResponse.json({message:"请描述缺少的能力"},{status:422});
    return NextResponse.json({type:"capability_gap",request:goal,available_alternatives:[],proposed_tool:createToolProposal(goal),requires_human_review:true});
  }catch{return NextResponse.json({message:"无法生成能力草案"},{status:422});}
}
