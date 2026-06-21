const api = require('./utils/api');
const { cloudEnvId } = require('./config/index');
const { getSystemMetrics } = require('./utils/system');

App({
  globalData: {
    userInfo: null,
    system: null,
    coversUpdated: false,
  },

  captureInvite(options = {}) {
    const query = options.query || {};
    const inviterId = query.inviterId || query.shareUserId || '';
    if (!inviterId) return;
    const user = wx.getStorageSync('userInfo');
    if (user && user.id === inviterId) return;
    wx.setStorageSync('pendingInviterId', inviterId);
  },

  onLaunch(options = {}) {
    this.captureInvite(options);
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上基础库，并开通云开发');
      return;
    }
    wx.cloud.init({
      traceUser: true,
      env: cloudEnvId || undefined,
    });
    this.globalData.system = getSystemMetrics();

    const user = wx.getStorageSync('userInfo');
    if (user && user.id) {
      this.globalData.userInfo = user;
      this.fetchUser();
    }
  },

  onShow(options = {}) {
    this.captureInvite(options);
  },

  fetchUser() {
    return api.getProfile().then((user) => {
      this.globalData.userInfo = user;
      wx.setStorageSync('userInfo', user);
      return user;
    }).catch(() => {
      wx.removeStorageSync('userInfo');
    });
  },

  ensureLogin() {
    const user = wx.getStorageSync('userInfo');
    if (!user || !user.id) {
      return Promise.reject(new Error('not logged in'));
    }
    return this.fetchUser();
  },
});
