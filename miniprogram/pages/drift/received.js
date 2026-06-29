const api = require('../../utils/api');
const { ORDER_STATUS } = require('../../utils/util');
const { onCoverError } = require('../../utils/cover');
const { prepareOrderList, resolveActiveTabFromStatus } = require('../../utils/orderList');
const { buildOrderMetaLine } = require('../../utils/orderMeta');
const { formatAutoCompleteRemaining } = require('../../utils/shipping');
const { tryShowMilestonePrompt } = require('../../utils/officialAccountPrompt');
const {
  buildConfirmReceiveContent,
  buildConfirmReceiveSuccessTitle,
} = require('../../utils/pointFeedback');

function withDeadlineHint(order = {}) {
  if (order.status !== 'SHIPPED') return order;
  const deadlineHint = formatAutoCompleteRemaining(order.autoCompleteAt);
  return deadlineHint ? { ...order, deadlineHint } : order;
}

Page({
  data: {
    orders: [],
    statusMap: ORDER_STATUS,
    activeTab: 'all',
    statusTabs: [],
    showOaMilestone: false,
  },

  onLoad(options) {
    this.milestoneQuery = options.milestone || '';
    this.setData({ activeTab: resolveActiveTabFromStatus(options.status || '', 'received') });
    this.setupOaMilestone();
  },

  setupOaMilestone() {
    const showOaMilestone = tryShowMilestonePrompt('claim', {
      milestoneQuery: this.milestoneQuery,
    });
    this.setData({ showOaMilestone });
  },

  dismissOaMilestone() {
    this.setData({ showOaMilestone: false });
  },

  onOaFollow() {
    this.setData({ showOaMilestone: false });
  },

  onShow() {
    api.getOrders('received').then((res) => {
      const rawOrders = res.list || [];
      const { orders, statusTabs } = prepareOrderList(rawOrders, 'received', this.data.activeTab);
      this.setData({
        orders: orders.map((order) => withDeadlineHint({
          ...order,
          orderMetaLine: buildOrderMetaLine(order),
        })),
        statusTabs,
      });
      this._orders = rawOrders;
    });
  },

  switchStatusTab(e) {
    const activeTab = e.currentTarget.dataset.key || 'all';
    if (activeTab === this.data.activeTab) return;
    this.setData({ activeTab }, () => this.onShow());
  },

  async   confirm(e) {
    const orderId = e.currentTarget.dataset.id;
    const order = (this._orders || []).find((item) => item.id === orderId) || {};
    wx.showModal({
      title: '确认收货',
      content: buildConfirmReceiveContent({ coinValue: order.coinValue }),
      success: async (res) => {
        if (!res.confirm) return;
        const result = await api.confirmOrder(orderId);
        wx.showToast({ title: buildConfirmReceiveSuccessTitle(result.pointEffects), icon: 'none' });
        this.onShow();
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

  onCoverError,
});
