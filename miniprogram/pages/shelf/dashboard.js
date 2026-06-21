const api = require('../../utils/api');

Page({
  data: {
    dashboard: {
      totalBooks: 0,
      monthNew: 0,
      totalValue: 0,
      shelfLimit: 100,
      remainingCapacity: 100,
    },
  },

  onLoad() {
    api.getDashboard().then((d) => this.setData({ dashboard: d }));
  },
});
