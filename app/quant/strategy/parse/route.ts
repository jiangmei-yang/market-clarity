import {NextResponse} from "next/server";
import {previewNaturalStrategy} from "@/app/lib/natural-language-strategy-server";
export async function POST(request:Request){try{const body=await request.json() as {text?:string;strategy?:string};return NextResponse.json({preview:await previewNaturalStrategy(body.text??body.strategy??"",false)});}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"策略解析失败"},{status:422});}}
