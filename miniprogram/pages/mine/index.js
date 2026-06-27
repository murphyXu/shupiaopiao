const { isLoggedIn, requireLogin } = require('../../utils/util');
const safeAreaBehavior = require('../../behaviors/safe-area');
const { setTabBarIndex, refreshTabBarPendingShip } = require('../../utils/tab-bar');
const api = require('../../utils/api');
const { trackPageView, track } = require('../../utils/track');
const { mineInviteShare } = require('../../utils/share');
const { inviteRewardSummary } = require('../../utils/pointRules');
const {
  isOfficialAccountConfigured,
  openOfficialAccountProfile,
  trackOaEvent,
} = require('../../utils/officialAccountPrompt');

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

function buildTodoBadges(pairs) {
  return (pairs || [])
    .filter((pair) => Number(pair[1]) > 0)
    .map((pair) => ({ label: pair[0], count: pair[1] }));
}

Page({
  behaviors: [safeAreaBehavior],
  data: {
    loggedIn: false,
    user: {},
    givenBadges: [],
    receivedBadges: [],
    inviteRewardRule: inviteRewardSummary(),
    showOaMineCard: false,
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
    refreshTabBarPendingShip();
    trackPageView('mine/index');
    this.refreshOaMineCard();
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
    try {
      const summary = await api.getDriftSummary();
      this.setData({
        driftSummary: summary,
        givenBadges: buildTodoBadges([
          ['待发货', summary.pendingShip],
          ['即将到期', summary.expiringSoon],
          ['申诉', summary.disputingGiven],
          ['待评价', summary.toReviewGiven],
        ]),
        receivedBadges: buildTodoBadges([
          ['待确认', summary.toConfirm],
          ['申诉', summary.disputingReceived],
          ['待评价', summary.toReviewReceived],
        ]),
      });
      refreshTabBarPendingShip();
    } catch (err) {
      this.setData({
        givenBadges: [],
        receivedBadges: [],
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

  refreshOaMineCard() {
    const showOaMineCard = isOfficialAccountConfigured();
    if (showOaMineCard && !this.data.showOaMineCard) {
      trackOaEvent('oa_mine_card_show', 'mine');
    }
    this.setData({ showOaMineCard });
  },

  openOaProfile() {
    trackOaEvent('oa_follow_click', 'mine');
    openOfficialAccountProfile();
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
  goDashboard() { this.guard(() => wx.navigateTo({ url: '/pages/admin/dashboard' })); },
  goSettings() { wx.navigateTo({ url: '/pages/mine/settings' }); },

  onShareAppMessage() {
    const user = wx.getStorageSync('userInfo') || {};
    track('invite_share', { from: 'mine' });
    return mineInviteShare(user.id);
  },
});
