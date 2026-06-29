Component({
  data: {
    selected: 0,
    hidden: false,
    mineBadge: '',
    list: [
      {
        pagePath: '/pages/pool/index',
        text: '漂流',
        iconPath: '/assets/icons/pool.png',
        selectedIconPath: '/assets/icons/pool-active.png',
      },
      {
        pagePath: '/pages/shelf/index',
        text: '书架',
        iconPath: '/assets/icons/shelf.png',
        selectedIconPath: '/assets/icons/shelf-active.png',
      },
      {
        pagePath: '/pages/mine/index',
        text: '我的',
        iconPath: '/assets/icons/mine.png',
        selectedIconPath: '/assets/icons/mine-active.png',
      },
    ],
  },

  lifetimes: {
    attached() {
      try {
        const app = getApp();
        const badge = app && app.globalData && app.globalData.pendingShipBadge;
        if (badge) this.setData({ mineBadge: badge });
      } catch (err) { /* 冷启动 */ }
    },
  },

  methods: {
    switchTab(e) {
      const { path, index } = e.currentTarget.dataset;
      const prev = this.data.list[this.data.selected];
      const next = this.data.list[index];
      if (path === '/pages/shelf/index') wx.setStorageSync('forceOwnShelf', true);
      try {
        const track = require('../utils/track');
        track.track('tab_switch', { from: prev && prev.text, to: next && next.text });
      } catch (err) { /* 埋点静默 */ }
      wx.switchTab({ url: path });
      this.setData({ selected: index });
    },
  },
});
