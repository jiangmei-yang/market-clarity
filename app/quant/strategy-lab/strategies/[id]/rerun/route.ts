import { NextResponse } from "next/server";
import { rerunResearchStrategy } from "@/app/lib/strategy-research/server";
import { authenticatedOwnerKey } from "@/app/lib/user-snapshot";

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  if(!await authenticatedOwnerKey())return NextResponse.json({message:"请先登录"},{status:401});
  const {id}=await params;const body=await request.json().catch(()=>({})) as {confirmed?:unknown};
  try{return NextResponse.json(await rerunResearchStrategy(id,body.confirmed===true));}
  catch(error){return NextResponse.json({message:error instanceof Error?error.message:"重新检验失败"},{status:422});}
}
