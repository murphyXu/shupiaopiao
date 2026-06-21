const api = require('../../utils/api');

Page({
  data: {
    loading: true,
    balance: 0,
    redeemCount: 1,
    dashboard: {
      shelfLimit: 100,
      remainingCapacity: 100,
      totalBooks: 0,
    },
  },

  onLoad() {
    this.loadData();
  },

  async loadData() {
    this.setData({ loading: true });
    try {
      const [dashboard, wallet] = await Promise.all([
        api.getDashboard(),
        api.getWalletBalance(),
      ]);
      const balance = Math.max(Number(wallet.balance) || 0, 0);
      this.setData({
        dashboard,
        balance,
        redeemCount: balance > 0 ? 1 : 0,
      });
    } catch (e) {
      console.error(e);
    } finally {
      this.setData({ loading: false });
    }
  },

  onCountInput(e) {
    const balance = Math.max(Number(this.data.balance) || 0, 0);
    const value = Math.floor(Number(e.detail.value) || 0);
    const redeemCount = Math.min(Math.max(value, 0), balance, 100);
    this.setData({ redeemCount });
  },

  setQuickCount(e) {
    const count = Number(e.currentTarget.dataset.count) || 1;
    const balance = Math.max(Number(this.data.balance) || 0, 0);
    this.setData({ redeemCount: Math.min(count, balance, 100) });
  },

  async submitRedeem() {
    if (this.data.redeemCount < 1) {
      wx.showToast({ title: '请输入兑换数量', icon: 'none' });
      return;
    }
    try {
      wx.showLoading({ title: '兑换中' });
      const res = await api.redeemShelfCapacity(this.data.redeemCount);
      const user = wx.getStorageSync('userInfo') || {};
      if (user.id) {
        const nextUser = { ...user, coinBalance: res.balance, shelfLimit: res.shelfLimit };
        wx.setStorageSync('userInfo', nextUser);
        getApp().globalData.userInfo = nextUser;
      }
      wx.showToast({ title: '兑换成功' });
      setTimeout(() => wx.navigateBack(), 500);
    } catch (e) {
      console.error(e);
    } finally {
      wx.hideLoading();
    }
  },
});
