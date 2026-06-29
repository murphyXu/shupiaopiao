const api = require('../../utils/api');
const { ORDER_STATUS } = require('../../utils/util');
const { shippingInfoText, hasShippingInfo, formatShipDeadlineRemaining, formatAutoCompleteRemaining, formatDeadlineClock } = require('../../utils/shipping');
const { tryShowMilestonePrompt } = require('../../utils/officialAccountPrompt');
const { buildOrderMetaLine } = require('../../utils/orderMeta');
const {
  buildCancelSuccessTitle,
  buildConfirmReceiveContent,
  buildConfirmReceiveSuccessTitle,
  cancelCreditDelta,
  promptCancelConfirm,
} = require('../../utils/pointFeedback');

Page({
  data: {
    detail: null,
    statusMap: ORDER_STATUS,
    showOaMilestone: false,
    deadlineHint: '',
  },

  onLoad(options) {
    this.orderId = options.orderId;
    this.role = options.role || '';
    this.milestoneQuery = options.milestone || '';
    this.setupOaMilestone();
  },

  setupOaMilestone() {
    const showOaMilestone = tryShowMilestonePrompt('ship', {
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

  onShow() { this.load(); },

  async load() {
    if (!this.orderId) {
      wx.showToast({ title: '漂流记录不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    try {
      const detail = await api.getOrderDetail(this.orderId, this.role);
      const order = detail.order || {};
      let deadlineHint = '';
      if (order.status === 'PENDING_SHIP' && detail.role === 'giver') {
        const remain = formatShipDeadlineRemaining(order.shipDeadlineAt);
        deadlineHint = remain ? `${remain}，超时未寄出将自动取消订单` : '';
      }
      if (order.status === 'SHIPPED' && detail.role === 'receiver') {
        const remain = formatAutoCompleteRemaining(order.autoCompleteAt);
        deadlineHint = remain ? `${remain}；也可手动确认收货` : '';
      }
      this.setData({
        detail: {
          ...detail,
          order: {
            ...order,
            shipDeadlineText: formatDeadlineClock(order.shipDeadlineAt),
            autoCompleteText: formatDeadlineClock(order.autoCompleteAt),
          },
        },
        orderMetaLine: buildOrderMetaLine(order),
        deadlineHint,
      });
    } catch (err) {
      console.error(err);
      setTimeout(() => wx.navigateBack(), 800);
    }
  },

  copyShippingInfo() {
    const detail = this.data.detail || {};
    const address = detail.order && detail.order.addressSnapshot;
    if (!hasShippingInfo(address)) {
      wx.showToast({ title: '暂无寄送信息', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: shippingInfoText(address),
      success: () => wx.showToast({ title: '收件信息已复制', icon: 'none' }),
    });
  },

  dispute() { wx.navigateTo({ url: `/pages/drift/dispute?orderId=${this.orderId}` }); },
  review() { wx.navigateTo({ url: `/pages/drift/review?orderId=${this.orderId}` }); },
  async cancel() {
    const detail = this.data.detail || {};
    const order = detail.order || {};
    const role = detail.role === 'giver' ? 'GIVER' : 'RECEIVER';
    const text = detail.role === 'giver' ? '取消漂流' : '取消接漂';
    const confirmed = await promptCancelConfirm({
      title: text,
      role,
      coinValue: order.coinValue,
      creditDelta: cancelCreditDelta(role),
    });
    if (!confirmed) return;
    await api.cancelOrder(this.orderId, text);
    wx.showToast({ title: buildCancelSuccessTitle(), icon: 'none' });
    await this.load();
  },
  confirm() {
    const order = (this.data.detail && this.data.detail.order) || {};
    wx.showModal({
      title: '确认收到图书',
      content: buildConfirmReceiveContent({ coinValue: order.coinValue }),
      success: async (res) => {
        if (!res.confirm) return;
        const result = await api.confirmOrder(this.orderId);
        wx.showToast({ title: buildConfirmReceiveSuccessTitle(result.pointEffects), icon: 'none' });
        await this.load();
      },
    });
  },
  async addToShelf() {
    const result = await api.addReceivedBook(this.orderId);
    wx.showToast({ title: result.existed ? '已在书架中' : '已加入书架' });
  },
});
