const api = require('../../utils/api');
const { ORDER_STATUS } = require('../../utils/util');
const { prepareOrderList, resolveActiveTabFromStatus } = require('../../utils/orderList');
const { buildOrderMetaLine } = require('../../utils/orderMeta');
const { formatShipDeadlineRemaining } = require('../../utils/shipping');
const { SHIP_DEADLINE_LABEL } = require('../../utils/driftPolicy');
const {
  buildCancelSuccessTitle,
  cancelCreditDelta,
  promptCancelConfirm,
} = require('../../utils/pointFeedback');

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
  if (order.status === 'PENDING_SHIP') {
    const deadline = formatShipDeadlineRemaining(order.shipDeadlineAt);
    const base = '复制地址去寄快递，收到单号后回来填写';
    return deadline ? `${base}；${deadline}，超时将自动取消` : `${base}；请在 ${SHIP_DEADLINE_LABEL} 内寄出，超时将自动取消`;
  }
  if (order.status === 'SHIPPED') return '对方确认收货后，公益积分会自动到账';
  if (order.status === 'IN_POOL') return '有人申请接漂后，这里会提醒你寄出';
  return '';
}

function withProgress(list = []) {
  return list.map((order) => ({
    ...order,
    progressText: progressText(order),
    progressHint: progressHint(order),
    orderMetaLine: buildOrderMetaLine(order),
    canCancelOpen: !order.receiverId && !!order.driftId && OPEN_DRIFT_CANCEL_STATUSES.includes(order.status),
  }));
}

function buildDisplayItems(orders = []) {
  const seenBundles = new Set();
  const items = [];
  orders.forEach((order) => {
    if (order.status === 'PENDING_SHIP' && order.bundleId && !seenBundles.has(order.bundleId)) {
      const bundleOrders = orders.filter((row) => row.bundleId === order.bundleId && row.status === 'PENDING_SHIP');
      if (bundleOrders.length > 1) {
        seenBundles.add(order.bundleId);
        items.push({
          kind: 'bundle',
          displayId: `bundle-${order.bundleId}`,
          bundleId: order.bundleId,
          orderCount: bundleOrders.length,
          orders: bundleOrders,
          status: 'PENDING_SHIP',
          receiverNickname: bundleOrders[0].receiverNickname,
          shipDeadlineAt: bundleOrders[0].shipDeadlineAt,
          orderMetaLine: buildOrderMetaLine(bundleOrders[0]),
          progressText: `合并 ${bundleOrders.length} 本待寄出`,
          progressHint: progressHint(bundleOrders[0]),
        });
        return;
      }
    }
    if (order.bundleId && seenBundles.has(order.bundleId)) return;
    items.push({ kind: 'single', displayId: order.id, order, orderMetaLine: order.orderMetaLine });
  });
  return items;
}

Page({
  data: {
    displayItems: [],
    pendingShipCount: 0,
    statusMap: ORDER_STATUS,
    activeTab: 'all',
    statusTabs: [],
    shipDeadlineLabel: SHIP_DEADLINE_LABEL,
  },

  onLoad(options) {
    this.setData({ activeTab: resolveActiveTabFromStatus(options.status || '', 'given') });
  },

  onShow() {
    api.getOrders('given').then((res) => {
      const orders = withProgress(res.list || []);
      this._orders = orders;
      const { orders: visibleOrders, statusTabs } = prepareOrderList(orders, 'given', this.data.activeTab);
      this.setData({
        displayItems: buildDisplayItems(visibleOrders),
        pendingShipCount: orders.filter((order) => order.status === 'PENDING_SHIP').length,
        statusTabs,
      });
    });
  },

  switchStatusTab(e) {
    const activeTab = e.currentTarget.dataset.key || 'all';
    if (activeTab === this.data.activeTab) return;
    this.setData({ activeTab }, () => this.onShow());
  },

  ship(e) {
    const bundleId = e.currentTarget.dataset.bundleId;
    const orderId = e.currentTarget.dataset.id;
    if (bundleId) {
      wx.navigateTo({ url: `/pages/drift/ship?bundleId=${bundleId}` });
      return;
    }
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

  async cancel(e) {
    const orderId = e.currentTarget.dataset.id;
    if (!orderId) return;
    const order = (this._orders || []).find((item) => item.id === orderId) || {};
    const confirmed = await promptCancelConfirm({
      title: '取消漂流',
      role: 'GIVER',
      coinValue: order.coinValue,
      creditDelta: cancelCreditDelta('GIVER'),
    });
    if (!confirmed) return;
    await api.cancelOrder(orderId, '取消漂流');
    wx.showToast({ title: buildCancelSuccessTitle(), icon: 'none' });
    this.onShow();
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

  async enableSubscribeNotify() {
    const pending = (this._orders || []).find((order) => order.status === 'PENDING_SHIP' && order.driftId);
    if (!pending) {
      wx.showToast({ title: '暂无待发货图书', icon: 'none' });
      return;
    }
    try {
      const { subscribeDriftNotifications } = require('../../utils/subscribe');
      const res = await subscribeDriftNotifications(pending.driftId);
      wx.showToast({
        title: (res.recorded || 0) > 0 ? '已开启微信提醒' : '未开启微信提醒',
        icon: 'none',
      });
    } catch (err) {
      wx.showToast({ title: '提醒设置未保存', icon: 'none' });
    }
  },
});
