import {NextResponse} from "next/server";
import {checkUniverse} from "@/app/lib/quant-safety";
export async function POST(request:Request){try{return NextResponse.json({report:checkUniverse(await request.json())});}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"股票池检查失败"},{status:422});}}
