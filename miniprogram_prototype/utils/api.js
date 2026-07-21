function request(path, data, mockFactory) {
  const app = getApp()
  if (app.globalData.demoMode || !app.globalData.apiBaseUrl) {
    return Promise.resolve(mockFactory())
  }
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${app.globalData.apiBaseUrl}${path}`,
      method: 'POST',
      data,
      timeout: 12000,
      success: (res) => res.statusCode >= 200 && res.statusCode < 300 ? resolve(res.data) : reject(new Error(res.data.detail || '请求失败')),
      fail: reject
    })
  })
}

module.exports = { request }
