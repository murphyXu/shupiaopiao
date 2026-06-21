const { getSystemMetrics } = require('../utils/system');

module.exports = Behavior({
  data: {
    navPaddingTop: 44,
    contentPaddingRight: 16,
  },

  lifetimes: {
    attached() {
      const app = getApp();
      let sys = app && app.globalData && app.globalData.system;
      if (!sys || !sys.navPaddingTop) {
        sys = getSystemMetrics();
        if (app && app.globalData) app.globalData.system = sys;
      }
      this.setData({
        navPaddingTop: sys.navPaddingTop || 56,
        contentPaddingRight: sys.contentPaddingRight || 16,
      });
    },
  },
});
