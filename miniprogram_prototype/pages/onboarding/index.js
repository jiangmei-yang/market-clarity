const { request } = require('../../utils/api')

Page({
  data: { template: '自定义提醒模式', text: '', loading: false },
  chooseTemplate(e) { this.setData({ template: e.currentTarget.dataset.name }) },
  onText(e) { this.setData({ text: e.detail.value }) },
  parse() {
    if (!this.data.text.trim()) return wx.showToast({ title: '请先描述你的想法', icon: 'none' })
    this.setData({ loading: true })
    request('/v1/onboarding/parse', { text: this.data.text, template: this.data.template }, () => ({
      mode: 'rules', unclear_items: [],
      interpretations: [
        { label: '总可投资资金', value: 200000, understood_from: '我大概用20万元' },
        { label: '单只股票最高金额', value: 50000, understood_from: '一只股票最好不超过5万元' },
        { label: '亏损后重新检查时间', value: 24, understood_from: '隔一天再看' }
      ],
      profile: { total_capital: 200000, max_single_stock_pct: 25, max_industry_pct: 40, max_trade_amount: 50000, max_tolerable_loss: 20000, prohibit_borrowing: true, cooldown_hours: 24, require_invalidation: true }
    })).then(result => {
      wx.setStorageSync('pendingRules', result)
      wx.navigateTo({ url: '/pages/rule-confirm/index' })
    }).catch(err => wx.showToast({ title: err.message, icon: 'none' })).finally(() => this.setData({ loading: false }))
  }
})
