import { NextResponse } from "next/server";
import { UNIVERSE_PRESETS } from "@/app/lib/strategy-research/catalog";
import { authenticatedOwnerKey } from "@/app/lib/user-snapshot";
export async function GET(){if(!await authenticatedOwnerKey())return NextResponse.json({message:"请先登录"},{status:401});return NextResponse.json({universes:UNIVERSE_PRESETS.map(item=>({id:item.id,name:item.name,summary:item.summary,symbol_count:item.symbols.length,symbols:[...item.symbols],historical_constituents:false,includes_delisted:false,survivorship_bias:true,data_status:"demo"})),custom:{min_symbols:10,max_symbols:30,data_status:"live_or_partial",source:"公开前复权日线"},allow_live_order:false});}
