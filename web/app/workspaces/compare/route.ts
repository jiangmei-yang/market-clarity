import {NextResponse} from "next/server";
import {compareDashboards} from "@/app/lib/dashboard-server";
export async function GET(request:Request){try{const url=new URL(request.url);const left=url.searchParams.get("left"),right=url.searchParams.get("right");if(!left||!right)return NextResponse.json({message:"请指定两个工作台"},{status:400});return NextResponse.json(await compareDashboards(left,right));}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"无法对比工作台"},{status:404});}}
