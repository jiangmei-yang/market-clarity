import {NextResponse} from "next/server";
import {cloneSharedDashboard} from "@/app/lib/dashboard-server";
export async function POST(request:Request,{params}:{params:Promise<{token:string}>}){try{const body=await request.json() as {confirmed?:boolean};return NextResponse.json({workspace:await cloneSharedDashboard((await params).token,body.confirmed===true)});}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"无法复制分享工作台"},{status:409});}}
