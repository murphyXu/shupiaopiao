const { tryShowMilestonePrompt } = require('../../utils/officialAccountPrompt');

Page({
  data: {
    results: [],
    successCount: 0,
    failCount: 0,
    showOaMilestone: false,
  },

  onLoad() {
    const payload = wx.getStorageSync('driftBatchPublishResult') || {};
    const results = Array.isArray(payload.results) ? payload.results : [];
    const successCount = results.filter((item) => item.ok).length;
    const failCount = results.length - successCount;
    const showOaMilestone = tryShowMilestonePrompt('batch', { successCount });
    this.setData({ results, successCount, failCount, showOaMilestone });
    wx.removeStorageSync('driftBatchPublishResult');
  },

  dismissOaMilestone() {
    this.setData({ showOaMilestone: false });
  },

  onOaFollow() {
    this.setData({ showOaMilestone: false });
  },

  goPool() {
    wx.switchTab({ url: '/pages/pool/index' });
  },

  goPublish() {
    wx.redirectTo({ url: '/pages/drift/publish?mode=shelf' });
  },
});
