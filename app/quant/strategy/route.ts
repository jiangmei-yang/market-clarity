import {NextResponse} from "next/server";
import {listNaturalStrategies} from "@/app/lib/natural-language-strategy-server";
export async function GET(){try{return NextResponse.json(await listNaturalStrategies());}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"无法读取策略"},{status:503});}}
