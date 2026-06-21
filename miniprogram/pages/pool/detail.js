const api = require('../../utils/api');
const { requireLogin } = require('../../utils/util');

Page({
  data: { item: null },

  onLoad(options) {
    this.driftId = options.id;
    this.loadDetail();
  },

  loadDetail() {
    return api.getPoolDetail(this.driftId).then((item) => this.setData({ item }));
  },

  goClaim() {
    if (!requireLogin('申请接漂需登录，以便管理漂流记录与公益积分')) return;
    wx.navigateTo({ url: `/pages/drift/claim?driftId=${this.driftId}` });
  },

  async toggleWant() {
    if (!requireLogin('登录后可标记想要接漂')) return;
    try {
      const result = await api.togglePoolWant(this.driftId);
      this.setData({ 'item.wanted': result.wanted });
      wx.showToast({ title: result.wanted ? '已加入想要接漂' : '已取消想要', icon: 'none' });
    } catch (err) {
      console.error(err);
    }
  },

  reportItem() {
    if (!requireLogin('登录后可提交举报')) return;
    wx.showModal({
      title: '举报内容',
      editable: true,
      placeholderText: '请说明问题',
      success: async (res) => {
        if (!res.confirm) return;
        const reason = String(res.content || '').trim();
        if (!reason) {
          wx.showToast({ title: '请填写举报原因', icon: 'none' });
          return;
        }
        await api.createReport({ targetType: 'drift', targetId: this.driftId, reason });
        wx.showToast({ title: '举报已提交', icon: 'none' });
      },
    });
  },
});
