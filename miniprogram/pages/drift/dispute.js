const api = require('../../utils/api');

Page({
  data: { reason: '', images: [], submitting: false },
  onLoad(options) { this.orderId = options.orderId; },
  inputReason(e) { this.setData({ reason: e.detail.value }); },
  chooseEvidence() {
    wx.chooseMedia({ count: 3, mediaType: ['image'], success: async (res) => {
      const images = [];
      for (const file of res.tempFiles || []) images.push(await api.uploadImage(file.tempFilePath));
      this.setData({ images });
    } });
  },
  async submit() {
    if (!String(this.data.reason).trim()) return wx.showToast({ title: '请填写申诉原因', icon: 'none' });
    this.setData({ submitting: true });
    try { await api.createDispute(this.orderId, { reason: this.data.reason, images: this.data.images }); wx.navigateBack(); }
    finally { this.setData({ submitting: false }); }
  },
});
