import { embedCapabilityText } from "./capability-rag";

export type DecisionKnowledgeDocument = {
  document_id: string;
  knowledge_type: "decision_risk_knowledge";
  title: string;
  content: string;
  keywords: string[];
  source: string;
  version: string;
  updated_at: string;
  limitations: string[];
};

export type DecisionKnowledgeHit = DecisionKnowledgeDocument & {
  score: number;
  why_relevant: string;
};

export const DECISION_KNOWLEDGE_VECTOR_METHOD = {
  id: "hashed-token-64d-v1",
  dimensions: 64,
  tokenizer: "unicode-word-and-bigram",
  similarity: "cosine",
} as const;

const UPDATED_AT = "2026-07-30";
export const DECISION_KNOWLEDGE: DecisionKnowledgeDocument[] = [
  {
    document_id: "decision_price_anchor",
    knowledge_type: "decision_risk_knowledge",
    title: "下跌幅度不等于估值便宜",
    content: "历史价格只描述已经发生的变化。判断是否便宜仍需核实盈利、现金流、估值和下跌原因；跌幅本身不能证明未来会反弹。",
    keywords: ["跌", "反弹", "低点", "便宜", "回本", "成本价"],
    source: "安心看股受控风险知识库",
    version: "1.0",
    updated_at: UPDATED_AT,
    limitations: ["风险解释，不是个股结论", "不预测未来收益"],
  },
  {
    document_id: "decision_source_quality",
    knowledge_type: "decision_risk_knowledge",
    title: "外部说法需要正式来源",
    content: "涉及订单、业绩或重大事项的说法，应优先核对交易所公告、公司公告和定期报告。有限检索中未找到，不等于事件不存在。",
    keywords: ["朋友", "听说", "网上", "群", "消息", "传闻", "订单", "合同", "中标"],
    source: "安心看股受控风险知识库",
    version: "1.0",
    updated_at: UPDATED_AT,
    limitations: ["不能替代公告原文", "未找到不等于证伪"],
  },
  {
    document_id: "decision_concentration",
    knowledge_type: "decision_risk_knowledge",
    title: "集中持仓会放大损失",
    content: "单只股票占比较高时，一次公司或行业事件就可能显著影响整体资产。股票数量多也不必然代表行业分散。",
    keywords: ["重仓", "仓位", "补仓", "集中", "满仓"],
    source: "安心看股受控风险知识库",
    version: "1.0",
    updated_at: UPDATED_AT,
    limitations: ["只解释集中度风险", "不建议具体仓位"],
  },
  {
    document_id: "decision_loss_chasing",
    knowledge_type: "decision_risk_knowledge",
    title: "亏损后的急于回本",
    content: "亏损后立即增加风险暴露，可能把恢复原价的愿望误当成新证据。新的决定仍需独立检查信息、仓位和失效条件。",
    keywords: ["回本", "翻本", "亏损", "补仓", "摊低", "成本"],
    source: "安心看股受控风险知识库",
    version: "1.0",
    updated_at: UPDATED_AT,
    limitations: ["行为提醒，不是心理诊断"],
  },
  {
    document_id: "decision_invalidation",
    knowledge_type: "decision_risk_knowledge",
    title: "先明确判断失效条件",
    content: "失效条件应描述可以观察和核实的变化，例如盈利假设、订单进度或财务指标，而不是只写期待的目标价格。",
    keywords: ["失效", "条件", "持有", "长期", "卖出", "观察"],
    source: "安心看股受控风险知识库",
    version: "1.0",
    updated_at: UPDATED_AT,
    limitations: ["候选条件仍需用户确认"],
  },
];

const cosine = (left: number[], right: number[]) => left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);

export function searchDecisionKnowledge(query: string, limit = 3): DecisionKnowledgeHit[] {
  const normalized = query.trim();
  if (!normalized) return [];
  const queryVector = embedCapabilityText(normalized, DECISION_KNOWLEDGE_VECTOR_METHOD.dimensions);
  return DECISION_KNOWLEDGE.map((document) => {
    const text = `${document.title}\n${document.content}\n${document.keywords.join(" ")}`;
    const semantic = cosine(queryVector, embedCapabilityText(text, DECISION_KNOWLEDGE_VECTOR_METHOD.dimensions));
    const keyword = document.keywords.reduce((score, term) => score + (normalized.includes(term) ? 1 : 0), 0);
    const score = semantic + keyword * 0.75;
    return {
      ...document,
      score: Number(score.toFixed(4)),
      why_relevant: keyword ? `原始理由命中：${document.keywords.filter((term) => normalized.includes(term)).join("、")}` : "与原始理由语义相近",
      lexical_match_count: keyword,
      semantic_score: semantic,
    };
  }).filter((item) => item.lexical_match_count > 0 || item.semantic_score >= 0.7).sort((left, right) => right.score - left.score).slice(0, limit).map(({ lexical_match_count: _lexical, semantic_score: _semantic, ...item }) => item);
}
