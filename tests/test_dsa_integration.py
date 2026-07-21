import httpx

from src.integrations import DailyStockAnalysisClient


def test_dsa_client_reads_health_and_history():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/health":
            return httpx.Response(200, json={"status": "healthy"})
        if request.url.path == "/api/v1/system/config/setup/status":
            return httpx.Response(200, json={"is_complete": True, "ready_for_smoke": True})
        if request.url.path == "/api/v1/history":
            return httpx.Response(200, json={"items": [{"stock_code": "600519"}]})
        return httpx.Response(404)

    client = DailyStockAnalysisClient("http://dsa.test", transport=httpx.MockTransport(handler))
    assert client.available() is True
    assert client.ready() is True
    assert client.recent_reports() == [{"stock_code": "600519"}]


def test_dsa_client_submits_analysis_without_notifications():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured.update(__import__("json").loads(request.content))
        return httpx.Response(202, json={"task_id": "task-1", "status": "pending"})

    client = DailyStockAnalysisClient("http://dsa.test", transport=httpx.MockTransport(handler))
    result = client.submit_analysis("600519")
    assert result["task_id"] == "task-1"
    assert captured["notify"] is False
    assert captured["stock_code"] == "600519"
