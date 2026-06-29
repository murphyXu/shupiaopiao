const { tryShowMilestonePrompt } = require('../../utils/officialAccountPrompt');

const GIVEN_LIST_URL = '/pages/drift/given?status=IN_POOL';

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

  goGivenList() {
    wx.redirectTo({ url: GIVEN_LIST_URL });
  },

  goPublish() {
    wx.redirectTo({ url: '/pages/drift/publish?mode=shelf' });
  },
});
