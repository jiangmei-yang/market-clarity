import {NextResponse} from "next/server";
import {checkLookAhead,type QuantPricePoint} from "@/app/lib/quant-safety";
export async function POST(request:Request){try{const body=await request.json() as {points?:QuantPricePoint[];parameters?:Record<string,unknown>};return NextResponse.json({report:checkLookAhead(body.points??[],body.parameters??{})});}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"未来函数检查失败"},{status:422});}}
