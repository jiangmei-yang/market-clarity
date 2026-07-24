from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Callable, Iterable, Literal

import pandas as pd
from pydantic import BaseModel, Field

from src.data_providers.base import DataResult


IMPORTANT_TERMS = (
    "订单", "合同", "中标", "合作", "回购", "增持", "减持", "分红", "业绩", "利润", "营收",
    "处罚", "调查", "诉讼", "停牌", "复牌", "裁员", "涨价", "降价", "产能", "销量", "现金流",
)
OPINION_MARKERS = ("观点", "解读", "点评", "研报", "分析师", "机构看", "目标价", "股吧", "预测")
OFFICIAL_MARKERS = ("巨潮资讯", "上海证券交易所", "深圳证券交易所", "北京证券交易所", "公司公告")
COMPANY_PREFIXES = ("中国", "贵州", "上海", "深圳", "北京", "江苏", "浙江", "广东", "山东", "四川")
EVENT_FAMILIES = (
    ("价格调整", ("涨价", "降价", "调价", "上调", "下调", "提价", "零售价", "合同价")),
    ("订单合作", ("订单", "合同", "中标", "合作")),
    ("业绩财务", ("业绩", "利润", "营收", "现金流", "预增", "预亏")),
    ("股东资本", ("回购", "增持", "减持", "分红", "解禁")),
    ("监管风险", ("处罚", "调查", "立案", "诉讼", "问询")),
)


def _safe_text(value, limit: int = 240) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()[:limit]


def _title_key(title: str) -> str:
    return re.sub(r"[^0-9a-z\u4e00-\u9fff]", "", title.lower())


def _reason_terms(reason: str, name: str, code: str) -> set[str]:
    # The feed is already scoped to one stock. Entity names/codes therefore do
    # not count as support for the user's specific claim.
    terms = {term for term in IMPORTANT_TERMS if term in reason}
    terms |= set(re.findall(r"[A-Za-z]{2,}|\d{6}", reason))
    return terms


def _entity_terms(name: str, code: str) -> set[str]:
    terms = {code, name}
    for prefix in COMPANY_PREFIXES:
        if name.startswith(prefix) and len(name) - len(prefix) >= 2:
            terms.add(name[len(prefix):])
    return {term for term in terms if term}


def _event_key(item: dict) -> str:
    title_key = _title_key(item.get("title", ""))
    if item.get("category") == "正式披露":
        return title_key
    combined = f'{item.get("title", "")} {item.get("summary", "")}'
    for family, terms in EVENT_FAMILIES:
        if any(term in combined for term in terms):
            return f'{item.get("category", "")}:{str(item.get("published_at", ""))[:10]}:{family}'
    return title_key


def _news_category(source: str, title: str, url: str) -> str:
    source_reference = f"{source} {url}"
    if any(marker in source_reference for marker in OFFICIAL_MARKERS) or "cninfo.com.cn" in url:
        return "正式披露"
    if any(marker in f"{source} {title}" for marker in OPINION_MARKERS):
        return "市场观点"
    return "媒体报道"


def _timestamp(value) -> datetime | None:
    parsed = pd.to_datetime(value, errors="coerce")
    if pd.isna(parsed):
        return None
    if getattr(parsed, "tzinfo", None) is not None:
        parsed = parsed.tz_localize(None)
    return parsed.to_pydatetime()


