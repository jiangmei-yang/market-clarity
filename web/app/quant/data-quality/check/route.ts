import {NextResponse} from "next/server";
import {checkDataQuality,type QuantPricePoint} from "@/app/lib/quant-safety";

export async function POST(request:Request){try{const body=await request.json() as {points?:QuantPricePoint[];source?:string;adjustment?:string;data_timestamp?:string};return NextResponse.json({report:checkDataQuality(Array.isArray(body.points)?body.points:[],{source:body.source,adjustment:body.adjustment,dataTimestamp:body.data_timestamp})});}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"数据质量检查失败"},{status:422});}}
