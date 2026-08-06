export type FactorId = "momentum_60" | "low_volatility_20" | "reversal_5" | "trend_ma20_60";
export type FilterId = "exclude_high_volatility" | "trend_positive" | "minimum_history" | "exclude_missing_data";
export type ResearchGoal = "balanced" | "lower_drawdown" | "higher_stability" | "lower_turnover" | "higher_net_return";
export type StrategySource = "user" | "template" | "constrained_ai" | "traditional";
export type DataStatus = "live" | "cached" | "snapshot" | "demo" | "stale" | "partial" | "unavailable";
export type CandidateBudget = number;
export type ResearchRounds = 1;
export type TargetCandidates = number;
export type SearchMode = "exhaust_budget" | "stop_on_validation_target";
export type ComparisonGate = "goal_relative_best_traditional" | "goal_relative_equal_weight";
export type ResearchSettings = { candidate_budget: CandidateBudget; max_rounds: ResearchRounds; target_candidates: TargetCandidates; search_mode: SearchMode; comparison_gate: ComparisonGate; locked_slots: 6 };
export type PlanningTrace = {
  template_version: "strategy-planner-v1";
  mode: "constrained_ai" | "rule_fallback";
  provider: string | null;
  model: string | null;
  attempted_providers: string[];
  latency_ms: number;
  fallback_reason: "not_requested" | "provider_unavailable" | "invalid_output" | "provider_error" | null;
  schema_valid: boolean;
  usage_status: "not_reported" | "not_applicable";
};

export type StrategyDSL = {
  version: "strategy-dsl-v1";
  id: string;
  name: string;
  thesis_plain: string;
  source: StrategySource;
  universe: { mode: "preset" | "custom"; id?: string; symbols?: string[] };
  factors: Array<{ id: FactorId; weight: number; direction: "higher" | "lower" }>;
  filters: Array<{ id: FilterId; enabled: boolean }>;
  portfolio: { selection: "top_quantile"; quantile: .2 | .25 | .33; weighting: "equal"; max_positions: number; max_single_weight_pct: number };
  rebalance: { frequency: "biweekly" | "monthly"; holding_days: number };
  costs: { commission_bps: number; stamp_tax_bps: number; slippage_bps: number };
  research_goal: ResearchGoal;
  research_only: true;
  allow_live_order: false;
};

export type StrategyPlan = {
  plan_id: string;
  mode: "idea" | "goal";
  original_input: string;
  clarification: string | null;
  dsl: StrategyDSL;
  plain_rules: string[];
  benchmarks: StrategyDSL[];
  confirmation_hash: string;
  planner: "constrained_ai" | "rule_fallback";
  planning_trace?: PlanningTrace;
  warnings: string[];
  starting_points: Array<{
    id: "low_volatility" | "trend_low_volatility" | "momentum_risk_filter";
    name: string;
    summary: string;
    why: string;
  }>;
  selected_starting_point_id: string | null;
  research_settings: ResearchSettings;
};

export type PricePoint = { date: string; close: number };
export type PriceSeries = { symbol: string; prices: PricePoint[] };
export type DataAudit = {
  status: DataStatus;
  source_name: string;
  data_cutoff: string;
  adjustment: "forward_adjusted";
  universe_name: string;
  universe_version: string;
  requested_symbols: number;
  loaded_symbols: number;
  excluded: Array<{ symbol: string; reason: string }>;
  coverage_pct: number;
  historical_constituents: false;
  includes_delisted: false;
  survivorship_bias: true;
  limitations: string[];
};

export type PeriodResult = { date: string; end_date: string; gross_return: number; net_return: number; universe_return: number; turnover: number; valid_symbols: number };
export type SegmentMetrics = { periods: number; net_return_pct: number | null; annualized_return_pct: number | null; max_drawdown_pct: number | null; volatility_pct: number | null; sharpe: number | null; turnover_pct: number | null; positive_period_ratio: number | null; stability_pct: number | null; concentration_pct: number | null; cost_impact_pct: number | null };
export type StrategyEvaluation = {
  strategy: StrategyDSL;
  status: "precheck_rejected" | "research_rejected" | "validation_rejected" | "locked_failed" | "limited_candidate";
  reason: string;
  research: SegmentMetrics;
  validation: SegmentMetrics;
  locked_test: SegmentMetrics | null;
  all_periods: PeriodResult[];
  equity_curve: Array<{ date: string; value: number; segment: "research" | "validation" | "locked_test" }>;
  drawdown_curve: Array<{ date: string; value: number }>;
  sensitivity_passed: boolean;
  lookahead_check: "pass" | "fail";
};

export type ResearchInterpretation = {
  status: "insufficient_data" | "no_candidate_survived" | "failed_locked_test" | "improved_drawdown_only" | "eroded_by_costs" | "unstable_across_periods" | "limited_historical_improvement" | "fixed_recheck_passed" | "fixed_recheck_not_passed";
  headline: string;
  evidence: string[];
  improvement: string;
  tradeoff: string;
  limitation: string;
  next_step: string;
  cannot_conclude: string[];
};

export type ResearchRun = {
  id: string;
  plan_id: string;
  confirmation_hash: string;
  confirmed_at: string;
  locked_at: string | null;
  created_at: string;
  engine_version: "strategy-research-engine-v1";
  method_version: "three-stage-harness-v6";
  research_settings: ResearchSettings;
  planning_trace?: PlanningTrace;
  data_fingerprint?: string;
  data_audit: DataAudit;
  split: { research_end: string; validation_end: string; locked_test_start: string };
  candidates_generated: number;
  candidates_skipped: number;
  candidate_fingerprints: string[];
  candidate_space_exhausted?: boolean;
  attempts_total: number;
  rounds: Array<{ round: number; generated: number; passed_validation: number; stopped: boolean; reason: string }>;
  evaluations: StrategyEvaluation[];
  funnel: Array<{ id: string; label: string; count: number; reasons: string[] }>;
  interpretation: ResearchInterpretation;
  comparison_standard: { benchmark_strategy_id: string; benchmark_name: string; rule: string };
  reused_previous_run?: boolean;
  classroom_replay?: boolean;
  allow_live_order: false;
};

export type SavedResearchStrategy = {
  id: string; version: number; parent_strategy_id: string | null; name: string; thesis_plain: string; dsl: StrategyDSL;
  source: "user" | "template" | "constrained_ai"; research_goal: ResearchGoal; universe_snapshot: Pick<DataAudit,"universe_name"|"universe_version"|"data_cutoff"|"status">;
  comparison_gate?: ComparisonGate;
  cost_assumptions: StrategyDSL["costs"]; latest_run_id: string; latest_result_summary: Pick<ResearchInterpretation,"status"|"headline"|"limitation">;
  latest_metrics?: Pick<SegmentMetrics,"net_return_pct"|"max_drawdown_pct"|"turnover_pct"|"stability_pct"|"cost_impact_pct"> & { segment: "validation" | "locked_test" };
  data_cutoff: string; data_version: string; data_fingerprint?: string; engine_version: string; method_version: string; limitations: string[];
  confirmed_at: string; created_at: string; updated_at: string; research_only: true; allow_live_order: false;
  locked_test_passed: boolean;
  planning_trace?: PlanningTrace;
};

export type StrategyResearchEvidence = {
  id: string;
  strategy_id: string;
  strategy_version: number;
  latest_run_id: string;
  strategy_name: string;
  headline: string;
  data_cutoff: string;
  attached_at: string;
  limitations: string[];
  research_only: true;
  allow_live_order: false;
};
