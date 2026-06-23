const api = require('../../utils/api');
const { requireLogin } = require('../../utils/util');
const { publishEarnGuideModal } = require('../../utils/pointRules');

function withBalanceAfter(list = [], balance = 0) {
  let runningBalance = Number(balance) || 0;
  return (Array.isArray(list) ? list : []).map((item) => {
    const balanceDelta = Number(item.balanceDelta) || 0;
    const balanceAfter = runningBalance;
    runningBalance -= balanceDelta;
    return {
      ...item,
      balanceDelta,
      frozenDelta: Number(item.frozenDelta) || 0,
      balanceAfter,
    };
  });
}

Page({
  data: {
    balance: 0,
    frozen: 0,
    available: 0,
    transactions: [],
    showEarnGuideModal: false,
    earnGuide: publishEarnGuideModal(),
  },

  onLoad() {
    Promise.all([api.getWalletBalance(), api.getTransactions()]).then(([w, tx]) => {
      const balance = Number(w.balance) || 0;
      this.setData({
        balance,
        frozen: Number(w.frozen) || 0,
        available: Number(w.available) || 0,
        transactions: withBalanceAfter(tx.list, balance),
      });
    });
  },

  goPublish() {
    wx.navigateTo({ url: '/pages/drift/publish' });
  },

  showEarnPointGuide() {
    if (!requireLogin('登录后可查看和获得公益积分')) return;
    wx.showActionSheet({
      itemList: ['上漂一本书', '邀请书友'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.setData({ earnGuide: publishEarnGuideModal(), showEarnGuideModal: true });
          return;
        }
        if (res.tapIndex === 1) {
          wx.switchTab({
            url: '/pages/mine/index',
            success: () => wx.showToast({ title: '在邀请书友共建处发出邀请', icon: 'none' }),
          });
        }
      },
    });
  },

  hideEarnPointGuide() {
    this.setData({ showEarnGuideModal: false });
  },

  confirmEarnPointGuide() {
    this.hideEarnPointGuide();
    this.goPublish();
  },
});
