from fastapi.testclient import TestClient

from api import app
from src.services.trade_attribution import run_trade_attribution


CSV = """日期,代码,名称,方向,价格,数量,金额,费用
2026-07-01,510300,沪深300ETF,买入,4.78,1000,4780,2
2026-07-10,513120,港股创新药ETF,买入,1.20,1000,1200,1
2026-07-15,512010,医药ETF,买入,0.85,2000,1700,1
2026-07-20,513120,港股创新药ETF,卖出,1.15,500,575,1
"""


def test_fifo_attribution_and_fee_adjusted_realized_pnl():
    result = run_trade_attribution(CSV)
    assert result["record_count"] == 4
    positions = {item["code"]: item for item in result["attribution"]["positions"]}
    assert positions["513120"]["net_quantity"] == 500
    assert positions["513120"]["cost_basis"] == 600.5
    assert positions["513120"]["realized_pnl"] == -26.5
    assert result["data_status"]["mode"] == "transaction_file"


def test_buy_fees_stay_in_open_cost_until_a_sale_occurs():
    buys_only = """日期,代码,名称,方向,价格,数量,金额,费用
2026-07-01,510300,沪深300ETF,买入,4.78,1000,4780,2
2026-07-02,510300,沪深300ETF,买入,4.80,500,2400,1
"""
    result = run_trade_attribution(buys_only)
    position = result["attribution"]["positions"][0]
    assert result["attribution"]["realized_pnl"] == 0
    assert position["realized_pnl"] == 0
    assert position["cost_basis"] == 7183.0


def test_trade_api_text_ai_and_multipart_upload():
    client = TestClient(app)
    run = client.post("/attribution/run", json={"file_content": CSV, "delimiter": ","})
    assert run.status_code == 200
    assert run.json()["record_count"] == 4

    ai = client.post("/attribution/run_with_ai_report", json={"file_content": CSV, "delimiter": ","})
    assert ai.status_code == 200
    assert ai.json()["model_used"] == "mock"
    assert "不构成投资建议" in ai.json()["ai_report"]

    legacy_ai = client.post("/report/generate_ai", json={
        "total_etfs": 3, "covered_stocks": 12, "main_exposures": ["沪深300", "港股创新药", "医药"],
        "risk_tags": ["医药行业集中"], "behavior_flags": ["单一医药方向暴露较高"],
        "total_return": -0.085, "main_drivers": [{"name": "医药创新药", "impact": -0.062}],
    })
    assert legacy_ai.status_code == 200
    assert "港股创新药" in legacy_ai.json()["report"]
    assert "-8.50%" in legacy_ai.json()["report"]
    assert "本工具仅用于持仓分析和交易复盘参考，不构成投资建议" in legacy_ai.json()["report"]

    upload = client.post(
        "/trade/upload",
        files={"file": ("trades.csv", CSV.encode("utf-8-sig"), "text/csv")},
        data={"delimiter": ","},
    )
    assert upload.status_code == 200
    assert upload.json()["filename"] == "trades.csv"
    assert upload.json()["record_count"] == 4


def test_upload_rejects_non_csv_and_large_files():
    client = TestClient(app)
    bad_type = client.post("/trade/upload", files={"file": ("trades.json", b"{}", "application/json")})
    assert bad_type.status_code == 415
    too_large = client.post("/trade/upload", files={"file": ("trades.csv", b"a" * (5 * 1024 * 1024 + 1), "text/csv")})
    assert too_large.status_code == 422


def test_cors_allows_local_static_server_origin():
    response = TestClient(app).options(
        "/attribution/run",
        headers={"Origin": "http://127.0.0.1:8080", "Access-Control-Request-Method": "POST"},
    )
    assert response.headers.get("access-control-allow-origin") == "http://127.0.0.1:8080"
