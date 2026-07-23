import {NextResponse} from "next/server";
import {readSharedDashboard,revokeDashboardShare} from "@/app/lib/dashboard-server";
export async function GET(_:Request,{params}:{params:Promise<{token:string}>}){try{return NextResponse.json(await readSharedDashboard((await params).token));}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"分享不存在"},{status:404});}}
export async function DELETE(request:Request,{params}:{params:Promise<{token:string}>}){try{const body=await request.json() as {confirmed?:boolean};return NextResponse.json(await revokeDashboardShare((await params).token,body.confirmed===true));}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"无法撤销分享"},{status:409});}}
