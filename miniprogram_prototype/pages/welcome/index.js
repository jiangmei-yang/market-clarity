Page({
  start() { wx.navigateTo({ url: '/pages/onboarding/index' }) },
  demo() {
    wx.setStorageSync('riskProfile', { total_capital: 200000, max_single_stock_pct: 25, max_industry_pct: 40, max_trade_amount: 50000, max_tolerable_loss: 20000, prohibit_borrowing: true, cooldown_hours: 24, require_invalidation: true })
    wx.navigateTo({ url: '/pages/decision/index?demo=1' })
  }
})
