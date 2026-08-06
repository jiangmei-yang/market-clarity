from __future__ import annotations

import os
from time import perf_counter
from typing import Any, Literal, Protocol
from uuid import uuid4

from pydantic import BaseModel, Field, HttpUrl, SecretStr, field_validator

from src.database import Database


class LLMProvider(Protocol):
    def generate(self, messages: list[dict[str, str]], options: dict[str, Any]) -> dict[str, Any]: ...


class ProviderCapabilities(BaseModel):
    report: bool = True
    pre_trade_check: bool = True
    metric_explanation: bool = True
    vision: bool = False


class ProviderCreate(BaseModel):
    display_name: str = Field(min_length=1, max_length=80)
    provider_type: Literal["mock", "openai", "compatible"] = "compatible"
    base_url: HttpUrl | None = None
    model: str = Field(default="", max_length=120)
    api_key: SecretStr | None = None
    api_key_env: str | None = Field(default=None, pattern=r"^[A-Z][A-Z0-9_]{2,80}$")
    api_mode: Literal["chat"] = "chat"
    enabled: bool = True
    capabilities: ProviderCapabilities = Field(default_factory=ProviderCapabilities)

    @field_validator("model")
    @classmethod
    def require_model_for_real_provider(cls, value: str, info):
        if info.data.get("provider_type") != "mock" and not value.strip():
            raise ValueError("真实模型需要填写模型名称")
        return value.strip()


class ProviderUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=80)
    base_url: HttpUrl | None = None
    model: str | None = Field(default=None, min_length=1, max_length=120)
    api_key: SecretStr | None = None
    api_key_env: str | None = Field(default=None, pattern=r"^[A-Z][A-Z0-9_]{2,80}$")
    enabled: bool | None = None
    capabilities: ProviderCapabilities | None = None


