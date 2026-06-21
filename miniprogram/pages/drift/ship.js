const api = require('../../utils/api');
const { EXPRESS_COMPANIES } = require('../../utils/util');

Page({
  data: { expressCompanies: EXPRESS_COMPANIES, expressIndex: 0, trackingNo: '', submitting: false },
  onLoad(options) { this.orderId = options.orderId; },
  selectExpress(e) { this.setData({ expressIndex: Number(e.detail.value) || 0 }); },
  inputTracking(e) { this.setData({ trackingNo: e.detail.value }); },
  async submit() {
    const trackingNo = String(this.data.trackingNo || '').trim();
    if (!trackingNo) return wx.showToast({ title: '请输入运单号', icon: 'none' });
    this.setData({ submitting: true });
    try {
      await api.shipOrder(this.orderId, { expressCompany: this.data.expressCompanies[this.data.expressIndex], trackingNo });
      wx.redirectTo({ url: `/pages/drift/order-detail?orderId=${this.orderId}` });
    } finally { this.setData({ submitting: false }); }
  },
});
