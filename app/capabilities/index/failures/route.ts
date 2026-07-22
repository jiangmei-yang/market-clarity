import {NextResponse} from "next/server";
import {capabilityIndexFailures} from "@/app/lib/capability-index-server";
export async function GET(){return NextResponse.json(await capabilityIndexFailures());}
