import {NextResponse} from "next/server";import {listQuantState} from "@/app/lib/quant-research-server";
export async function GET(){try{return NextResponse.json({signals:(await listQuantState()).signals,allowed:["watch","research","hold","reduce_risk","no_signal"]});}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"无法读取信号"},{status:401});}}
