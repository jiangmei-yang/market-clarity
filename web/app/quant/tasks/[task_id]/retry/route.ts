import {NextResponse} from "next/server";import {updateQuantTask} from "@/app/lib/quant-research-server";
export async function POST(_:Request,{params}:{params:Promise<{task_id:string}>}){try{return NextResponse.json({task:await updateQuantTask((await params).task_id,"retry")});}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"重试失败"},{status:409});}}
