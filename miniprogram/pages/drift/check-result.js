const api = require('../../utils/api');

Page({
  data: { passed: false, coinValue: 0, checks: [], reasons: [] },

  onLoad(options) {
    this.driftId = options.driftId;
    this.setData({ passed: options.passed === 'true' });
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
    });
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

  goNext() {
    if (this.data.passed) {
      wx.switchTab({ url: '/pages/pool/index' });
    } else {
      wx.navigateBack();
    }
  },
});