def build_information_feed(
    *,
    code: str,
    name: str,
    reason: str,
    news: DataResult,
    announcements: DataResult,
    now: datetime | None = None,
    max_age_days: int = 30,
    limit: int = 20,
) -> dict:
    """Build a bounded, source-labelled feed; never infer that a story is true."""
    current = now or datetime.now()
    cutoff = current - timedelta(days=max_age_days)
    reason_terms = _reason_terms(reason, name, code)
    entity_terms = _entity_terms(name, code)
    candidates: list[dict] = []

    announcement_frame = announcements.data if isinstance(announcements.data, pd.DataFrame) else pd.DataFrame()
    for row in announcement_frame.to_dict("records"):
        published = _timestamp(row.get("date"))
        if not published or published < cutoff:
            continue
        title = _safe_text(row.get("title"), 180)
        matched = sorted(term for term in reason_terms if term and term in title)
        age_hours = max(0.0, (current - published).total_seconds() / 3600)
        candidates.append({
            "published_at": published.isoformat(timespec="minutes"), "title": title,
            "summary": _safe_text(row.get("category") or "公司公告", 120),
            "source": announcements.source, "url": _safe_text(row.get("url"), 500),
            "category": "正式披露", "matched_terms": matched,
            "relation": f"与交易理由中的“{'、'.join(matched)}”相关，仍需阅读公告原文。" if matched else "公司正式披露，建议优先阅读原文。",
            "relevance_score": 10 + len(matched) * 4 + max(0, 3 - age_hours / 168),
            "is_demo": announcements.is_demo,
        })

    news_frame = news.data if isinstance(news.data, pd.DataFrame) else pd.DataFrame()
    for row in news_frame.to_dict("records"):
        published = _timestamp(row.get("published_at"))
        if not published or published < cutoff:
            continue
        title = _safe_text(row.get("title"), 180)
        summary = _safe_text(row.get("summary"), 220)
        source = _safe_text(row.get("source") or news.source, 100)
        url = _safe_text(row.get("url"), 500)
        combined = f"{title} {summary}"
        matched = sorted(term for term in reason_terms if term and term in combined)
        category = _news_category(source, title, url)
        # Stock news aggregators often return broad market stories that only
        # mention the company incidentally in the body. Keep those only when
        # they match the user's actual claim; otherwise require the company
        # name, a stable alias, or its code in the title.
        entity_in_title = any(term in title for term in entity_terms)
        if category != "正式披露" and not entity_in_title and not matched:
            continue
        age_hours = max(0.0, (current - published).total_seconds() / 3600)
        candidates.append({
            "published_at": published.isoformat(timespec="minutes"), "title": title,
            "summary": summary, "source": source, "url": url, "category": category,
            "matched_terms": matched,
            "relation": f"与交易理由中的“{'、'.join(matched)}”有关键词关联，不能据此确认因果或真实性。" if matched else "近期公开信息，未发现与交易理由的直接关键词匹配。",
            "relevance_score": (6 if category == "正式披露" else 2 if category == "媒体报道" else 1) + len(matched) * 4 + max(0, 3 - age_hours / 168),
            "is_demo": news.is_demo,
        })

    deduped: dict[str, dict] = {}
    for item in candidates:
        key = _event_key(item)
        if not key:
            continue
        previous = deduped.get(key)
        if previous is None:
            item["corroborating_sources"] = [item["source"]] if item.get("source") else []
            deduped[key] = item
            continue
        sources = set(previous.get("corroborating_sources", [])) | set(item.get("corroborating_sources", []))
        if previous.get("source"):
            sources.add(previous["source"])
        if item.get("source"):
            sources.add(item["source"])
        chosen = dict(item if item["relevance_score"] > previous["relevance_score"] else previous)
        chosen["corroborating_sources"] = sorted(sources)
        if len(sources) > 1:
            chosen["relation"] = f'{chosen["relation"]} 同一事件另有 {len(sources) - 1} 个独立来源报道。'
        deduped[key] = chosen
    items = sorted(
        deduped.values(),
        key=lambda item: (-item["relevance_score"], -datetime.fromisoformat(item["published_at"]).timestamp()),
    )[:limit]
    for item in items:
        item.pop("relevance_score", None)
    messages = [message for message in (announcements.message, news.message) if message]
    feed_sources = set()
    for item in items:
        if item.get("source"):
            feed_sources.add(item["source"])
        feed_sources.update(source for source in item.get("corroborating_sources", []) if source)
    return {
        "items": items,
        "updated_at": max(news.updated_at, announcements.updated_at).isoformat(timespec="seconds"),
        "sources": sorted(feed_sources),
        "is_demo": news.is_demo or announcements.is_demo,
        "data_mode": "demo" if news.is_demo and announcements.is_demo else "mixed" if news.is_demo or announcements.is_demo else "live",
        "message": " ".join(messages),
        "coverage_days": max_age_days,
    }


