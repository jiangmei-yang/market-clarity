import pandas as pd
from fastapi.testclient import TestClient

from api import app
from src.data_providers import DataService
from src.data_providers.base import DataResult, ensure_financial_schema, ensure_financial_statement_schema
from src.risk_engine import RiskEngine
from src.services.financial_health import FinancialHealthService


def test_financial_health_demo_contract():
    result = FinancialHealthService(DataService(use_demo=True)).run("600519")
    assert result["code"] == "600519"
    assert result["coverage"]["total_checks"] == 4
    assert len(result["periods"]) <= 8
    assert result["data_status"]["is_demo"] is True
    assert {item["id"] for item in result["checks"]} == {"cash_quality", "receivables", "inventory", "debt"}
    assert "不构成盈利预测" in result["methodology"]["disclaimer"]


def test_financial_health_flags_receivables_and_uses_cash_amount():
    dates = pd.to_datetime(["2024-06-30", "2025-06-30"])
    statements = ensure_financial_statement_schema(pd.DataFrame({
        "report_date": dates,
        "revenue": [100, 110],
        "net_profit": [20, 22],
        "operating_cash_flow": [18, 5],
        "accounts_receivable": [10, 15],
        "inventory": [12, 13],
        "total_assets": [200, 220],
        "total_liabilities": [80, 90],
    }))
    class FakeData:
        def resolve_stock(self, code): return "600519", "贵州茅台"
        def get_financial_statements(self, code): return DataResult(statements, "测试报表")

    result = FinancialHealthService(FakeData()).run("600519")
    checks = {item["id"]: item for item in result["checks"]}
    assert checks["cash_quality"]["state"] == "attention"
    assert checks["cash_quality"]["evidence"] == "经营现金流 / 净利润 = 0.23"
    assert checks["receivables"]["state"] == "attention"


def test_risk_engine_does_not_treat_cash_sales_ratio_as_cash_amount():
    financials = ensure_financial_schema(pd.DataFrame([{
        "report_date": "2025-12-31",
        "revenue": 100,
        "net_profit": 10,
        "operating_cash_flow_sales_ratio": 12,
    }]))
    cash_rule = next(item for item in RiskEngine()._financial_rules(financials) if item.rule_id == "cash")
    assert cash_rule.severity == "数据不足"
    assert "不会用百分比字段代替" in cash_rule.evidence


def test_financial_health_api_smoke(monkeypatch):
    monkeypatch.setenv("USE_DEMO_DATA", "true")
    response = TestClient(app).get("/stocks/600519/financial-health")
    assert response.status_code == 200
    body = response.json()
    assert body["headline"]["revenue"] is not None
    assert body["data_status"]["is_demo"] is True
