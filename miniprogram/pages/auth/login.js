const api = require('../../utils/api');
const safeAreaBehavior = require('../../behaviors/safe-area');
const { trackPageView } = require('../../utils/track');

Page({
  behaviors: [safeAreaBehavior],
  data: { agreed: false, loading: false, canGoBack: false },

  onLoad() {
    const pages = getCurrentPages();
    this.setData({ canGoBack: pages.length > 1 });
    trackPageView('auth/login');
  },

  skipLogin() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
      return;
    }
    wx.switchTab({ url: '/pages/pool/index' });
  },

  toggleAgree() {
    this.setData({ agreed: !this.data.agreed });
  },

  goPrivacy() {
    wx.navigateTo({ url: '/pages/mine/settings?tab=privacy' });
  },

  goTerms() {
    wx.navigateTo({ url: '/pages/mine/settings?tab=terms' });
  },

  handleLogin() {
    if (!this.data.agreed) {
      wx.showToast({ title: '请先阅读并同意隐私政策与用户协议', icon: 'none' });
      return;
    }
    if (this.data.loading) return;
    this.setData({ loading: true });

    const inviterId = wx.getStorageSync('pendingInviterId') || '';
    api.login(inviterId).then((data) => {
      wx.removeStorageSync('pendingInviterId');
      wx.setStorageSync('userInfo', data.user);
      getApp().globalData.userInfo = data.user;
      wx.showToast({ title: '登录成功', icon: 'success' });
      setTimeout(() => {
        const pages = getCurrentPages();
        if (pages.length > 1) {
          wx.navigateBack();
        } else {
          wx.switchTab({ url: '/pages/pool/index' });
        }
      }, 400);
    }).catch((e) => {
      console.error(e);
    }).finally(() => {
      this.setData({ loading: false });
    });
  },
});
