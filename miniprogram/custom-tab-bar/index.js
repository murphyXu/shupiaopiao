Component({
  data: {
    selected: 0,
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

  methods: {
    switchTab(e) {
      const { path, index } = e.currentTarget.dataset;
      if (path === '/pages/shelf/index') wx.setStorageSync('forceOwnShelf', true);
      wx.switchTab({ url: path });
      this.setData({ selected: index });
    },
  },
});
