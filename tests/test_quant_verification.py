from dataclasses import replace
from datetime import datetime, timezone

import pytest

from src.quant_verification import LocalQuantParser, QuantVerificationEngine


def confirmed(question: str = "业绩增长、估值不高的股票，之后三个月通常表现怎么样？"):
    return replace(LocalQuantParser().parse(question, "600183"), confirmed_at=datetime.now(timezone.utc).isoformat())


def test_local_parser_builds_explicit_editable_rules_without_ai_key():
    hypothesis = LocalQuantParser().parse("营收增长超过20%、PE低于18倍，之后一个月表现怎么样？", "600036")
    assert hypothesis.stock_code == "600036"
    assert hypothesis.holding_period_days == 20
    assert [(item.field, item.value) for item in hypothesis.conditions] == [("revenue_yoy", 20), ("pe_ttm", 18)]
    assert hypothesis.confirmed_at is None
    assert hypothesis.observation_start.startswith("财务数据实际披露日")


def test_user_modified_rule_is_preserved_after_confirmation():
    hypothesis = LocalQuantParser().parse("业绩增长后，三个月表现怎么样？")
    hypothesis.conditions[0].value = 12
    hypothesis.confirmed_at = "2026-07-22T10:00:00+00:00"
    result = QuantVerificationEngine().run(hypothesis)
    assert hypothesis.conditions[0].value == 12
    assert result.hypothesis_id == hypothesis.id


def test_engine_rejects_unconfirmed_rules():
    with pytest.raises(ValueError, match="确认检验条件"):
        QuantVerificationEngine().run(LocalQuantParser().parse("营收增长后表现如何？"))


def test_time_ordered_split_keeps_out_of_sample_after_cutoff():
    hypothesis = confirmed()
    rows = QuantVerificationEngine._observations(hypothesis)
    split = datetime.fromisoformat(hypothesis.out_of_sample_start).date()
    in_rows = [row for row in rows if row[0] < split]
    out_rows = [row for row in rows if row[0] >= split]
    assert in_rows and out_rows
    assert max(row[0] for row in in_rows) < min(row[0] for row in out_rows)
    assert len(in_rows) + len(out_rows) == len(rows)


def test_transaction_cost_reduces_return_deterministically():
    hypothesis = confirmed()
    result = QuantVerificationEngine().run(hypothesis)
    assert result.net_return_pct < result.gross_return_pct
    assert result.cost_impact_pct == pytest.approx(result.gross_return_pct - result.net_return_pct, abs=0.01)
    assert hypothesis.cost_assumptions.round_trip_bps == 21


def test_max_drawdown_and_longest_adverse_period():
    assert QuantVerificationEngine._max_drawdown([0.1, -0.2, -0.1, 0.05]) == pytest.approx(28.0, abs=0.01)
    assert QuantVerificationEngine._longest_adverse([0.1, -0.2, 0, -0.1, 0.2]) == 3


def test_insufficient_sample_downgrades_conclusion(monkeypatch):
    hypothesis = confirmed()
    rows = QuantVerificationEngine._observations(hypothesis)[:12]
    monkeypatch.setattr(QuantVerificationEngine, "_observations", staticmethod(lambda _: rows))
    result = QuantVerificationEngine().run(hypothesis)
    assert result.audit.insufficient_sample is True
    assert result.conclusion in {"证据不足", "削弱当前判断"}


def test_parameter_fragility_is_audited(monkeypatch):
    monkeypatch.setattr(QuantVerificationEngine, "_sensitivity", lambda *_: [
        {"label": "放宽", "net_return_pct": -0.4, "sample_count": 12},
        {"label": "确认", "net_return_pct": 0.2, "sample_count": 12},
    ])
    result = QuantVerificationEngine().run(confirmed())
    assert result.audit.parameter_fragility is True
    assert "参数轻微变化后结果方向反转。" in result.warnings


def test_return_concentration_is_reported(monkeypatch):
    hypothesis = confirmed()
    rows = QuantVerificationEngine._observations(hypothesis)
    concentrated = [(date, stock, 0.5 if index == 0 else -0.001, benchmark) for index, (date, stock, _gross, benchmark) in enumerate(rows)]
    monkeypatch.setattr(QuantVerificationEngine, "_observations", staticmethod(lambda _: concentrated))
    result = QuantVerificationEngine().run(hypothesis)
    assert result.audit.return_concentration is True
    assert result.concentration_by_period_pct > 45


def test_demo_result_is_reproducible_and_never_masquerades_as_live():
    hypothesis = confirmed()
    first = QuantVerificationEngine().run(hypothesis)
    second = QuantVerificationEngine().run(hypothesis)
    assert first.data_mode == second.data_mode == "demo"
    assert first.data_source == second.data_source
    assert first.in_sample_metrics == second.in_sample_metrics
    assert first.out_of_sample_metrics == second.out_of_sample_metrics
    assert first.max_drawdown_pct == second.max_drawdown_pct


def test_audit_exposes_future_data_and_ashare_execution_limits():
    result = QuantVerificationEngine().run(confirmed())
    assert result.audit.look_ahead_risk is False
    assert result.audit.survivorship_risk is True
    assert result.audit.execution_limitations is True
    combined = " ".join(result.audit.messages + result.assumptions)
    assert "尚未披露" in combined
    assert "T+1" in combined
    assert "涨停" in combined and "跌停" in combined
