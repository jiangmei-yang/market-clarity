import {NextResponse} from "next/server";
import {setDefaultDashboard} from "@/app/lib/dashboard-server";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{const body=await request.json() as {confirmed?:boolean};if(body.confirmed!==true)return NextResponse.json({message:"请明确确认默认工作台"},{status:422});return NextResponse.json(await setDefaultDashboard((await params).id));}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"无法设置默认工作台"},{status:409});}}
