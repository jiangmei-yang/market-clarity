import {NextResponse} from "next/server";
import {readLatestDataSourceEvaluationRun,saveDataSourceEvaluationRun} from "../../../lib/data-source-evaluation";

export async function GET(){return NextResponse.json({run:await readLatestDataSourceEvaluationRun().catch(()=>null)});}
export async function POST(request:Request){try{const input=await request.json();const run=await saveDataSourceEvaluationRun(input);return NextResponse.json({status:"saved",run});}catch(error){return NextResponse.json({status:"invalid",message:error instanceof Error?error.message:"无法保存数据源采样"},{status:400});}}

