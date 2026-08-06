#!/usr/bin/env python3
"""Deterministic course evaluation pack; requires no API key or network."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.decision_review import RiskProfile, TradePlan  # noqa: E402
from src.decision_review.analyzer import RuleReasonAnalyzer  # noqa: E402
from src.decision_review.rules import review_rules  # noqa: E402
from src.services.news_intelligence import RuleInformationAnalyzer  # noqa: E402


def evaluate(case: dict) -> list[str]:
    failures: list[str] = []
    expected = case["expect"]
    if case["kind"] == "reason":
        result = RuleReasonAnalyzer().analyze(TradePlan(**case["plan"]))
        claim_types = {claim.type for claim in result.claims}
        signals = {signal.signal for signal in result.possible_behavior_signals}
        missing = set(result.missing_items)
        for value in expected.get("claim_types", []):
            if value not in claim_types: failures.append(f"missing claim type {value}")
        for value in expected.get("signals", []):
            if value not in signals: failures.append(f"missing signal {value}")
        for value in expected.get("missing", []):
            if value not in missing: failures.append(f"missing missing-item {value}")
        if result.urgent_support_needed is not expected["urgent"]:
            failures.append(f"urgent={result.urgent_support_needed}, expected {expected['urgent']}")
    elif case["kind"] == "rules":
        profile = RiskProfile(**case["profile"])
        plan = TradePlan(**case["plan"])
        findings, _ = review_rules(profile, plan, case.get("existing_stock", 0), case.get("existing_industry", 0))
        triggered = {finding.rule_id for finding in findings if finding.triggered}
        for value in expected.get("triggered", []):
            if value not in triggered: failures.append(f"expected trigger {value}")
        for value in expected.get("not_triggered", []):
            if value in triggered: failures.append(f"unexpected trigger {value}")
    elif case["kind"] == "information":
        result = RuleInformationAnalyzer().analyze(case["reason"], case["feed"])
        if result.status != expected["status"]:
            failures.append(f"status={result.status}, expected {expected['status']}")
        if result.evidence_indices != expected.get("indices", []):
            failures.append(f"indices={result.evidence_indices}, expected {expected.get('indices', [])}")
    return failures


def main() -> int:
    payload = json.loads((ROOT / "evaluation" / "golden_cases.json").read_text(encoding="utf-8"))
    all_cases = [("golden", item) for item in payload["golden_cases"]] + [("hallucination", item) for item in payload["hallucination_cases"]]
    failed = 0
    print("安心看股 deterministic evaluation")
    for group, case in all_cases:
        failures = evaluate(case)
        if failures:
            failed += 1
            print(f"FAIL [{group}] {case['id']}: {'; '.join(failures)}")
        else:
            print(f"PASS [{group}] {case['id']}")
    passed = len(all_cases) - failed
    print(f"\nResult: {passed}/{len(all_cases)} passed ({len(payload['golden_cases'])} golden + {len(payload['hallucination_cases'])} hallucination cases)")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
