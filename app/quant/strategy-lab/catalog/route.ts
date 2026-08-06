import { NextResponse } from "next/server";
import { FACTORS, GOALS } from "@/app/lib/strategy-research/catalog";
import { authenticatedOwnerKey } from "@/app/lib/user-snapshot";
export async function GET(){if(!await authenticatedOwnerKey())return NextResponse.json({message:"请先登录"},{status:401});return NextResponse.json({factors:FACTORS,goals:GOALS,candidate_budget:500,candidate_budget_range:{min:50,max:2000,step:50},target_candidates_range:{min:1,max:6,default:2},comparison_gates:["goal_relative_best_traditional","goal_relative_equal_weight"],allow_live_order:false});}
