import {NextResponse} from "next/server";
import {ENGINE_REGISTRY} from "@/app/lib/quant-engine-router";
export async function GET(){return NextResponse.json({engines:ENGINE_REGISTRY.map(item=>({...item,internal_name:undefined})),technical_details_available:true,default_display:"系统会自动选择适合当前任务的研究引擎。"});}
