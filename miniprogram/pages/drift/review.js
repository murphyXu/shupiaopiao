const api = require('../../utils/api');

Page({
  data: {
    rating: 5,
    stars: [1, 2, 3, 4, 5],
  },

  onLoad(options) {
    this.orderId = options.orderId;
  },

  setRating(e) {
    this.setData({ rating: e.currentTarget.dataset.rating });
  },

  async submit() {
    await api.reviewOrder(this.orderId, {
      rating: this.data.rating,
    });
    wx.showToast({ title: '评价成功' });
    setTimeout(() => wx.navigateBack(), 1000);
  },
});
