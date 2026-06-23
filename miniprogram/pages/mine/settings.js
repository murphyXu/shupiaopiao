const { settingsPointRules } = require('../../utils/pointRules');

Page({
  data: {
    pointRules: settingsPointRules(),
  },

  logout() {
    wx.showModal({
      title: '退出登录',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('token');
          wx.removeStorageSync('userInfo');
          wx.switchTab({ url: '/pages/pool/index' });
        }
      },
    });
  },
});
