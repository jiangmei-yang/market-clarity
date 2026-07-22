import {NextResponse} from "next/server";
import {buildCapabilityRegistry,searchCapabilities} from "@/app/lib/capability-rag";
import {readProviderState} from "@/app/lib/ai-provider-catalog";
export async function GET(request:Request){const providers=(await readProviderState()).providers;const registry=buildCapabilityRegistry(providers);const query=new URL(request.url).searchParams.get("q")?.trim();return NextResponse.json({knowledge_type:"platform_capabilities",items:query?searchCapabilities(query,registry):registry,last_verified_at:registry[0]?.last_updated??null});}
