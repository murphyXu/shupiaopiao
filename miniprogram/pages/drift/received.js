const api = require('../../utils/api');
const { ORDER_STATUS } = require('../../utils/util');

function withBundleBadge(orders = []) {
  const counts = {};
  orders.forEach((order) => {
    if (order.bundleId) counts[order.bundleId] = (counts[order.bundleId] || 0) + 1;
  });
  return orders.map((order) => ({
    ...order,
    bundleBadge: order.bundleId && counts[order.bundleId] > 1
      ? `同包裹 · ${counts[order.bundleId]} 本`
      : '',
  }));
}

Page({
  data: { orders: [], statusMap: ORDER_STATUS, statusFilter: '' },

  onLoad(options) {
    this.setData({ statusFilter: options.status || '' });
  },

  onShow() {
    api.getOrders('received', this.data.statusFilter || undefined).then((res) => {
      this.setData({ orders: withBundleBadge(res.list || []) });
    });
  },

  async confirm(e) {
    const orderId = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认收货',
      content: '确认已收到图书？确认后将结算公益积分',
      success: async (res) => {
        if (res.confirm) {
          await api.confirmOrder(orderId);
          wx.showToast({ title: '已确认收货' });
          this.onShow();
        }
      },
    });
  },

  review(e) {
    wx.navigateTo({ url: `/pages/drift/review?orderId=${e.currentTarget.dataset.id}` });
  },

  viewDetail(e) {
    wx.navigateTo({ url: `/pages/drift/order-detail?orderId=${e.currentTarget.dataset.id}&role=received` });
  },

  viewLogistics(e) {
    const { no, company } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/mine/logistics?trackingNo=${no}&expressCompany=${company}` });
  },
});
