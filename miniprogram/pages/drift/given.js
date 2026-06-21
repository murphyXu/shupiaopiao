const api = require('../../utils/api');
const { ORDER_STATUS } = require('../../utils/util');

const OPEN_DRIFT_CANCEL_STATUSES = ['PENDING_REVIEW', 'IN_POOL'];

function progressText(order) {
  const status = order.status;
  if (status === 'CHECKING') return '已提交，正在检查上漂信息';
  if (status === 'PENDING_REVIEW') return '已提交，等待系统审核通过后公开展示';
  if (status === 'IN_POOL') return '已进入漂流池，等待书友申请接漂';
  if (status === 'REJECTED') return '未通过，请根据原因修改后重试';
  if (status === 'PENDING_SHIP') return '已被领取，请确认漂流出去并尽快寄出';
  if (status === 'SHIPPED') return '已寄出，等待对方确认收货';
  if (status === 'DONE' || status === 'COMPLETED') return '对方已确认收货，公益积分已到账';
  return ORDER_STATUS[status] || status || '进展更新中';
}

function progressHint(order) {
  if (order.status === 'PENDING_SHIP') return '录入快递单号后，领取方会看到物流进展';
  if (order.status === 'SHIPPED') return '对方确认收货后，公益积分会自动到账';
  if (order.status === 'IN_POOL') return '有人申请接漂后，这里会提醒你寄出';
  return '';
}

function withProgress(list = []) {
  return list.map((order) => ({
    ...order,
    progressText: progressText(order),
    progressHint: progressHint(order),
    canCancelOpen: !order.receiverId && !!order.driftId && OPEN_DRIFT_CANCEL_STATUSES.includes(order.status),
  }));
}

function shippingInfoText(address = {}) {
  const region = Array.isArray(address.region) ? address.region.join('') : String(address.region || '');
  return [
    `收件人：${address.name || ''}`,
    `联系电话：${address.phone || ''}`,
    `收件地址：${region}${address.detail || ''}`,
  ].join('\n');
}

function hasShippingInfo(address = {}) {
  return !!(address.name || address.phone || address.region || address.detail);
}

Page({
  data: { orders: [], pendingShipCount: 0, statusMap: ORDER_STATUS, statusFilter: '' },

  onLoad(options) {
    this.setData({ statusFilter: options.status || '' });
  },

  onShow() {
    api.getOrders('given', this.data.statusFilter || undefined).then((res) => {
      const orders = withProgress(res.list || []);
      this.setData({
        orders,
        pendingShipCount: orders.filter((order) => order.status === 'PENDING_SHIP').length,
      });
    });
  },

  ship(e) {
    const orderId = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/drift/ship?orderId=${orderId}` });
  },

  viewDetail(e) {
    const orderId = e.currentTarget.dataset.id;
    if (!orderId || String(orderId).startsWith('drift-')) {
      wx.showToast({ title: '该记录暂无履约详情', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: `/pages/drift/order-detail?orderId=${orderId}&role=given` });
  },

  async copyShippingInfo(e) {
    const orderId = e.currentTarget.dataset.id;
    if (!orderId || String(orderId).startsWith('drift-')) {
      wx.showToast({ title: '暂无寄送信息', icon: 'none' });
      return;
    }
    const detail = await api.getOrderDetail(orderId, 'given');
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

  cancel(e) {
    const orderId = e.currentTarget.dataset.id;
    if (!orderId) return;
    wx.showModal({
      title: '取消漂流',
      content: '发货前取消将释放接漂方占用积分，并记录信用积分变化。是否继续？',
      success: async (res) => {
        if (!res.confirm) return;
        await api.cancelOrder(orderId, '取消漂流');
        wx.showToast({ title: '已取消', icon: 'none' });
        this.onShow();
      },
    });
  },

  cancelOpenDrift(e) {
    const driftId = e.currentTarget.dataset.driftId;
    if (!driftId) return;
    wx.showModal({
      title: '取消漂流',
      content: '取消后这本书会恢复为可发起漂流状态，是否继续？',
      success: async (res) => {
        if (!res.confirm) return;
        await api.cancelOpenDrift(driftId, '用户取消未接漂记录');
        wx.showToast({ title: '已取消', icon: 'none' });
        this.onShow();
      },
    });
  },

  viewLogistics(e) {
    const { no, company } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/mine/logistics?trackingNo=${no}&expressCompany=${company}` });
  },
});
