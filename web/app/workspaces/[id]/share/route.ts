import {NextResponse} from "next/server";
import {shareDashboard} from "@/app/lib/dashboard-server";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{const body=await request.json() as {confirmed?:boolean};const shared=await shareDashboard((await params).id,body.confirmed===true);return NextResponse.json({...shared,url:`/shared/${shared.shareToken}`});}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"无法创建分享"},{status:409});}}
