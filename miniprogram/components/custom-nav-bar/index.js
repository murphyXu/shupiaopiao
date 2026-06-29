const { getSystemMetrics } = require('../../utils/system');

Component({
  properties: {
    title: {
      type: String,
      value: '',
    },
    showBack: {
      type: Boolean,
      value: false,
    },
  },

  methods: {
    onBack() {
      this.triggerEvent('back');
    },
  },

  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
  },

  lifetimes: {
    attached() {
      const app = getApp();
      let sys = app && app.globalData && app.globalData.system;
      if (!sys || !sys.navBarHeight) {
        sys = getSystemMetrics();
        if (app && app.globalData) app.globalData.system = sys;
      }
      this.setData({
        statusBarHeight: sys.statusBarHeight || 20,
        navBarHeight: sys.navBarHeight || 44,
      });
    },
  },
});
