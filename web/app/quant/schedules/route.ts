import {NextResponse} from "next/server";import {listQuantState} from "@/app/lib/quant-research-server";
export async function GET(){try{return NextResponse.json({schedules:(await listQuantState()).schedules});}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"无法读取计划"},{status:401});}}
