import {NextResponse} from "next/server";
import {buildCapabilityRegistry,capabilityHealth} from "@/app/lib/capability-rag";
import {readProviderState} from "@/app/lib/ai-provider-catalog";
export async function GET(){const registry=buildCapabilityRegistry((await readProviderState()).providers);return NextResponse.json(capabilityHealth(registry));}
