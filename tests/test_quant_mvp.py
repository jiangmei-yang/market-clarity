import pytest

from src.quant_mvp import QuantMVPService


def confirmed(service: QuantMVPService, text: str = "营收增长大于15%，ROE大于8%，经营现金流为正，近20日涨幅不超过20%"):
    parsed = service.parse_rules(text)
    saved = service.save(parsed["rule_set"])
    return service.confirm(saved["rule_set_id"])


def test_natural_language_rule_parser_builds_supported_fields():
    result = QuantMVPService().parse_rules("营收增长大于15%，ROE大于8%，负债率低于60%，经营现金流为正")
    assert [item["field"] for item in result["rule_set"]["conditions"]] == ["revenue_growth", "roe", "debt_ratio", "operating_cash_flow"]
    assert result["needs_confirmation"] is True


def test_ambiguous_conditions_return_questions():
    result = QuantMVPService().parse_rules("利润增长稳定、负债率低、最近没有暴涨")
    assert len(result["clarification_questions"]) >= 3


def test_rules_do_not_screen_before_confirmation():
    service = QuantMVPService()
    saved = service.save(service.parse_rules("ROE大于10%") ["rule_set"])
    with pytest.raises(PermissionError):
        service.screen(saved["rule_set_id"])


def test_confirmed_rules_can_be_listed_updated_and_deleted():
    service = QuantMVPService()
    rule = confirmed(service)
    assert service.list()[0]["confirmed_at"]
    rule["conditions"][0]["value"] = 20
    updated = service.update(rule["rule_set_id"], rule)
    assert updated["confirmed_at"] is None
    assert service.delete(rule["rule_set_id"]) is True


def test_screen_returns_pass_fail_unknown_source_and_date():
    service = QuantMVPService(); rule = confirmed(service, "利润增长大于10%，ROE大于8%")
    result = service.screen(rule["rule_set_id"])
    assert result["data_status"]["mode"] == "demo"
    assert "不代表全市场" in result["data_status"]["notice"]
    assert any(row["missing_conditions"] for row in result["results"])
    checks = result["results"][0]["matched_conditions"] + result["results"][0]["failed_conditions"]
    assert all(item["data_date"] and item["source"] and item["definition"] for item in checks)


def test_unknown_is_never_treated_as_pass():
    service = QuantMVPService(); rule = confirmed(service, "利润增长大于10%")
    middle = next(row for row in service.screen(rule["rule_set_id"])["results"] if row["code"] == "688981")
    assert middle["missing_conditions"] and not middle["matched_conditions"]


def test_screen_marks_current_holding_overlap():
    service = QuantMVPService(); rule = confirmed(service)
    result = service.screen(rule["rule_set_id"], current_holdings=["600183"])
    assert next(row for row in result["results"] if row["code"] == "600183")["portfolio_overlap"] == ["600183"]


def test_invalid_field_and_operator_are_rejected():
    service = QuantMVPService(); rule = service.parse_rules("ROE大于10%")["rule_set"]
    rule["conditions"][0]["field"] = "future_price"
    with pytest.raises(ValueError, match="不支持的规则字段"):
        service.save(rule)
    rule = service.parse_rules("ROE大于10%")["rule_set"]
    rule["conditions"][0]["operator"] = "exec"
    with pytest.raises(ValueError, match="不支持的操作符"):
        service.save(rule)


def test_portfolio_risk_flags_single_and_sector_concentration():
    result = QuantMVPService().portfolio_risk([
        {"code": "600183", "market_value": 80_000, "sector": "科技"},
        {"code": "688981", "market_value": 60_000, "sector": "科技"},
        {"code": "600519", "market_value": 60_000, "sector": "消费"},
    ])
    kinds = {item["type"] for item in result["risk_flags"]}
    assert {"single_concentration", "sector_concentration"} <= kinds
    assert result["overlaps"][0]["theme"] == "科技"


def test_scenario_uses_exposure_times_shock_and_is_not_prediction():
    result = QuantMVPService().scenario([
        {"code": "600183", "market_value": 70, "sector": "科技"},
        {"code": "600519", "market_value": 30, "sector": "消费"},
    ], [{"name": "科技行业下跌", "sector": "科技", "shock_pct": -10}])
    assert result["scenarios"][0]["estimated_impact_pct"] == -7
    assert "不代表实际未来损益" in result["disclaimer"]


def test_alerts_only_describe_deviation_without_trade_instruction():
    service = QuantMVPService(); rule = confirmed(service, "利润增长大于15%")
    items = service.evaluate_alerts(rule["rule_set_id"])
    assert items
    combined = " ".join(str(item) for item in items)
    assert "建议卖出" not in combined and "建议买入" not in combined
    assert all(item["not_trade_instruction"] is True for item in items)
    assert service.mark_read(items[0]["alert_id"])["read"] is True
