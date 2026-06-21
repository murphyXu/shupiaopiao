const api = require('../../utils/api');

Page({
  data: { score: 100, logs: [] },

  onLoad() {
    api.getCredit().then((res) => this.setData({ score: res.score, logs: res.logs }));
  },
});
