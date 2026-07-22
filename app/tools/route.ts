import { NextResponse } from "next/server";
import { listTools } from "../lib/agent-os";
export async function GET(){return NextResponse.json(listTools());}
