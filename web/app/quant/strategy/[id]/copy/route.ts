import {NextResponse} from "next/server";
import {copyNaturalStrategy} from "@/app/lib/natural-language-strategy-server";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{const body=await request.json().catch(()=>({})) as {confirmed?:boolean};return NextResponse.json({strategy:await copyNaturalStrategy((await params).id,body.confirmed===true)});}catch(error){const message=error instanceof Error?error.message:"无法复制策略";return NextResponse.json({message},{status:message.includes("确认")?409:422});}}
