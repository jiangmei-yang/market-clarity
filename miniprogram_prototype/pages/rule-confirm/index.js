Page({
  onShow() {
    const pending = wx.getStorageSync('pendingRules') || {}
    this.setData({ items: pending.interpretations || [], profile: pending.profile || {} })
  },
  edit(e) { this.setData({ [`profile.${e.currentTarget.dataset.key}`]: Number(e.detail.value) }) },
  toggle(e) { this.setData({ [`profile.${e.currentTarget.dataset.key}`]: e.detail.value }) },
  confirm() {
    const p = this.data.profile
    p.max_single_stock_pct = Math.min(100, p.max_trade_amount / p.total_capital * 100)
    wx.setStorageSync('riskProfile', p)
    wx.navigateTo({ url: '/pages/decision/index' })
  },
  back() { wx.navigateBack() }
})