def filter_information_items(items: Iterable[dict], hours: int, now: datetime | None = None, limit: int = 5) -> list[dict]:
    current = now or datetime.now()
    cutoff = current - timedelta(hours=hours)
    selected = []
    for item in items:
        published = _timestamp(item.get("published_at"))
        if published and published >= cutoff:
            selected.append(item)
    return selected[:limit]


class InformationAssessment(BaseModel):
    status: Literal[
        "找到相关正式披露",
        "有相关报道但未获正式披露确认",
        "未找到直接相关信息",
        "资料不足",
    ]
    summary: str
    key_points: list[str] = Field(default_factory=list, max_length=3)
    evidence_indices: list[int] = Field(default_factory=list)
    mode: Literal["rules", "openai"] = "rules"


class RuleInformationAnalyzer:
    def analyze(self, reason: str, feed: dict) -> InformationAssessment:
        items = list(feed.get("items", []))
        if not items:
            return InformationAssessment(
                status="资料不足",
                summary="当前数据源没有返回可用资料。这不代表相关事件不存在，可以稍后刷新或查看正式披露平台。",
            )
        relevant = [(index, item) for index, item in enumerate(items, 1) if item.get("matched_terms")]
        if not relevant:
            return InformationAssessment(
                status="未找到直接相关信息",
                summary="当前检索范围内没有发现与交易理由直接匹配的公开信息。这不是对事实不存在的证明。",
            )
        official = [(index, item) for index, item in relevant if item.get("category") == "正式披露"]
        chosen = (official or relevant)[:3]
        status = "找到相关正式披露" if official else "有相关报道但未获正式披露确认"
        summary = (
            "检索到与交易理由相关的正式披露，请阅读原文核对具体范围、金额和生效条件。"
            if official else
            "检索到相关媒体报道或市场观点，但当前资料中没有相应正式披露可以交叉确认。"
        )
        return InformationAssessment(
            status=status,
            summary=summary,
            key_points=[f"[{index}] {item['title']}（{item['category']}）" for index, item in chosen],
            evidence_indices=[index for index, _ in chosen],
        )


class OpenAIInformationAnalyzer:
    def __init__(self, api_key: str, model: str = "gpt-5.4-mini"):
        from openai import OpenAI
        self.client = OpenAI(api_key=api_key)
        self.model = model

    def analyze(self, reason: str, feed: dict) -> InformationAssessment:
        bounded_items = []
        for index, item in enumerate(feed.get("items", [])[:5], 1):
            bounded_items.append({
                "index": index,
                "published_at": item.get("published_at", ""),
                "title": _safe_text(item.get("title"), 180),
                "summary": _safe_text(item.get("summary"), 220),
                "source": _safe_text(item.get("source"), 100),
                "category": item.get("category", "媒体报道"),
                "matched_terms": item.get("matched_terms", []),
            })
        system = """你是公开信息证据整理器，不是投顾。只能使用输入中的编号资料，不能使用记忆补充事实，不能预测涨跌或推荐买卖。正式披露、媒体报道、市场观点必须区分。未检索到信息不等于事件不存在。每个要点都必须对应 evidence_indices；没有证据时不得作肯定结论。输出简洁中文。"""
        response = self.client.responses.parse(
            model=self.model,
            input=[
                {"role": "system", "content": system},
                {"role": "user", "content": str({"交易理由": reason, "检索资料": bounded_items})},
            ],
            text_format=InformationAssessment,
        )
        parsed = response.output_parsed
        valid_indices = set(range(1, len(bounded_items) + 1))
        parsed.evidence_indices = [index for index in parsed.evidence_indices if index in valid_indices]
        parsed.mode = "openai"
        return parsed


class SafeInformationAnalyzer:
    def __init__(self, api_key: str | None = None, model: str = "gpt-5.4-mini", on_error: Callable[[Exception], None] | None = None):
        self.rules = RuleInformationAnalyzer()
        self.ai = OpenAIInformationAnalyzer(api_key, model) if api_key else None
        self.on_error = on_error

    def analyze(self, reason: str, feed: dict) -> InformationAssessment:
        if self.ai:
            try:
                return self.ai.analyze(reason, feed)
            except Exception as exc:
                if self.on_error:
                    self.on_error(exc)
        return self.rules.analyze(reason, feed)
