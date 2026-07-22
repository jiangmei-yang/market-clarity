import {NextResponse} from "next/server";
import {cloneDashboardVersion} from "@/app/lib/dashboard-server";
export async function POST(request:Request,{params}:{params:Promise<{id:string;version_id:string}>}){try{const body=await request.json() as {confirmed?:boolean};const {id,version_id}=await params;return NextResponse.json({workspace:await cloneDashboardVersion(id,version_id,body.confirmed===true)});}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"无法从历史版本创建工作台"},{status:422});}}
