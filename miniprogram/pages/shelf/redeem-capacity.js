const api = require('../../utils/api');
const { RULES } = require('../../utils/pointRules');

const CAPACITY_PER_COIN = RULES.shelfCapacityPerCoin;
const MAX_REDEEM_CAPACITY = 100;

function maxRedeemCapacity(balance) {
  return Math.min(Math.max(Math.floor(Number(balance) || 0), 0) * CAPACITY_PER_COIN, MAX_REDEEM_CAPACITY);
}

function normalizeCapacity(value, balance) {
  const max = maxRedeemCapacity(balance);
  const raw = Math.min(Math.max(Math.floor(Number(value) || 0), 0), max);
  if (raw < CAPACITY_PER_COIN) return 0;
  return Math.floor(raw / CAPACITY_PER_COIN) * CAPACITY_PER_COIN;
}

function coinCostForCapacity(capacity) {
  return capacity / CAPACITY_PER_COIN;
}

function defaultRedeemCount(balance) {
  const max = maxRedeemCapacity(balance);
  if (max < CAPACITY_PER_COIN) return 0;
  return Math.min(CAPACITY_PER_COIN, max);
}

Page({
  data: {
    loading: true,
    balance: 0,
    redeemCount: CAPACITY_PER_COIN,
    coinCost: 1,
    capacityPerCoin: CAPACITY_PER_COIN,
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
      const redeemCount = defaultRedeemCount(balance);
      this.setData({
        dashboard,
        balance,
        redeemCount,
        coinCost: coinCostForCapacity(redeemCount),
      });
    } catch (e) {
      console.error(e);
    } finally {
      this.setData({ loading: false });
    }
  },

  onCountInput(e) {
    const balance = Math.max(Number(this.data.balance) || 0, 0);
    const redeemCount = normalizeCapacity(e.detail.value, balance);
    this.setData({
      redeemCount,
      coinCost: coinCostForCapacity(redeemCount),
    });
  },

  setQuickCount(e) {
    const count = Number(e.currentTarget.dataset.count) || CAPACITY_PER_COIN;
    const balance = Math.max(Number(this.data.balance) || 0, 0);
    const redeemCount = normalizeCapacity(count, balance);
    this.setData({
      redeemCount,
      coinCost: coinCostForCapacity(redeemCount),
    });
  },

  async submitRedeem() {
    if (this.data.redeemCount < CAPACITY_PER_COIN) {
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
