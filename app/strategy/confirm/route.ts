import {NextResponse} from "next/server";
import {updateQuantTask} from "@/app/lib/quant-research-server";
export async function POST(request:Request){try{const body=await request.json() as {task_id?:string;confirmed?:boolean};if(!body.task_id||body.confirmed!==true)return NextResponse.json({message:"确认策略配置需要 task_id 和 confirmed=true"},{status:409});return NextResponse.json({task:await updateQuantTask(body.task_id,"confirm")});}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"策略确认失败"},{status:422});}}
