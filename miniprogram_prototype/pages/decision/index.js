const { request } = require('../../utils/api')
Page({
  data: { stock: '', actions: ['买入','补仓','卖出'], action: '买入', amount: 10000, reason: '', invalidation: '', loading: false },
  onLoad(q) { if (q.demo) this.setData({ stock: '300750', action: '补仓', amount: 50000, reason: '已经跌了很多，朋友说公司拿到了大订单，应该快反弹了。' }) },
  edit(e) { this.setData({ [e.currentTarget.dataset.key]: e.detail.value }) },
  action(e) { this.setData({ action: this.data.actions[e.detail.value] }) },
  parse() {
    this.setData({ loading: true })
    const payload = { stock: this.data.stock, action: this.data.action, amount: Number(this.data.amount), reason: this.data.reason, invalidation: this.data.invalidation }
    request('/v1/decision/parse', payload, () => ({
      plan: { code: '300750', name: '某科技股', industry: '电池', action: payload.action, amount: payload.amount, holding_period: '', reason: payload.reason, source: '朋友或社交平台', invalidation: payload.invalidation, acceptable_loss: null, state: '下跌后想摊低成本', recent_loss: true, uses_borrowed_money: false },
      analysis: { mode: 'rules', urgent_support_needed: false, missing_items: ['没有明确判断失效条件'], possible_behavior_signals: [{ signal: 'anchoring_on_previous_price', confidence: 'medium', evidence: '将下跌幅度本身作为反弹理由' }], claims: [
        { text: '已经跌了很多', type: 'observable_fact', verifiability: 'partially_verifiable', required_evidence: '过去一段时间价格跌幅' },
        { text: '朋友说公司拿到了大订单', type: 'unverified_external_claim', verifiability: 'needs_source', required_evidence: '公司或交易所公告' },
        { text: '应该快反弹了', type: 'prediction_or_inference', verifiability: 'not_directly_verifiable', required_evidence: '明确推断依据' }
      ]}
    })).then(result => { wx.setStorageSync('pendingDecision', result); wx.navigateTo({ url: '/pages/reason-confirm/index' }) })
      .catch(err => wx.showToast({ title: err.message, icon: 'none' })).finally(() => this.setData({ loading: false }))
  }
})
