import { NextResponse } from "next/server";
import { attachStrategyResearchEvidence } from "@/app/lib/strategy-research/server";
import { authenticatedOwnerKey } from "@/app/lib/user-snapshot";

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  if(!await authenticatedOwnerKey())return NextResponse.json({message:"请先登录"},{status:401});
  const {id}=await params;const body=await request.json().catch(()=>({})) as {confirmed?:unknown};
  try{return NextResponse.json({evidence:await attachStrategyResearchEvidence(id,body.confirmed===true),next:"/opportunity"});}
  catch(error){return NextResponse.json({message:error instanceof Error?error.message:"带入失败"},{status:422});}
}
