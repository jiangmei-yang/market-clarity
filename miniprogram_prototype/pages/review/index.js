Page({
  onShow() {
    const review = wx.getStorageSync('activeReview')
    const scenario = (review.metrics.scenarios || []).find(x => x.decline_pct === 20)
    this.setData({ review, scenario, findings: (review.findings || []).filter(x => x.triggered), revised: review.plan.amount })
  },
  revise(e) { this.setData({ revised: Number(e.detail.value) }) },
  save() { wx.showModal({ title: '已记录原型结果', content: `计划金额从 ¥${this.data.review.plan.amount} 修改为 ¥${this.data.revised}。正式版应保存到服务器用户账户。`, showCancel: false }) },
  finish() { wx.reLaunch({ url: '/pages/welcome/index' }) }
})
