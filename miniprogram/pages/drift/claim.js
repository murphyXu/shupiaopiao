const api = require('../../utils/api');
const { isLoggedIn, requireLogin } = require('../../utils/util');

Page({
  data: { item: null, address: null, balance: 0, available: 0, frozen: 0 },

  onLoad(options) {
    if (!isLoggedIn()) {
      requireLogin('接漂需登录');
      return;
    }
    this.driftId = options.driftId;
    Promise.all([
      api.getPoolDetail(options.driftId),
      api.getWalletBalance(),
      api.getAddresses(),
    ]).then(([item, wallet, addrRes]) => {
      const defaultAddr = addrRes.list.find((a) => a.isDefault) || addrRes.list[0];
      this.setData({ item, balance: wallet.balance, available: wallet.available, frozen: wallet.frozen, address: defaultAddr || null });
    });
  },

  selectAddress() {
    wx.navigateTo({ url: '/pages/mine/address?select=1' });
  },

  chooseWxAddress() {
    wx.chooseAddress({
      success: async (res) => {
        const region = [res.provinceName, res.cityName, res.countyName].filter(Boolean).join(' ');
        const data = {
          name: res.userName,
          phone: res.telNumber,
          region,
          detail: res.detailInfo,
          isDefault: true,
        };
        try {
          const address = await api.addAddress(data);
          this.setData({ address });
          wx.showToast({ title: '已读取微信地址' });
        } catch (e) {
          console.error(e);
        }
      },
      fail: () => {
        wx.showToast({ title: '未选择微信地址', icon: 'none' });
      },
    });
  },

  onShow() {
    const selected = wx.getStorageSync('selectedAddress');
    if (selected) {
      this.setData({ address: selected });
      wx.removeStorageSync('selectedAddress');
    }
  },

  async confirm() {
    if (!this.data.address) {
      wx.showToast({ title: '请选择地址', icon: 'none' });
      return;
    }
    try {
      await api.claimDrift(this.driftId, this.data.address.id);
      wx.showToast({ title: '申请已提交' });
      setTimeout(() => wx.redirectTo({ url: '/pages/drift/received' }), 1000);
    } catch (e) {
      console.error(e);
    }
  },
});
