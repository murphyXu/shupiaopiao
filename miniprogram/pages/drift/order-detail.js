const api = require('../../utils/api');
const { ORDER_STATUS } = require('../../utils/util');
const { shippingInfoText, hasShippingInfo } = require('../../utils/shipping');
const { tryShowMilestonePrompt } = require('../../utils/officialAccountPrompt');

Page({
  data: {
    detail: null,
    statusMap: ORDER_STATUS,
    showOaMilestone: false,
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
      this.setData({ detail: await api.getOrderDetail(this.orderId, this.role) });
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
  cancel() {
    const text = this.data.detail.role === 'giver' ? '取消漂流' : '取消接漂';
    wx.showModal({ title: text, content: '发货前取消将记录信用积分变化，是否继续？', success: async (res) => {
      if (!res.confirm) return;
      await api.cancelOrder(this.orderId, text);
      await this.load();
    } });
  },
  confirm() {
    wx.showModal({ title: '确认收到图书', content: '确认后将完成公益积分记录。', success: async (res) => {
      if (!res.confirm) return;
      await api.confirmOrder(this.orderId);
      await this.load();
    } });
  },
  async addToShelf() {
    const result = await api.addReceivedBook(this.orderId);
    wx.showToast({ title: result.existed ? '已在书架中' : '已加入书架' });
  },
});
