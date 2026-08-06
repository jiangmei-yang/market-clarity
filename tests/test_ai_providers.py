from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

import api
from src.database import Database
from src.services.ai_providers import AIProviderRegistry, ProviderCreate
from src.services.ai_report import FallbackReportGenerator, ReportRequest


def registry(tmp_path, monkeypatch):
    monkeypatch.setenv("AI_PROVIDER_ENCRYPTION_KEY", Fernet.generate_key().decode())
    return AIProviderRegistry(Database(tmp_path / "providers.db"))


def test_provider_key_is_encrypted_and_never_returned(tmp_path, monkeypatch):
    store = registry(tmp_path, monkeypatch)
    raw_key = "sk-private-never-return-this"
    created = store.create(ProviderCreate(
        display_name="我的 DeepSeek", provider_type="compatible",
        base_url="https://api.deepseek.com/v1", model="deepseek-chat", api_key=raw_key,
    ))
    assert created["api_key_masked"] == "••••••••"
    assert raw_key not in str(created)
    assert raw_key not in str(store.db.get_setting(store.SECRETS, {}))
    assert store._resolve_key(created["provider_id"], created) == raw_key


def test_provider_default_test_and_delete(tmp_path, monkeypatch):
    store = registry(tmp_path, monkeypatch)
    created = store.create(ProviderCreate(display_name="课堂 Mock", provider_type="mock"))
    assert store.set_default(created["provider_id"])["is_default"] is True
    assert store.test(created["provider_id"])["success"] is True
    store.delete(created["provider_id"])
    assert store.get(created["provider_id"]) is None
    assert store.default_id() == "mock"


def test_plaintext_key_is_rejected_without_server_encryption_key(tmp_path, monkeypatch):
    monkeypatch.delenv("AI_PROVIDER_ENCRYPTION_KEY", raising=False)
    store = AIProviderRegistry(Database(tmp_path / "providers.db"))
    try:
        store.create(ProviderCreate(display_name="HKGAI", provider_type="compatible", base_url="https://test-new-api.hkchat.app/v1", model="test-model", api_key="exposed"))
    except RuntimeError as exc:
        assert "不能安全保存" in str(exc)
    else:
        raise AssertionError("plaintext key should not be stored")


def test_provider_api_masks_keys_and_supports_lifecycle(tmp_path, monkeypatch):
    store = registry(tmp_path, monkeypatch)
    monkeypatch.setenv("AI_PROVIDER_ADMIN_TOKEN", "admin-only")
    monkeypatch.setattr(api, "AI_PROVIDER_REGISTRY", store)
    client = TestClient(api.app)
    admin_headers = {"X-AI-Admin-Token": "admin-only"}
    response = client.post("/ai/providers", json={
        "display_name": "HKGAI 课程模型", "provider_type": "compatible",
        "base_url": "https://test-new-api.hkchat.app/v1", "model": "course-model",
        "api_key": "secret-value",
    }, headers=admin_headers)
    assert response.status_code == 201
    provider_id = response.json()["provider_id"]
    assert "secret-value" not in response.text
    assert client.post(f"/ai/providers/{provider_id}/set-default").status_code == 200
    assert client.get(f"/ai/providers/{provider_id}/capabilities").status_code == 200
    assert client.delete(f"/ai/providers/{provider_id}", headers=admin_headers).status_code == 200


def test_public_provider_catalog_exposes_no_key_or_upstream_url(tmp_path, monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "compatible")
    monkeypatch.setenv("OPENAI_BASE_URL", "https://test-new-api.hkchat.app/v1")
    monkeypatch.setenv("AI_MODEL", "hkgai-course-model")
    monkeypatch.setenv("OPENAI_API_KEY", "server-only-key")
    store = AIProviderRegistry(Database(tmp_path / "public-providers.db"))
    monkeypatch.setattr(api, "AI_PROVIDER_REGISTRY", store)
    response = TestClient(api.app).get("/ai/providers", headers={"X-User-ID": "user-a"})
    assert response.status_code == 200
    assert "server-only-key" not in response.text
    for provider in response.json()["providers"]:
        assert "base_url" not in provider
        assert "api_key_masked" not in provider
        assert "secret_source" not in provider


def test_ai_settings_page_exists():
    response = TestClient(api.app).get("/ai-settings")
    assert response.status_code == 200
    assert "API Key 只保存在服务器" in response.text


def test_model_failure_falls_back_without_losing_rule_result():
    class BrokenProvider:
        def generate(self, request): raise RuntimeError("upstream failed")
        def pre_trade_check(self, request): raise RuntimeError("upstream failed")
        def explain_metric(self, request): raise RuntimeError("upstream failed")
        def explain_portfolio(self, request): raise RuntimeError("upstream failed")

    result = FallbackReportGenerator(BrokenProvider()).generate(ReportRequest(total_assets=1, active_positions=1))
    assert result.model_used == "mock-fallback"
    assert result.facts
    assert "不构成任何投资建议" in result.disclaimer


def test_hkgai_environment_is_platform_default_and_never_exposes_key(tmp_path, monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "compatible")
    monkeypatch.setenv("OPENAI_BASE_URL", "https://test-new-api.hkchat.app/v1")
    monkeypatch.setenv("AI_MODEL", "hkgai-course-model")
    monkeypatch.setenv("OPENAI_API_KEY", "new-private-hkgai-key")
    store = AIProviderRegistry(Database(tmp_path / "providers.db"))
    providers = store.list()
    hkgai = next(item for item in providers if item["provider_id"] == "hkgai_main")
    assert hkgai["display_name"] == "HKGAI"
    assert hkgai["secret_status"] == "server_configured"
    assert store.default_id("new-user") == "hkgai_main"
    assert "new-private-hkgai-key" not in str(providers)


def test_user_model_choice_overrides_platform_without_changing_other_users(tmp_path, monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "compatible")
    monkeypatch.setenv("OPENAI_BASE_URL", "https://test-new-api.hkchat.app/v1")
    monkeypatch.setenv("AI_MODEL", "hkgai-course-model")
    monkeypatch.setenv("OPENAI_API_KEY", "server-only")
    store = registry(tmp_path, monkeypatch)
    chosen = store.create(ProviderCreate(display_name="课堂规则版", provider_type="mock"))
    result = store.set_default(chosen["provider_id"], "user-a")
    assert result["success"] is True
    assert store.default_id("user-a") == chosen["provider_id"]
    assert store.default_id("user-b") == "hkgai_main"
    assert store.resolve("user-a")["provider_id"] == chosen["provider_id"]


def test_unconfigured_hkgai_falls_back_to_mock(tmp_path, monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "compatible")
    monkeypatch.setenv("OPENAI_BASE_URL", "https://test-new-api.hkchat.app/v1")
    monkeypatch.delenv("AI_MODEL", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    store = AIProviderRegistry(Database(tmp_path / "providers.db"))
    hkgai = next(item for item in store.list() if item["provider_id"] == "hkgai_main")
    assert hkgai["secret_status"] == "missing"
    assert hkgai["connection_status"] == "missing_configuration"
    assert store.default_id("new-user") == "mock"
    assert store.resolve("new-user")["provider_id"] == "mock"