class AIProviderRegistry:
    """Provider metadata plus encrypted-at-rest API keys.

    Raw keys are accepted only when AI_PROVIDER_ENCRYPTION_KEY contains a valid
    Fernet key. Deployments without it must use an environment variable
    reference such as OPENAI_API_KEY.
    """

    PROVIDERS = "ai_provider_profiles_v1"
    SECRETS = "ai_provider_secrets_v1"
    DEFAULT = "ai_provider_default_v1"
    USER_DEFAULTS = "ai_provider_user_defaults_v1"

    def __init__(self, database: Database | None = None):
        self.db = database or Database()

    def list(self, user_id: str = "default") -> list[dict[str, Any]]:
        rows = self.db.get_setting(self.PROVIDERS, [])
        providers = [self._public(item) for item in rows]
        if not any(item["provider_id"] == "mock" for item in providers):
            providers.insert(0, self._mock())
        environment = self._environment_provider()
        if environment and not any(item["provider_id"] == environment["provider_id"] for item in providers):
            providers.append(environment)
        default = self.default_id(user_id)
        for item in providers:
            item["is_default"] = item["provider_id"] == default
        return providers

    def get(self, provider_id: str) -> dict[str, Any] | None:
        return next((item for item in self.list() if item["provider_id"] == provider_id), None)

    def create(self, payload: ProviderCreate) -> dict[str, Any]:
        provider_id = f"provider_{uuid4().hex[:12]}"
        api_key_ref = self._store_secret(provider_id, payload.api_key) if payload.api_key else None
        if payload.provider_type != "mock" and not api_key_ref and not payload.api_key_env:
            raise ValueError("请提供 API Key，或填写服务器端环境变量名称")
        row = {
            "provider_id": provider_id, "display_name": payload.display_name,
            "provider_type": payload.provider_type, "base_url": str(payload.base_url or ""),
            "model": payload.model, "api_key_ref": api_key_ref,
            "api_key_env": payload.api_key_env, "api_mode": payload.api_mode,
            "enabled": payload.enabled, "capabilities": payload.capabilities.model_dump(),
        }
        rows = self.db.get_setting(self.PROVIDERS, []); rows.append(row)
        self.db.set_setting(self.PROVIDERS, rows)
        return self._public(row)

    def update(self, provider_id: str, payload: ProviderUpdate) -> dict[str, Any]:
        rows = self.db.get_setting(self.PROVIDERS, [])
        index = next((i for i, item in enumerate(rows) if item["provider_id"] == provider_id), None)
        if index is None:
            raise KeyError(provider_id)
        row = dict(rows[index])
        changes = payload.model_dump(exclude_none=True, exclude={"api_key"})
        if "base_url" in changes:
            changes["base_url"] = str(changes["base_url"])
        if "capabilities" in changes and hasattr(changes["capabilities"], "model_dump"):
            changes["capabilities"] = changes["capabilities"].model_dump()
        row.update(changes)
        if payload.api_key:
            row["api_key_ref"] = self._store_secret(provider_id, payload.api_key)
        rows[index] = row; self.db.set_setting(self.PROVIDERS, rows)
        return self._public(row)

    def delete(self, provider_id: str) -> None:
        if provider_id in {"mock", "environment", "hkgai_main", "platform_default"}:
            raise ValueError("内置模型不能删除")
        rows = self.db.get_setting(self.PROVIDERS, [])
        if not any(item["provider_id"] == provider_id for item in rows):
            raise KeyError(provider_id)
        self.db.set_setting(self.PROVIDERS, [item for item in rows if item["provider_id"] != provider_id])
        secrets = self.db.get_setting(self.SECRETS, {}); secrets.pop(provider_id, None); self.db.set_setting(self.SECRETS, secrets)
        if self.default_id() == provider_id:
            self.db.set_setting(self.DEFAULT, "mock")

    def set_default(self, provider_id: str, user_id: str = "default") -> dict[str, Any]:
        provider = self.get(provider_id)
        if not provider:
            raise KeyError(provider_id)
        if not provider["enabled"]:
            raise ValueError("停用的模型不能设为默认")
        if provider["secret_status"] == "missing":
            raise ValueError("该模型尚未完成服务器端配置")
        defaults = self.db.get_setting(self.USER_DEFAULTS, {})
        defaults[str(user_id)] = provider_id
        self.db.set_setting(self.USER_DEFAULTS, defaults)
        provider["is_default"] = True
        return {"success": True, **provider, "message": "默认模型已切换"}

    def default_id(self, user_id: str = "default") -> str:
        defaults = self.db.get_setting(self.USER_DEFAULTS, {})
        selected = str(defaults.get(str(user_id), ""))
        if selected:
            provider = self.get_without_default(selected)
            if provider and provider["enabled"] and provider["secret_status"] != "missing":
                return selected
        legacy = str(self.db.get_setting(self.DEFAULT, ""))
        if legacy:
            provider = self.get_without_default(legacy)
            if provider and provider["enabled"] and provider["secret_status"] != "missing":
                return legacy
        environment = self._environment_provider()
        return environment["provider_id"] if environment and environment["secret_status"] != "missing" else "mock"

    def get_without_default(self, provider_id: str) -> dict[str, Any] | None:
        rows = [self._public(item) for item in self.db.get_setting(self.PROVIDERS, [])]
        rows.append(self._mock())
        environment = self._environment_provider()
        if environment:
            rows.append(environment)
        return next((item for item in rows if item["provider_id"] == provider_id), None)

    def resolve(self, user_id: str = "default", requested_provider_id: str | None = None) -> dict[str, Any]:
        for candidate in (requested_provider_id, self.default_id(user_id)):
            if not candidate:
                continue
            provider = self.get_without_default(candidate)
            if provider and provider["enabled"] and provider["secret_status"] != "missing":
                return provider
        return self._mock()

    def test(self, provider_id: str) -> dict[str, Any]:
        provider = self.get(provider_id)
        if not provider:
            raise KeyError(provider_id)
        start = perf_counter()
        if provider["provider_type"] == "mock":
            return {"success": True, "provider_id": provider_id, "provider": provider["display_name"], "model": "mock", "latency_ms": 0, "message": "本地规则模式可用", "fallback_available": True}
        try:
            key = self._resolve_key(provider_id, provider)
            from openai import OpenAI
            client = OpenAI(api_key=key, base_url=provider["base_url"] or None, timeout=12)
            client.chat.completions.create(
                model=provider["model"],
                messages=[{"role": "user", "content": "请只回复：连接成功"}],
                max_tokens=12, temperature=0,
            )
            latency = round((perf_counter() - start) * 1000)
            return {"success": True, "provider_id": provider_id, "provider": provider["display_name"], "model": provider["model"], "latency_ms": latency, "message": "连接成功", "fallback_available": True}
        except Exception:
            latency = round((perf_counter() - start) * 1000)
            return {"success": False, "provider_id": provider_id, "provider": provider["display_name"], "model": provider["model"], "latency_ms": latency, "message": f"{provider['display_name']} 当前连接失败。可以重试、切换模型或继续使用规则版结果。", "fallback_available": True}

    def _store_secret(self, provider_id: str, secret: SecretStr) -> str:
        key = os.getenv("AI_PROVIDER_ENCRYPTION_KEY", "").strip()
        if not key:
            raise RuntimeError("服务器未配置 AI_PROVIDER_ENCRYPTION_KEY，不能安全保存 API Key；请改用环境变量引用")
        from cryptography.fernet import Fernet
        token = Fernet(key.encode()).encrypt(secret.get_secret_value().encode()).decode()
        secrets = self.db.get_setting(self.SECRETS, {}); secrets[provider_id] = token; self.db.set_setting(self.SECRETS, secrets)
        return f"secret_{provider_id}"

    def _resolve_key(self, provider_id: str, provider: dict[str, Any]) -> str:
        env_name = provider.get("api_key_env")
        if env_name:
            value = os.getenv(str(env_name), "")
            if not value:
                raise ValueError("服务器端环境变量尚未配置")
            return value
        token = self.db.get_setting(self.SECRETS, {}).get(provider_id)
        key = os.getenv("AI_PROVIDER_ENCRYPTION_KEY", "").strip()
        if not token or not key:
            raise ValueError("没有可用的服务器端密钥")
        from cryptography.fernet import Fernet
        return Fernet(key.encode()).decrypt(token.encode()).decode()

    @staticmethod
    def _public(row: dict[str, Any]) -> dict[str, Any]:
        secret_status = "not_required" if row["provider_type"] == "mock" else "server_configured" if row.get("api_key_ref") or (row.get("api_key_env") and os.getenv(str(row.get("api_key_env")))) else "missing"
        return {
            "provider_id": row["provider_id"], "display_name": row["display_name"],
            "provider_type": row["provider_type"], "base_url": row.get("base_url", ""),
            "model": row.get("model", ""), "api_mode": row.get("api_mode", "chat"),
            "enabled": bool(row.get("enabled", True)), "is_default": False,
            "api_key_masked": "••••••••" if row.get("api_key_ref") or row.get("api_key_env") else "未配置",
            "secret_source": "environment" if row.get("api_key_env") else "encrypted" if row.get("api_key_ref") else "none",
            "secret_status": secret_status,
            "connection_status": "available" if secret_status != "missing" else "missing_configuration",
            "capabilities": row.get("capabilities", ProviderCapabilities().model_dump()),
        }

    @staticmethod
    def _mock() -> dict[str, Any]:
        return {"provider_id": "mock", "display_name": "本地规则模式", "provider_type": "mock", "base_url": "", "model": "mock", "api_mode": "chat", "enabled": True, "is_default": False, "api_key_masked": "不需要", "secret_source": "none", "secret_status": "not_required", "connection_status": "available", "capabilities": ProviderCapabilities().model_dump()}

    @staticmethod
    def _environment_provider() -> dict[str, Any] | None:
        provider = os.getenv("AI_PROVIDER", "mock").strip().lower()
        if provider not in {"openai", "compatible"}:
            return None
        base_url = os.getenv("OPENAI_BASE_URL", "")
        is_hkgai = "hkchat.app" in base_url or os.getenv("AI_DISPLAY_NAME", "").strip().lower() == "hkgai"
        configured = bool(os.getenv("OPENAI_API_KEY") and os.getenv("AI_MODEL"))
        return {"provider_id": "hkgai_main" if is_hkgai else "platform_default", "display_name": "HKGAI" if is_hkgai else os.getenv("AI_DISPLAY_NAME", "平台环境模型"), "provider_type": provider, "base_url": base_url, "model": os.getenv("AI_MODEL", ""), "api_mode": os.getenv("AI_API_MODE", "chat"), "enabled": True, "is_default": False, "api_key_masked": "••••••••" if configured else "未配置", "secret_source": "environment", "secret_status": "server_configured" if configured else "missing", "connection_status": "available" if configured else "missing_configuration", "capabilities": ProviderCapabilities().model_dump()}
