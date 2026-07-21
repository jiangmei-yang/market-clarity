const { request } = require('../../utils/api')
Page({
  data: { types: ['observable_fact','unverified_external_claim','prediction_or_inference','emotion_or_motivation'], typeNames: ['可验证事实','未核实外部信息','主观推断','情绪或紧迫性表达'], loading: false },
  onShow() {
    const p = wx.getStorageSync('pendingDecision')
    const claims = p.analysis.claims.map(x => ({ ...x, typeLabel: this.data.typeNames[this.data.types.indexOf(x.type)] }))
    this.setData({ plan: p.plan, claims, analysis: { ...p.analysis, claims } })
  },
  edit(e) { this.setData({ [`plan.${e.currentTarget.dataset.key}`]: e.detail.value }) },
  changeType(e) {
    const index = Number(e.currentTarget.dataset.index)
    const typeIndex = Number(e.detail.value)
    this.setData({ [`claims[${index}].type`]: this.data.types[typeIndex], [`claims[${index}].typeLabel`]: this.data.typeNames[typeIndex], [`analysis.claims[${index}].type`]: this.data.types[typeIndex] })
  },
  confirm() {
    this.setData({ loading: true })
    const profile = wx.getStorageSync('riskProfile')
    const payload = { profile, plan: this.data.plan, analysis: this.data.analysis, existing_stock_value: 34000, existing_industry_value: 34000 }
    request('/v1/decision/review', payload, () => ({ status: '需要重点核对', summary: '主要风险是计划后仓位超过个人提醒线，且核心理由含未核实信息。', plan: this.data.plan, analysis: this.data.analysis, evidence: [{ title: '当前有限资料没有确认这项说法', excerpt: '请到交易所公告、公司公告或定期报告继续核实。', source: '有限资料覆盖说明', status: '未找到正式支持' }], findings: [{ title: '单股仓位上限', triggered: true, explanation: '计划执行后达到42%，超过个人提醒线25%。' }, { title: '判断失效条件', triggered: true, explanation: '当前没有填写。' }], metrics: { post_stock_pct: 42, post_industry_pct: 42, scenarios: [{ decline_pct: 20, position_loss: 16800, capital_loss_pct: 8.4 }] } }))
      .then(result => { wx.setStorageSync('activeReview', result); wx.navigateTo({ url: '/pages/review/index' }) })
      .catch(err => wx.showToast({ title: err.message, icon: 'none' })).finally(() => this.setData({ loading: false }))
  },
  back() { wx.navigateBack() }
})
