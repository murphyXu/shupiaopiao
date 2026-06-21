const api = require('../../utils/api');

Page({
  data: { list: [], history: [], remark: '' },
  onShow() { this.load(); },
  async load() {
    const [openResult, resolvedResult] = await Promise.all([
      api.getDisputes('OPEN'),
      api.getDisputes('RESOLVED'),
    ]);
    this.setData({ list: openResult.list || [], history: resolvedResult.list || [] });
  },
  inputRemark(e) { this.setData({ remark: e.detail.value }); },
  async resolve(e) {
    const action = e.currentTarget.dataset.action;
    if (!action) return;
    const withCompensation = action === 'GIVER_FAULT_FIRST_WITH_COMP';
    const resolvedAction = withCompensation ? 'GIVER_FAULT_FIRST' : action;
    await api.resolveDispute(e.currentTarget.dataset.id, resolvedAction, withCompensation, this.data.remark);
    wx.showToast({ title: '已处理' });
    this.setData({ remark: '' });
    this.load();
  },
  preview(e) {
    const src = e.currentTarget.dataset.src;
    if (!src) return;
    wx.previewImage({ urls: [src], current: src });
  },
});
