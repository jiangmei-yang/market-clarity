from fastapi.testclient import TestClient
import pandas as pd
import time

import api
from src.services.etf_diagnosis import ETFDiagnosisService


def demo_service(tmp_path):
    return ETFDiagnosisService(use_demo=True, cache_dir=tmp_path)


def test_demo_search_and_detail_are_labelled(tmp_path):
    service = demo_service(tmp_path)
    search = service.search("沪深300")
    assert search["items"][0]["code"] == "510300"
    assert search["data_status"]["is_demo"] is True

    detail = service.detail("510300.SH")
    assert detail["data_status"]["is_demo"] is True
    assert detail["top_holdings"][0]["stock_code"] == "600519"
    assert detail["holdings_report_date"] is None


def test_diagnosis_uses_unique_stocks_and_equal_weights(tmp_path):
    result = demo_service(tmp_path).diagnose([{"code": "510300"}, {"code": "513120"}])
    assert result["total_etfs"] == 2
    assert result["covered_stocks"] == 10
    assert [item["allocation_pct"] for item in result["etf_list"]] == [50.0, 50.0]
    assert result["overlap_risk"] == "低"
    assert result["data_status"]["is_demo"] is True


def test_diagnosis_rejects_unknown_etfs(tmp_path):
    try:
        demo_service(tmp_path).diagnose([{"code": "999999"}])
    except ValueError as exc:
        assert "没有找到" in str(exc)
    else:
        raise AssertionError("unknown ETF should fail")


def test_live_akshare_fields_are_normalized_without_exposing_raw_columns(tmp_path):
    class FakeAkshare:
        @staticmethod
        def fund_etf_spot_em():
            return pd.DataFrame([
                {"代码": "510300", "名称": "沪深300ETF", "最新价": 4.2, "总市值": 120_000_000_000, "数据日期": "2026-07-21"},
            ])

        @staticmethod
        def fund_portfolio_hold_em(symbol, date):
            return pd.DataFrame([
                {"股票代码": "600519", "股票名称": "贵州茅台", "占净值比例": 3.1, "季度": "2026年2季度股票投资明细"},
                {"股票代码": "601318", "股票名称": "中国平安", "占净值比例": 2.0, "季度": "2026年2季度股票投资明细"},
            ])

        @staticmethod
        def fund_individual_basic_info_xq(symbol, timeout):
            return pd.DataFrame([{"item": "业绩比较基准", "value": "沪深300指数收益率"}])

    service = ETFDiagnosisService(use_demo=False, cache_dir=tmp_path)
    service.ak = FakeAkshare()
    search = service.search("510300")
    assert search["data_status"]["mode"] == "live"
    assert search["items"][0] == {
        "code": "510300", "name": "沪深300ETF", "latest_price": 4.2,
        "scale": 120_000_000_000.0, "scale_text": "1200.00亿元",
    }
    detail = service.detail("510300")
    assert detail["top_holdings"][0]["stock_code"] == "600519"
    assert detail["holdings_report_date"] == "2026年2季度股票投资明细"
    assert detail["tracking_index_is_inferred"] is False


def test_slow_etf_source_falls_back_instead_of_freezing(tmp_path):
    class SlowAkshare:
        @staticmethod
        def fund_etf_spot_em():
            time.sleep(0.05)
            return pd.DataFrame()

    service = ETFDiagnosisService(use_demo=False, cache_dir=tmp_path, upstream_timeout=0.01)
    service.ak = SlowAkshare()
    started = time.monotonic()
    result = service.search("510300")
    assert time.monotonic() - started < 0.04
    assert result["items"][0]["code"] == "510300"
    assert result["data_status"]["mode"] == "demo"
    assert "未响应" in result["data_status"]["message"]

    detail_started = time.monotonic()
    detail = service.detail("510300")
    assert time.monotonic() - detail_started < 0.02
    assert detail is not None
    assert detail["data_status"]["mode"] == "demo"
    assert detail["top_holdings"]


def test_numeric_codes_from_cache_remain_searchable(tmp_path):
    service = ETFDiagnosisService(use_demo=True, cache_dir=tmp_path)
    frame = pd.DataFrame([{"code": 510300, "name": "沪深300ETF", "latest_price": 4.2, "scale": None}])
    normalized = service._normalize_list_frame(frame)
    assert normalized.iloc[0]["code"] == "510300"


def test_cached_list_does_not_trigger_more_slow_calls_for_demo_codes(tmp_path, monkeypatch):
    service = ETFDiagnosisService(use_demo=False, cache_dir=tmp_path)
    cached_frame = pd.DataFrame([{"code": 510300, "name": "沪深300ETF", "latest_price": 4.2, "scale": None}])
    monkeypatch.setattr(service, "_etf_list", lambda: (cached_frame, service._status("cache", "名单缓存")))
    monkeypatch.setattr(service, "_holdings", lambda code: (_ for _ in ()).throw(AssertionError("不应请求上游")))
    monkeypatch.setattr(service, "_benchmark", lambda code: (_ for _ in ()).throw(AssertionError("不应请求上游")))

    detail = service.detail("510300")
    assert detail is not None
    assert detail["top_holdings"]
    assert detail["tracking_index"] == "沪深300（演示标签）"


def test_etf_api_and_frontend(monkeypatch, tmp_path):
    monkeypatch.setattr(api, "ETF_SERVICE", demo_service(tmp_path))
    client = TestClient(api.app)

    search = client.get("/etf/search", params={"keyword": "510300"})
    assert search.status_code == 200
    assert search.json()["items"][0]["code"] == "510300"

    diagnosis = client.post("/diagnosis/run", json={"etfs": [{"code": "510300", "amount": 5000}]})
    assert diagnosis.status_code == 200
    assert diagnosis.json()["data_status"]["is_demo"] is True

    page = client.get("/etf-tool")
    assert page.status_code == 200
    assert "ETF 持仓体检" in page.text
    assert "不预测涨跌" in page.text
