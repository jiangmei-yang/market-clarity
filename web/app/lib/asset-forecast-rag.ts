import { embedCapabilityText } from "./capability-rag";

export type AssetForecastKnowledgeDocument = {
  document_id: string;
  knowledge_type: "asset_forecast_method";
  title: string;
  content: string;
  signals: string[];
  source: {
    name: string;
    url: string;
    published_at: string;
  };
  version: string;
  limitations: string[];
};

export type AssetForecastKnowledgeHit = AssetForecastKnowledgeDocument & {
  score: number;
  why_relevant: string;
};

export const ASSET_FORECAST_VECTOR_METHOD = {
  id: "hashed-token-64d-v1",
  dimensions: 64,
  tokenizer: "unicode-word-and-bigram",
  similarity: "cosine",
  retrieval: "hybrid-semantic-lexical",
} as const;

const DOCUMENTS: AssetForecastKnowledgeDocument[] = [
  {
    document_id: "forecast_disclosure_quality",
    knowledge_type: "asset_forecast_method",
    title: "法定披露优先于传闻",
    content: "预测中的订单、业绩和重大事项只能在法定披露支持的范围内使用。传闻或标题命中不能当作事件已经发生；没有检索到也不等于事件不存在。",
    signals: ["公告", "订单", "合同", "中标", "业绩", "传闻", "朋友", "消息"],
    source: {
      name: "中国证监会《上市公司信息披露管理办法》",
      url: "https://www.csrc.gov.cn/csrc/c101953/c7547359/content.shtml",
      published_at: "2025-03-26",
    },
    version: "1.0",
    limitations: ["规范信息来源优先级，不提供收益预测", "标题检索不能替代公告原文"],
  },
  {
    document_id: "forecast_financial_quality",
    knowledge_type: "asset_forecast_method",
    title: "盈利变化需要现金流和资产负债表交叉检查",
    content: "收入或利润增长应与经营现金流、应收账款、存货和负债变化一起解释。单一报告期可能受季节性和累计口径影响，不能直接外推为未来收益。缺少行业基准时不能用单一负债率判断风险，金融企业的资产负债结构尤其不能套用普通工业企业阈值。",
    signals: ["收入", "利润", "现金流", "应收", "存货", "负债", "财报", "增长", "银行", "金融"],
    source: {
      name: "中国证监会财务报告一般规定",
      url: "https://www.csrc.gov.cn/csrc/c100028/c1002920/content.shtml",
      published_at: "2007-12-17",
    },
    version: "1.0",
    limitations: ["财务勾稽不是盈利预测", "需要同行和历史口径才能作相对判断"],
  },
  {
    document_id: "forecast_price_regime",
    knowledge_type: "asset_forecast_method",
    title: "价格趋势是条件信号而不是确定方向",
    content: "历史研究记录了跨资产时间序列动量，但历史趋势可能反转。短中期路径应同时考虑近期收益、波动率、回撤、均线、真实波幅、成交量和蜡烛实体/影线，并扩大压力情景而不是机械延长趋势。",
    signals: ["趋势", "上涨", "下跌", "反弹", "动量", "均线", "波动", "回撤", "成交量", "影线", "ATR"],
    source: {
      name: "Moskowitz, Ooi and Pedersen, Time Series Momentum",
      url: "https://w4.stern.nyu.edu/facdir/lpederse/papers/TimeSeriesMomentum.pdf",
      published_at: "2012-05-01",
    },
    version: "1.0",
    limitations: ["论文研究跨资产组合，不保证适用于单只 A 股", "过去趋势不能证明未来延续"],
  },
  {
    document_id: "forecast_common_risk",
    knowledge_type: "asset_forecast_method",
    title: "个股收益包含共同风险和公司特有噪声",
    content: "市场、规模和价值等共同风险可以解释部分收益差异，但单只股票仍有大量公司特有不确定性。缺少基准和同行数据时应降低置信度，不能把模型输出称为目标价。",
    signals: ["估值", "市盈率", "市净率", "市场", "行业", "风险", "个股", "收益"],
    source: {
      name: "Fama and French, Common Risk Factors in the Returns on Stocks and Bonds",
      url: "https://people.duke.edu/~charvey/Teaching/BA453_2004/FF_Common_risk.pdf",
      published_at: "1993-02-01",
    },
    version: "1.0",
    limitations: ["因子解释不等于单股择时能力", "当前系统未取得完整 A 股因子暴露"],
  },
  {
    document_id: "forecast_scenario_calibration",
    knowledge_type: "asset_forecast_method",
    title: "用分布和反证条件表达预测",
    content: "预测应输出压力、基准和改善情景，并给出概率、逐期限累计变化、主要驱动和可观察反证。数据缺失越多、期限越长，区间应越宽且置信度应越低。",
    signals: ["预测", "未来", "情景", "概率", "置信度", "期限", "目标价"],
    source: {
      name: "Market Clarity 受控预测方法",
      url: "internal://asset-forecast-method/scenario-calibration",
      published_at: "2026-07-30",
    },
    version: "1.0",
    limitations: ["方法用于表达不确定性，不提高数据本身的质量", "概率是模型条件判断，不是统计保证"],
  },
];

const cosine = (left: number[], right: number[]) => left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);

export function searchAssetForecastKnowledge(query: string, limit = 4): AssetForecastKnowledgeHit[] {
  const normalized = query.trim();
  if (!normalized) return [];
  const queryVector = embedCapabilityText(normalized, ASSET_FORECAST_VECTOR_METHOD.dimensions);
  return DOCUMENTS.map((document) => {
    const searchable = `${document.title}\n${document.content}\n${document.signals.join(" ")}`;
    const semanticScore = cosine(queryVector, embedCapabilityText(searchable, ASSET_FORECAST_VECTOR_METHOD.dimensions));
    const matched = document.signals.filter((signal) => normalized.includes(signal));
    return {
      ...document,
      score: Number((semanticScore + matched.length * 0.7).toFixed(4)),
      why_relevant: matched.length ? `命中当前信息：${matched.join("、")}` : "与当前预测任务的方法语义相近",
      semanticScore,
      lexicalMatchCount: matched.length,
    };
  })
    .filter((item) => item.lexicalMatchCount > 0 || item.semanticScore >= 0.68)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ semanticScore: _semantic, lexicalMatchCount: _lexical, ...item }) => item);
}
