import {NextResponse} from "next/server";
import {createDashboard} from "@/app/lib/dashboard-server";
export async function POST(request:Request){try{const body=await request.json() as {workspace?:unknown;confirmed?:boolean};return NextResponse.json({workspace:await createDashboard({workspace:body.workspace,confirmed:body.confirmed})});}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"无法导入工作台"},{status:422});}}
