import assert from "node:assert/strict";
import test from "node:test";
import {validateStudyInput} from "../app/lib/user-study-validation.ts";

const valid={reviewId:"review-1",testerCode:"u-01",participantSegment:"投资经验不足1年",result:"已修改",durationSeconds:90,satisfaction:3,riskUnderstood:true,riskExplanation:"计划后的单股仓位超过了我自己设定的上限",repeatIntent:false,paidIntent:false,confusingStep:"证据核实入口不明显",consent:true};

test("accepts only explicit neutral user-study answers",()=>{
  const result=validateStudyInput(valid);
  assert.equal(result.testerCode,"U-01");
  assert.equal(result.satisfaction,3);
  assert.equal(result.repeatIntent,false);
});

test("rejects missing consent, default-like omissions and empty risk restatements",()=>{
  assert.throws(()=>validateStudyInput({...valid,consent:false}),/明确同意/);
  assert.throws(()=>validateStudyInput({...valid,satisfaction:undefined}),/明确选择/);
  assert.throws(()=>validateStudyInput({...valid,riskUnderstood:undefined}),/明确回答/);
  assert.throws(()=>validateStudyInput({...valid,riskExplanation:"仓位高"}),/8–300/);
});
