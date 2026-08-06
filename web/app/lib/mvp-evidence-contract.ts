export const MVP_EVIDENCE_CONTRACT = {
  version: "strategy-lab-mvp-2026-07-31.2",
  targetUser: "不懂量化、但希望用历史数据检验一个投资想法或稳定性目标的普通 A 股投资者",
  criticalAssumption: "普通投资者能用一句大白话启动研究，确认系统整理的规则，看懂统一比较为什么保留或淘汰候选，并把一个结果保存为以后可重检的研究方法，而不会误以为这是荐股或未来预测。",
  observableBehavior: "外部新手在无主持人指路时完成“描述—确认—运行—比较—保存”，正确回答固定参照、锁定测试和历史边界三题，并有至少 40% 在 14 天后自然回来重检。",
  experiment: "先让 5 位外部新手完成同一无引导任务，修复重复障碍；再扩到三类目标用户各 5 位，并观察 14 天自然复访。团队成员与代理测试只用于排错。",
  verticalSlice: [
    "用想法或目标进入策略研究",
    "确认股票范围、规则、成本与比较标准",
    "运行受控候选与传统参照的统一三段检验",
    "看懂保留/淘汰原因并选择一个单独策略",
    "保存为可重检、可复制的研究方法",
  ],
  primaryMetric: {
    id: "external_saved_research_method_rate",
    label: "外部新手独立保存研究方法率",
    threshold: "首轮 5/5 能完成；扩展样本至少 15 人且完成率 ≥80%",
  },
  guardrails: [
    { id: "quality", label: "理解质量", threshold: "≥80% 在保存后三题全部答对；无提示复述另作质性访谈" },
    { id: "reliability", label: "流程可靠性", threshold: "中位完成时间 ≤5 分钟；放弃、失败与重试分开报告" },
    { id: "economics_risk", label: "成本与风险", threshold: "P95 运行 ≤10 秒；0 次自动交易；0 个 P0 安全事故" },
  ],
  releaseBoundary: {
    audience: "登录后的受邀体验者；先 5 位设计伙伴，再 15 人邀请测试",
    allowedTask: "只研究受控低频策略；不荐股、不预测、不连接券商",
    data: "行为事件不保存输入正文、股票清单、金额或身份资料",
    humanControl: "用户确认规则、选择单个策略并主动保存；系统不替用户作投资决定",
    fallback: "模型不可用时回退白名单规则；数据或计算失败时明确停止并允许重试",
    owner: "产品负责人负责招募、事故记录和下一轮 Persist/Narrow/Pivot/Stop 决策",
  },
  decisionRules: [
    { id: "persist", label: "继续", condition: "主指标与三类护栏全部通过", action: "进入 20 人邀请测试，不扩大策略自由度或交易权限" },
    { id: "narrow", label: "收窄", condition: "仅一个入口或用户分群通过", action: "只保留该入口或分群并复测" },
    { id: "pivot", label: "转向", condition: "用户能跑完但看不懂比较、没有保存或自然复访", action: "重做价值呈现和任务，不继续增加因子" },
    { id: "stop", label: "停止", condition: "15 位外部用户后无分群达到 60%，或出现不可接受安全风险", action: "停止当前方向并保存失败证据" },
  ],
  evidenceSources: [
    "Module 7 p.51：Intent / Context / Output / Control / Evidence / Recovery",
    "Module 8 p.20-23：端到端纵向切片与可重建运行契约",
    "Module 8 p.29-36：受控发布、失败控制与追踪",
    "Module 8 p.37-44：行为指标、护栏、决策规则与 Evidence Contract",
  ],
} as const;

export type StrategyLabEvidenceSummary={participants:number;started:number;saved:number;firstFiveSaved:number;revisited:number;comprehensionPassed:number;completionSeconds:number|null;p95RunSeconds:number|null;safetyIncidents:number|null;safetyReviewed:boolean;segments:Record<string,number>};
export function evaluateStrategyLabMvpEvidence(study:StrategyLabEvidenceSummary){
  const savedRate=study.started?study.saved/study.started:0;const understandingRate=study.participants?study.comprehensionPassed/study.participants:0;const requiredRevisits=Math.ceil(study.participants*.4);
  const gates={
    firstCohort:study.participants>=5&&study.firstFiveSaved===5,
    primary:study.participants>=15&&savedRate>=.8,
    cohortCoverage:["投资经验不足1年","ETF或长期持有","近3个月主动交易"].every(segment=>(study.segments[segment]??0)>=5),
    understanding:understandingRate>=.8,
    completionTime:study.completionSeconds!==null&&study.completionSeconds<=300,
    runLatency:study.p95RunSeconds!==null&&study.p95RunSeconds<=10,
    revisit:study.revisited>=requiredRevisits,
    safety:study.safetyReviewed&&study.safetyIncidents===0,
  };
  return {ready:Object.values(gates).every(Boolean),gates,savedRate,understandingRate,requiredRevisits};
}

export function isPilotReleaseEnabled(value = process.env.MVP_PILOT_ENABLED) {
  return value?.trim().toLowerCase() === "true";
}
