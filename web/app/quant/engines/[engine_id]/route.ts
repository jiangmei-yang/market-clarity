import {NextResponse} from "next/server";
import {ENGINE_REGISTRY} from "@/app/lib/quant-engine-router";
export async function GET(_:Request,{params}:{params:Promise<{engine_id:string}>}){const {engine_id}=await params;const engine=ENGINE_REGISTRY.find(item=>item.engine_id===engine_id);return engine?NextResponse.json({engine}):NextResponse.json({message:"研究引擎不存在"},{status:404});}
