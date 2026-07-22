import {NextResponse} from "next/server";
import {readUserSnapshot,writeUserSnapshot} from "@/app/lib/user-snapshot";

const categoryKeys={
  holdings:["holdings","watched"],
  decisions:["decisionRecords","latestDecision","opportunityChecks"],
  ai:["agentTasks"],
  quant:["quantVerifications","quantTasks","quantStrategies","quantSchedules","quantSignals","quantAudit","quantPaperPortfolios"],
  profile:["rules","investorProfile","investmentRules","exploratoryPreferences"],
} as const;

export async function GET(){try{const result=await readUserSnapshot();if(result.status==="unauthorized")return NextResponse.json({message:"请先登录"},{status:401});return NextResponse.json(result,{headers:{"content-disposition":`attachment; filename="anxin-personal-data-${new Date().toISOString().slice(0,10)}.json"`}});}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"无法导出个人数据"},{status:503});}}
export async function DELETE(request:Request){try{const body=await request.json() as {category?:keyof typeof categoryKeys;confirmed?:boolean};if(!body.confirmed)return NextResponse.json({message:"删除个人数据前必须明确确认"},{status:422});if(!body.category||!categoryKeys[body.category])return NextResponse.json({message:"数据类别无效"},{status:400});const result=await readUserSnapshot();if(result.status!=="ready")return NextResponse.json({message:result.status==="unauthorized"?"请先登录":"没有可删除的数据"},{status:result.status==="unauthorized"?401:404});const snapshot={...result.snapshot} as Record<string,unknown>;for(const key of categoryKeys[body.category])delete snapshot[key];await writeUserSnapshot(snapshot);return NextResponse.json({status:"deleted",category:body.category});}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"无法删除个人数据"},{status:503});}}
