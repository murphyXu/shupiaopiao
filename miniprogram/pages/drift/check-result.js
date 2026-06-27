const api = require('../../utils/api');
const {
  markSubscribeDialogTriggered,
  tryShowMilestonePrompt,
  trackOaEvent,
} = require('../../utils/officialAccountPrompt');

Page({
  data: {
    passed: false,
    coinValue: 0,
    checks: [],
    reasons: [],
    continueScan: false,
    sessionCount: 0,
    showOaMilestone: false,
  },

  onLoad(options) {
    this.driftId = options.driftId;
    this.setData({
      passed: options.passed === 'true',
      continueScan: options.continueScan === '1',
      sessionCount: Number(options.sessionCount) || 0,
    });
    api.getDriftCheck(options.driftId).then((res) => {
      this.setData({
        passed: res.passed,
        coinValue: res.coinValue,
        checks: [
          { name: 'ISBN 合规校验通过' },
          { name: '图像识别：封面一致、真实书籍' },
          { name: '风控规则通过 → 已入漂流池' },
        ],
        reasons: res.reasons || [],
      });
    }).finally(() => this.refreshOaMilestone());
  },

  refreshOaMilestone() {
    if (this._oaMilestoneReady) return;
    this._oaMilestoneReady = true;
    const showOaMilestone = tryShowMilestonePrompt('publish', { passed: this.data.passed });
    this.setData({ showOaMilestone });
  },

  appeal() {
    wx.showModal({
      title: '提交申诉',
      editable: true,
      placeholderText: '请描述申诉原因',
      success: async (res) => {
        if (res.confirm) {
          await api.appealDrift(this.driftId, res.content);
          wx.showToast({ title: '申诉已提交' });
        }
      },
    });
  },

  continueScanPublish() {
    wx.redirectTo({
      url: `/pages/drift/scan-publish?sessionCount=${this.data.sessionCount}`,
    });
  },

  goPoolFromScan() {
    wx.switchTab({ url: '/pages/pool/index' });
  },

  goNext() {
    if (this.data.continueScan && this.data.passed) {
      this.continueScanPublish();
      return;
    }
    if (this.data.passed) {
      wx.switchTab({ url: '/pages/pool/index' });
    } else {
      wx.navigateBack();
    }
  },

  dismissOaMilestone() {
    trackOaEvent('oa_milestone_dismiss', 'publish');
    this.setData({ showOaMilestone: false });
  },

  onOaFollow() {
    trackOaEvent('oa_follow_click', 'publish');
    this.setData({ showOaMilestone: false });
  },

  async enableSubscribeNotify() {
    if (!this.driftId) return;
    markSubscribeDialogTriggered();
    this.setData({ showOaMilestone: false });
    try {
      const { subscribeDriftNotifications } = require('../../utils/subscribe');
      const res = await subscribeDriftNotifications(this.driftId);
      if ((res.recorded || 0) > 0) {
        wx.showToast({ title: `已开启 ${res.recorded} 项微信提醒`, icon: 'none' });
        return;
      }
      if ((res.accepted || 0) === 0) {
        wx.showToast({ title: '未开启微信提醒，可在上漂后重试', icon: 'none' });
        return;
      }
      wx.showToast({ title: '提醒设置未保存，请确认已上传 api 云函数', icon: 'none' });
    } catch (err) {
      wx.showToast({ title: '提醒设置未保存', icon: 'none' });
    }
  },
});
