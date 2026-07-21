from __future__ import annotations

import re

import pandas as pd

from .models import Claim, EvidenceItem


KNOWLEDGE = [
    {
        "id": "price_anchor",
        "title": "下跌幅度不等于估值便宜",
        "keywords": {"跌", "反弹", "到底", "便宜", "回本", "低点"},
        "text": "历史价格只能描述已经发生的变化。判断是否便宜仍需要核实盈利、现金流、估值和导致下跌的原因；下跌幅度本身不能证明未来会反弹。",
    },
    {
        "id": "source_quality",
        "title": "信息来源可信度",
        "keywords": {"朋友", "听说", "网上", "小红书", "群", "订单", "消息", "传闻"},
        "text": "涉及订单、业绩或重大事项的说法，应优先核对交易所公告、公司公告和正式定期报告。未在有限资料中找到，不等于事件一定不存在。",
    },
    {
        "id": "concentration",
        "title": "集中持仓会放大损失",
        "keywords": {"重仓", "仓位", "补仓", "集中", "满仓"},
        "text": "当单只股票或单一行业占比较高时，一次公司或行业事件就可能显著影响整体资产。股票数量多并不必然代表行业分散。",
    },
    {
        "id": "loss_chasing",
        "title": "亏损后的急于回本",
        "keywords": {"回本", "翻本", "亏损", "补仓", "摊低", "成本"},
        "text": "亏损之后立即增加风险暴露，可能把恢复原价的愿望误当成新的投资证据。新决定仍应独立检查信息、仓位和失效条件。",
    },
    {
        "id": "invalidation",
        "title": "先写下判断失效条件",
        "keywords": {"失效", "条件", "持有", "长期", "卖出"},
        "text": "判断失效条件应描述可以观察和核实的变化，例如盈利假设、订单进度或财务指标，而不是只写一个期待的目标价格。",
    },
]


def _tokens(text: str) -> set[str]:
    text = str(text or "").lower()
    words = set(re.findall(r"[a-z0-9_]+", text))
    return words | {char for char in text if "\u4e00" <= char <= "\u9fff"}


class KnowledgeRetriever:
    """Small, auditable retrieval layer for the controlled MVP knowledge base."""

    def retrieve(self, query: str, limit: int = 2) -> list[EvidenceItem]:
        query_tokens = _tokens(query)
        scored = []
        for doc in KNOWLEDGE:
            score = sum(2 for kw in doc["keywords"] if kw in query) + len(query_tokens & _tokens(doc["title"]))
            if score:
                scored.append((score, doc))
        scored.sort(key=lambda item: (-item[0], item[1]["id"]))
        return [
            EvidenceItem(
                topic=query,
                status="找到相关说明",
                title=doc["title"],
                excerpt=doc["text"],
                source="安心看股受控风险知识库",
            )
            for _, doc in scored[:limit]
        ]

    def evidence_for_claims(self, claims: list[Claim], reason: str) -> list[EvidenceItem]:
        items = self.retrieve(reason, limit=3)
        for claim in claims:
            if claim.type == "unverified_external_claim":
                items.append(EvidenceItem(
                    topic=claim.text,
                    status="未找到正式支持",
                    title="当前有限资料没有确认这项说法",
                    excerpt="课堂 MVP 未连接完整公告库。请到交易所公告、公司公告或定期报告继续核实；这里的‘未找到’不能解释为‘已经证伪’。",
                    source="有限资料覆盖说明",
                ))
        seen, result = set(), []
        for item in items:
            key = (item.title, item.topic)
            if key not in seen:
                seen.add(key); result.append(item)
        return result

    def verify_disclosures(
        self,
        claims: list[Claim],
        announcements: pd.DataFrame,
        source: str,
        *,
        is_demo: bool = False,
        message: str = "",
    ) -> list[EvidenceItem]:
        """Compare unverified claims with announcement titles without overclaiming."""
        external = [claim for claim in claims if claim.type == "unverified_external_claim"]
        if not external:
            return []
        frame = announcements if isinstance(announcements, pd.DataFrame) else pd.DataFrame()
        title_text = frame.get("title", pd.Series(dtype=str)).fillna("").astype(str)
        terms = ("订单", "合同", "中标", "合作", "收购", "增持", "减持", "回购", "业绩", "利润", "营收", "分红", "诉讼", "处罚", "停牌", "复牌")
        results = []
        for claim in external:
            keywords = [term for term in terms if term in claim.text]
            matches = frame[title_text.apply(lambda title: any(term in title for term in keywords))] if keywords and not frame.empty else frame.iloc[0:0]
            if is_demo:
                demo_title = "演示公告标题中未找到相关披露" if matches.empty else "演示资料中有相关标题"
                results.append(EvidenceItem(
                    topic=claim.text, status="资料不足", title=demo_title,
                    excerpt=(message + " " if message else "") + "演示资料不能用于确认或否定这项说法。",
                    source=source,
                ))
            elif not matches.empty:
                row = matches.iloc[0]
                results.append(EvidenceItem(
                    topic=claim.text, status="找到可能相关披露", title=str(row["title"]),
                    excerpt="公告标题与说法包含相近关键词。请打开原文核对金额、时间、交易对手和生效条件；仅凭标题不能确认说法成立。",
                    source=source, published_at=pd.to_datetime(row["date"]).date().isoformat(), url=str(row.get("url", "")),
                ))
            else:
                results.append(EvidenceItem(
                    topic=claim.text, status="未找到正式支持", title="检索范围内未找到标题匹配",
                    excerpt=(message + " " if message else "") + "未匹配不等于事件不存在，也不代表已经证伪；请继续核对交易所公告和公告全文。",
                    source=source,
                ))
        return results
