Page({
  data: {
    results: [],
    successCount: 0,
    failCount: 0,
  },

  onLoad() {
    const payload = wx.getStorageSync('driftBatchPublishResult') || {};
    const results = Array.isArray(payload.results) ? payload.results : [];
    const successCount = results.filter((item) => item.ok).length;
    const failCount = results.length - successCount;
    this.setData({ results, successCount, failCount });
    wx.removeStorageSync('driftBatchPublishResult');
  },

  goPool() {
    wx.switchTab({ url: '/pages/pool/index' });
  },

  goPublish() {
    wx.redirectTo({ url: '/pages/drift/publish?mode=shelf' });
  },
});
