const api = require('../../utils/api');
const { EXPRESS_COMPANIES } = require('../../utils/util');
const {
  formatRegion,
  shippingInfoText,
  hasShippingInfo,
  formatShipDeadlineRemaining,
} = require('../../utils/shipping');
const { EXPRESS_MINI_PROGRAMS, openExpressMiniProgram } = require('../../utils/expressApps');
const { validateTrackingNo } = require('../../utils/trackingNo');

Page({
  data: {
    loading: true,
    isBundle: false,
    bundleCount: 1,
    detail: null,
    bundleDetail: null,
    regionText: '',
    deadlineText: '',
    expressCompanies: EXPRESS_COMPANIES,
    expressIndex: 0,
    trackingNo: '',
    trackingError: '',
    submitting: false,
    canSubmit: false,
  },

  onLoad(options) {
    this.orderId = options.orderId || '';
    this.bundleId = options.bundleId || '';
    this.lastCopiedAt = 0;
  },

  onShow() {
    this.load();
  },

  async load() {
    if (!this.orderId && !this.bundleId) {
      wx.showToast({ title: '漂流记录不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.setData({ loading: true });
    try {
      if (this.bundleId) {
        const bundleDetail = await api.getBundleDetail({ bundleId: this.bundleId });
        if (!bundleDetail.actions || !bundleDetail.actions.canShip) {
          const firstOrder = (bundleDetail.orders || [])[0];
          if (firstOrder && firstOrder.id) {
            wx.redirectTo({ url: `/pages/drift/order-detail?orderId=${firstOrder.id}&role=given` });
          } else {
            wx.navigateBack();
          }
          return;
        }
        const address = (bundleDetail.bundle && bundleDetail.bundle.addressSnapshot) || {};
        const bundleCount = (bundleDetail.bundle && bundleDetail.bundle.orderCount) || (bundleDetail.orders || []).length;
        this.setData({
          isBundle: true,
          bundleCount,
          bundleDetail,
          detail: { order: { addressSnapshot: address, book: (bundleDetail.orders || [])[0] && (bundleDetail.orders || [])[0].book } },
          regionText: formatRegion(address.region),
          deadlineText: formatShipDeadlineRemaining(bundleDetail.bundle && bundleDetail.bundle.shipDeadlineAt),
          loading: false,
        });
        wx.setNavigationBarTitle({ title: `合并寄出 · ${bundleCount} 本` });
        return;
      }

      const detail = await api.getOrderDetail(this.orderId, 'given');
      const order = detail.order || {};
      if (order.status !== 'PENDING_SHIP') {
        wx.redirectTo({ url: `/pages/drift/order-detail?orderId=${this.orderId}&role=given` });
        return;
      }
      const address = order.addressSnapshot || {};
      this.setData({
        isBundle: false,
        bundleCount: 1,
        detail,
        bundleDetail: null,
        regionText: formatRegion(address.region),
        deadlineText: formatShipDeadlineRemaining(order.shipDeadlineAt),
        loading: false,
      });
      wx.setNavigationBarTitle({ title: '发货' });
    } catch (err) {
      console.error(err);
      this.setData({ loading: false });
      setTimeout(() => wx.navigateBack(), 800);
    }
  },

  selectExpress(e) {
    const expressIndex = Number(e.detail.value) || 0;
    this.updateTrackingState(this.data.trackingNo, expressIndex);
  },

  inputTracking(e) {
    this.updateTrackingState(e.detail.value, this.data.expressIndex);
  },

  updateTrackingState(raw, expressIndex = this.data.expressIndex) {
    const expressCompany = this.data.expressCompanies[expressIndex];
    const check = validateTrackingNo(raw, expressCompany);
    const trackingError = check.normalized.length >= 8 && !check.ok
      ? check.message
      : (/[^\x00-\x7F]/.test(String(raw || '')) && !check.ok ? check.message : '');
    this.setData({
      expressIndex,
      trackingNo: check.normalized || String(raw || ''),
      trackingError,
      canSubmit: check.ok,
    });
  },

  copyShippingInfo() {
    this.copyAddressToClipboard(true);
  },

  copyAddressToClipboard(showToast = true) {
    const address = this.data.detail && this.data.detail.order && this.data.detail.order.addressSnapshot;
    if (!hasShippingInfo(address)) {
      if (showToast) wx.showToast({ title: '暂无寄送信息', icon: 'none' });
      return Promise.reject(new Error('NO_ADDRESS'));
    }
    const now = Date.now();
    if (now - this.lastCopiedAt < 3000) {
      if (showToast) wx.showToast({ title: '收件信息已复制', icon: 'none' });
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      wx.setClipboardData({
        data: shippingInfoText(address),
        success: () => {
          this.lastCopiedAt = Date.now();
          if (showToast) wx.showToast({ title: '收件信息已复制', icon: 'none' });
          resolve();
        },
        fail: reject,
      });
    });
  },

  openExpressSheet() {
    wx.showActionSheet({
      itemList: EXPRESS_MINI_PROGRAMS.map((item) => item.name),
      success: (res) => {
        const app = EXPRESS_MINI_PROGRAMS[res.tapIndex];
        if (app) this.copyAndOpenExpress(app);
      },
    });
  },

  async copyAndOpenExpress(app) {
    try {
      await this.copyAddressToClipboard(false);
    } catch (err) {
      return;
    }
    if (app.id === 'other') {
      wx.showToast({ title: '收件信息已复制', icon: 'none' });
      return;
    }
    wx.showToast({ title: `收件信息已复制，正在打开${app.name}`, icon: 'none', duration: 2000 });
    try {
      await openExpressMiniProgram(app);
    } catch (err) {
      wx.showToast({ title: `请手动打开${app.name}，收件信息已复制`, icon: 'none' });
    }
  },

  cancel() {
    wx.showModal({
      title: '取消漂流',
      content: '发货前取消将释放接漂方占用积分，并记录信用积分变化。是否继续？',
      success: async (res) => {
        if (!res.confirm) return;
        const firstOrder = this.data.isBundle
          ? ((this.data.bundleDetail && this.data.bundleDetail.orders) || [])[0]
          : null;
        const orderId = firstOrder ? firstOrder.id : this.orderId;
        await api.cancelOrder(orderId, '取消漂流');
        wx.navigateBack();
      },
    });
  },

  async submit() {
    const expressCompany = this.data.expressCompanies[this.data.expressIndex];
    const check = validateTrackingNo(this.data.trackingNo, expressCompany);
    if (!check.ok) {
      this.setData({ trackingError: check.message, canSubmit: false });
      wx.showToast({ title: check.message || '请输入运单号', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    try {
      if (this.bundleId) {
        await api.shipBundle({
          bundleId: this.bundleId,
          expressCompany,
          trackingNo: check.normalized,
        });
        const firstOrder = ((this.data.bundleDetail && this.data.bundleDetail.orders) || [])[0];
        if (firstOrder && firstOrder.id) {
          wx.redirectTo({ url: `/pages/drift/order-detail?orderId=${firstOrder.id}&role=given` });
        } else {
          wx.navigateBack();
        }
        return;
      }
      await api.shipOrder(this.orderId, {
        expressCompany,
        trackingNo: check.normalized,
      });
      wx.redirectTo({ url: `/pages/drift/order-detail?orderId=${this.orderId}&role=given` });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
