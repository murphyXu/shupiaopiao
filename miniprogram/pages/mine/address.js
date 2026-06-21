const api = require('../../utils/api');

Page({
  data: { list: [], selectMode: false },

  onLoad(options) {
    this.setData({ selectMode: options.select === '1' });
  },

  onShow() {
    api.getAddresses().then((res) => this.setData({ list: res.list }));
  },

  onSelect(e) {
    if (!this.data.selectMode) return;
    const addr = this.data.list.find((a) => a.id === e.currentTarget.dataset.id);
    wx.setStorageSync('selectedAddress', addr);
    wx.navigateBack();
  },

  add() {
    wx.navigateTo({ url: '/pages/mine/address-edit' });
  },

  edit(e) {
    wx.navigateTo({ url: `/pages/mine/address-edit?id=${e.currentTarget.dataset.id}` });
  },

  remove(e) {
    wx.showModal({
      title: '删除地址',
      success: async (res) => {
        if (res.confirm) {
          await api.deleteAddress(e.currentTarget.dataset.id);
          this.onShow();
        }
      },
    });
  },
});
