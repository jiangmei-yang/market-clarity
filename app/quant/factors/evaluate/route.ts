import {NextResponse} from "next/server";
import {evaluateFactorResearch,type FactorResearchInput} from "@/app/lib/factor-research";

export async function POST(request:Request){
  const body=await request.json().catch(()=>null) as FactorResearchInput|null;
  if(!body)return NextResponse.json({message:"因子研究输入无效"},{status:422});
  return NextResponse.json({result:evaluateFactorResearch(body)});
}
