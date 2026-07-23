import {NextResponse} from "next/server";import {listQuantState} from "@/app/lib/quant-research-server";
export async function GET(){try{return NextResponse.json({audit:(await listQuantState()).audit});}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"无法读取审计记录"},{status:401});}}
