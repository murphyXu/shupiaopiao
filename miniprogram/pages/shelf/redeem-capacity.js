const api = require('../../utils/api');
const { RULES } = require('../../utils/pointRules');
const {
  buildRedeemConfirmContent,
  buildRedeemSuccessTitle,
} = require('../../utils/pointFeedback');

const CAPACITY_PER_COIN = RULES.shelfCapacityPerCoin;
const MAX_REDEEM_CAPACITY = 100;

function maxRedeemCapacity(availableBalance) {
  return Math.min(Math.max(Math.floor(Number(availableBalance) || 0), 0) * CAPACITY_PER_COIN, MAX_REDEEM_CAPACITY);
}

function normalizeCapacity(value, availableBalance) {
  const max = maxRedeemCapacity(availableBalance);
  const raw = Math.min(Math.max(Math.floor(Number(value) || 0), 0), max);
  if (raw < CAPACITY_PER_COIN) return 0;
  return Math.floor(raw / CAPACITY_PER_COIN) * CAPACITY_PER_COIN;
}

function coinCostForCapacity(capacity) {
  return capacity / CAPACITY_PER_COIN;
}

function defaultRedeemCount(availableBalance) {
  const max = maxRedeemCapacity(availableBalance);
  if (max < CAPACITY_PER_COIN) return 0;
  return Math.min(CAPACITY_PER_COIN, max);
}

function syncRedeemState(balance, available, frozen, dashboard, redeemCount) {
  const normalizedCount = normalizeCapacity(redeemCount, available);
  const shelfLimit = Math.max(Number(dashboard && dashboard.shelfLimit) || 0, 0);
  return {
    balance,
    available,
    frozen,
    redeemCount: normalizedCount,
    coinCost: coinCostForCapacity(normalizedCount),
    nextShelfLimit: shelfLimit + normalizedCount,
  };
}

Page({
  data: {
    loading: true,
    balance: 0,
    available: 0,
    frozen: 0,
    redeemCount: CAPACITY_PER_COIN,
    coinCost: 1,
    nextShelfLimit: 100,
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
      const frozen = Math.max(Number(wallet.frozen) || 0, 0);
      const available = Math.max(
        Number(wallet.available),
        balance - frozen,
        0,
      );
      const redeemCount = defaultRedeemCount(available);
      this.setData({
        dashboard,
        ...syncRedeemState(balance, available, frozen, dashboard, redeemCount),
      });
    } catch (e) {
      console.error(e);
    } finally {
      this.setData({ loading: false });
    }
  },

  onCountInput(e) {
    this.setData(syncRedeemState(
      this.data.balance,
      this.data.available,
      this.data.frozen,
      this.data.dashboard,
      e.detail.value,
    ));
  },

  setQuickCount(e) {
    const count = Number(e.currentTarget.dataset.count) || CAPACITY_PER_COIN;
    this.setData(syncRedeemState(
      this.data.balance,
      this.data.available,
      this.data.frozen,
      this.data.dashboard,
      count,
    ));
  },

  submitRedeem() {
    if (this.data.redeemCount < CAPACITY_PER_COIN) {
      wx.showToast({ title: this.data.available > 0 ? '请输入兑换数量' : '可用公益积分不足', icon: 'none' });
      return;
    }
    const coinCost = this.data.coinCost;
    wx.showModal({
      title: '确认兑换额度',
      content: buildRedeemConfirmContent(coinCost),
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '兑换中', mask: true });
        try {
          const result = await api.redeemShelfCapacity(this.data.redeemCount, { showError: false });
          wx.hideLoading();
          const user = wx.getStorageSync('userInfo') || {};
          if (user.id) {
            const frozen = Number(user.coinFrozen) || 0;
            const nextUser = {
              ...user,
              coinBalance: result.balance,
              availableCoin: Math.max(result.balance - frozen, 0),
              shelfLimit: result.shelfLimit,
            };
            wx.setStorageSync('userInfo', nextUser);
            getApp().globalData.userInfo = nextUser;
          }
          wx.showToast({
            title: buildRedeemSuccessTitle((result.pointEffects && result.pointEffects.coinSpent) || coinCost),
            icon: 'none',
          });
          setTimeout(() => wx.navigateBack(), 500);
        } catch (e) {
          wx.hideLoading();
          wx.showToast({ title: e.message || '兑换失败', icon: 'none' });
          console.error(e);
        }
      },
    });
  },
});
