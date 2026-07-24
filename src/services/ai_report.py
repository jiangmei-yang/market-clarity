from __future__ import annotations

import os
from abc import ABC, abstractmethod
from typing import Any

from pydantic import BaseModel, Field

DISCLAIMER = "本工具仅用于持仓分析和交易复盘参考，不构成投资建议、收益承诺或买卖建议。"


class ReportRequest(BaseModel):
    total_assets: int = 0
    active_positions: int = 0
    realized_pnl: float | None = None
    total_return: float | None = None
    main_drivers: list[dict[str, Any]] = Field(default_factory=list)
    main_exposures: list[str] = Field(default_factory=list)
    risk_flags: list[dict[str, Any] | str] = Field(default_factory=list)
    suggestion: str = ""
    style: str = "简洁中性"
    max_tokens: int = Field(default=300, ge=80, le=800)


class ReportResponse(BaseModel):
    report: str
    model_used: str
    disclaimer: str = DISCLAIMER


PROMPT = """你是中性的交易复盘助手，不是投资顾问。
只能使用系统计算结果，不得补充行情、持仓、收益或行业事实，不得预测涨跌，不得给出买入、卖出、加仓或减仓指令。
请用{style}写一段不超过{max_tokens}字的复盘报告，先说事实，再说需要复核的信号。最后原样附上免责声明。

系统计算结果：资产数量={total_assets}；当前未平仓标的={active_positions}；已实现收益={realized_pnl}；主要暴露={main_exposures}；风险信号={risk_flags}；系统摘要={suggestion}
"""


class ReportGenerator(ABC):
    @abstractmethod
    def generate(self, request: ReportRequest) -> ReportResponse:
        raise NotImplementedError


def _ensure_disclaimer(text: str) -> str:
    clean = str(text or "").strip()
    return clean if DISCLAIMER in clean else f"{clean}\n\n{DISCLAIMER}".strip()


class MockReportGenerator(ReportGenerator):
    def generate(self, request: ReportRequest) -> ReportResponse:
        exposures = "、".join(request.main_exposures[:5]) or "暂无"
        report = f"本次复盘覆盖 {request.total_assets} 个标的，其中 {request.active_positions} 个仍有未平仓数量。"
        if request.realized_pnl is not None:
            report += f"按导入记录和 FIFO 计算的已实现盈亏为 {request.realized_pnl:.2f} 元。"
        if exposures != "暂无":
            report += f"当前记录中的主要暴露方向为 {exposures}。"
        if request.total_return is not None:
            report += f"统计区间收益率为 {request.total_return:.2%}。"
        if request.main_drivers:
            report += "主要驱动包括：" + "、".join(str(item.get("name", "未知")) for item in request.main_drivers[:4]) + "。"
        if request.risk_flags:
            labels = [flag.get("label", "待复核信号") if isinstance(flag, dict) else str(flag) for flag in request.risk_flags[:4]]
            report += "需要复核的信号包括：" + "、".join(labels) + "。"
        if request.suggestion and not request.risk_flags:
            report += "系统摘要：" + request.suggestion
        return ReportResponse(report=_ensure_disclaimer(report), model_used="mock")


class OpenAIReportGenerator(ReportGenerator):
    def __init__(self, api_key: str, base_url: str | None = None, model: str = "gpt-5.4-mini"):
        from openai import OpenAI
        self.client = OpenAI(api_key=api_key, base_url=base_url or None)
        self.model = model

    def generate(self, request: ReportRequest) -> ReportResponse:
        prompt = PROMPT.format(
            style=request.style, max_tokens=request.max_tokens, total_assets=request.total_assets,
            active_positions=request.active_positions, realized_pnl=request.realized_pnl,
            main_exposures="、".join(request.main_exposures[:6]) or "暂无",
            risk_flags="；".join(str(flag) for flag in request.risk_flags[:6]) or "暂无",
            suggestion=request.suggestion or "暂无",
        )
        result = self.client.responses.create(
            model=self.model,
            input=[
                {"role": "system", "content": "只改写系统计算结果，不创造金融事实。"},
                {"role": "user", "content": prompt},
            ],
            max_output_tokens=request.max_tokens,
        )
        return ReportResponse(report=_ensure_disclaimer(getattr(result, "output_text", "")), model_used=self.model)


def create_report_generator(
    provider: str | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
    model: str | None = None,
) -> ReportGenerator:
    """Create the report backend from env/config, retaining Mock as the safe default.

    ``AI_PROVIDER`` is the documented setting; ``AI_REPORT_PROVIDER`` remains
    supported for backwards compatibility with the original MVP.
    """
    provider = (provider or os.getenv("AI_PROVIDER") or os.getenv("AI_REPORT_PROVIDER") or "mock").strip().lower()
    api_key = api_key or os.getenv("OPENAI_API_KEY")
    base_url = base_url or os.getenv("OPENAI_BASE_URL")
    model = model or os.getenv("AI_MODEL") or os.getenv("OPENAI_MODEL") or "gpt-5.4-mini"

    if provider in {"mock", ""}:
        return MockReportGenerator()
    if provider in {"openai", "compatible"}:
        if not api_key:
            raise ValueError("已选择真实模型，但未配置 OPENAI_API_KEY")
        return OpenAIReportGenerator(api_key, base_url, model)
    raise ValueError(f"不支持的 AI 模型提供商: {provider}")
