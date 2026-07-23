export const PARTICIPANT_SEGMENTS=["投资经验不足1年","ETF或长期持有","近3个月主动交易"] as const;
export type ParticipantSegment=typeof PARTICIPANT_SEGMENTS[number];
export type StudyInput={reviewId:string;testerCode:string;participantSegment:ParticipantSegment;result:"已修改"|"维持计划"|"已延迟";durationSeconds?:number;satisfaction:number;riskUnderstood:boolean;riskExplanation:string;repeatIntent:boolean;paidIntent:boolean;confusingStep?:string;consent:boolean};

function cleanText(value:unknown,label:string,min:number,max:number){const result=String(value??"").trim();if(result.length<min||result.length>max)throw new Error(`${label}长度应为 ${min}–${max} 个字符`);return result;}

export function validateStudyInput(input:StudyInput){
  const reviewId=cleanText(input.reviewId,"审查记录",4,160);
  const testerCode=cleanText(input.testerCode,"匿名编号",2,20).toUpperCase();
  if(!/^[A-Z0-9_-]+$/.test(testerCode))throw new Error("匿名编号只能包含字母、数字、下划线或短横线");
  if(!PARTICIPANT_SEGMENTS.includes(input.participantSegment))throw new Error("请选择符合实际情况的参与者类型");
  if(!["已修改","维持计划","已延迟"].includes(input.result))throw new Error("最终选择无效");
  if(!Number.isInteger(input.satisfaction)||input.satisfaction<1||input.satisfaction>5)throw new Error("请明确选择 1–5 分满意度");
  if(typeof input.riskUnderstood!=="boolean"||typeof input.repeatIntent!=="boolean"||typeof input.paidIntent!=="boolean")throw new Error("请明确回答理解、再次使用和付费测试问题");
  if(input.consent!==true)throw new Error("只有明确同意匿名用于产品体验研究后才能提交");
  return{...input,reviewId,testerCode,riskExplanation:cleanText(input.riskExplanation,"主要风险复述",8,300),confusingStep:String(input.confusingStep??"").trim().slice(0,160)};
}
