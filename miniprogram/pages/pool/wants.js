const api = require('../../utils/api');
const { requireLogin } = require('../../utils/util');

Page({
  data: {
    list: [],
    loading: true,
  },

  onShow() {
    if (!requireLogin('登录后可查看想要接漂的书')) {
      this.setData({ loading: false, list: [] });
      return;
    }
    this.loadList();
  },

  async loadList() {
    this.setData({ loading: true });
    try {
      const res = await api.getPoolWants();
      this.setData({ list: res.list || [] });
    } catch (err) {
      console.error(err);
    } finally {
      this.setData({ loading: false });
    }
  },

  goDetail(e) {
    wx.navigateTo({ url: `/pages/pool/detail?id=${e.currentTarget.dataset.id}` });
  },

  async toggleWant(e) {
    const driftId = e.currentTarget.dataset.id;
    try {
      const result = await api.togglePoolWant(driftId);
      if (!result.wanted) {
        this.setData({ list: this.data.list.filter((item) => item.id !== driftId) });
      }
      wx.showToast({ title: result.wanted ? '已加入想要接漂' : '已取消想要', icon: 'none' });
    } catch (err) {
      console.error(err);
    }
  },
});
