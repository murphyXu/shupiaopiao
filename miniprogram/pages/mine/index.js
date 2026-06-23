const { isLoggedIn, requireLogin } = require('../../utils/util');
const safeAreaBehavior = require('../../behaviors/safe-area');
const { setTabBarIndex } = require('../../utils/tab-bar');
const api = require('../../utils/api');
const { trackPageView, track } = require('../../utils/track');

function normalizeMineUser(user = {}) {
  const balance = Number(user.coinBalance) || 0;
  const frozen = Number(user.coinFrozen) || 0;
  const available = user.availableCoin === undefined
    ? balance - frozen
    : Number(user.availableCoin);
  return {
    ...user,
    availableCoin: Math.max(Number(available) || 0, 0),
  };
}

Page({
  behaviors: [safeAreaBehavior],
  data: {
    loggedIn: false,
    user: {},
    driftSummary: {
      pendingShip: 0,
      expiringSoon: 0,
      toConfirm: 0,
      disputing: 0,
      toReview: 0,
      disputingGiven: 0,
      disputingReceived: 0,
      toReviewGiven: 0,
      toReviewReceived: 0,
    },
  },

  onShow() {
    setTabBarIndex.call(this, 2);
    trackPageView('mine/index');
    const loggedIn = isLoggedIn();
    if (!loggedIn) {
      this.setData({ loggedIn: false, user: {} });
      return;
    }
    const user = normalizeMineUser(wx.getStorageSync('userInfo') || {});
    this.setData({ loggedIn: true, user });
    getApp().fetchUser().then((u) => {
      const nextUser = normalizeMineUser(u || user);
      this.setData({ user: nextUser });
      this.loadDriftSummary();
    }).catch(() => {});
    this.loadDriftSummary();
  },

  async loadDriftSummary() {
    const now = Date.now();
    try {
      const [givenPending, givenShipped, givenDisputed, givenDone, receivedPending, receivedShipped, receivedDisputed, receivedDone] = await Promise.all([
        api.getOrders('given', 'PENDING_SHIP').catch(() => ({ list: [] })),
        api.getOrders('given', 'SHIPPED').catch(() => ({ list: [] })),
        api.getOrders('given', 'DISPUTED').catch(() => ({ list: [] })),
        api.getOrders('given', 'DONE').catch(() => ({ list: [] })),
        api.getOrders('received', 'PENDING_SHIP').catch(() => ({ list: [] })),
        api.getOrders('received', 'SHIPPED').catch(() => ({ list: [] })),
        api.getOrders('received', 'DISPUTED').catch(() => ({ list: [] })),
        api.getOrders('received', 'DONE').catch(() => ({ list: [] })),
      ]);
      const listByStatus = (rows) => Array.isArray(rows) ? rows : (rows.list || []);
      const givenPendingRows = listByStatus(givenPending);
      const receivedShippedRows = listByStatus(receivedShipped);
      const givenDisputedRows = listByStatus(givenDisputed);
      const receivedDisputedRows = listByStatus(receivedDisputed);
      const givenDoneRows = listByStatus(givenDone);
      const receivedDoneRows = listByStatus(receivedDone);
      const pendingShipRows = givenPendingRows;
      const toConfirmRows = receivedShippedRows;
      const disputingRows = givenDisputedRows.concat(receivedDisputedRows);
      const doneRows = givenDoneRows.concat(receivedDoneRows);
      const soonRows = pendingShipRows.filter((row) => {
        const dead = Date.parse(row.shipDeadlineAt || '');
        return Number.isFinite(dead) && dead > now && dead - now <= 24 * 3600 * 1000;
      });
      this.setData({
        driftSummary: {
          pendingShip: givenPendingRows.length,
          expiringSoon: soonRows.length,
          toConfirm: receivedShippedRows.length,
          disputing: disputingRows.length,
          toReview: doneRows.length,
          disputingGiven: givenDisputedRows.length,
          disputingReceived: receivedDisputedRows.length,
          toReviewGiven: givenDoneRows.length,
          toReviewReceived: receivedDoneRows.length,
        },
      });
    } catch (err) {
      this.setData({
        driftSummary: {
          pendingShip: 0,
          expiringSoon: 0,
          toConfirm: 0,
          disputing: 0,
          toReview: 0,
          disputingGiven: 0,
          disputingReceived: 0,
          toReviewGiven: 0,
          toReviewReceived: 0,
        },
      });
    }
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/auth/login' });
  },

  guard(action) {
    return requireLogin('登录后可使用此功能') && action();
  },

  goProfile() { this.guard(() => wx.navigateTo({ url: '/pages/auth/profile' })); },
  goWallet() { this.guard(() => wx.navigateTo({ url: '/pages/mine/wallet' })); },
  goGiven() { this.guard(() => wx.navigateTo({ url: '/pages/drift/given' })); },
  goReceived() { this.guard(() => wx.navigateTo({ url: '/pages/drift/received' })); },
  goCredit() { this.guard(() => wx.navigateTo({ url: '/pages/mine/credit' })); },
  goDisputes() { this.guard(() => wx.navigateTo({ url: '/pages/mine/disputes' })); },
  goSettings() { wx.navigateTo({ url: '/pages/mine/settings' }); },

  onShareAppMessage() {
    const user = wx.getStorageSync('userInfo') || {};
    track('invite_share', { from: 'mine' });
    return {
      title: '来书漂漂一起让书流动起来',
      path: `/pages/shelf/index?inviterId=${user.id || ''}`,
    };
  },
});
