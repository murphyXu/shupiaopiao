const api = require('../../utils/api');
const { isLoggedIn, requireLogin } = require('../../utils/util');
const { onCoverError } = require('../../utils/cover');
const { shippingDistanceHint } = require('../../utils/shipRegion');
const { trackPageView, track } = require('../../utils/track');

function buildShippingHint(item, address) {
  if (!item || !item.shipFrom) return '';
  return shippingDistanceHint(address && address.region, item.shipFrom);
}

Page({
  data: { item: null, address: null, balance: 0, available: 0, frozen: 0, shippingHint: '' },

  onLoad(options) {
    if (!isLoggedIn()) {
      requireLogin('接漂需登录');
      return;
    }
    this.driftId = options.driftId;
    trackPageView('drift/claim', { driftId: options.driftId || '' });
    Promise.all([
      api.getPoolDetail(options.driftId),
      api.getWalletBalance(),
      api.getAddresses(),
    ]).then(([item, wallet, addrRes]) => {
      const defaultAddr = addrRes.list.find((a) => a.isDefault) || addrRes.list[0];
      const address = defaultAddr || null;
      this.setData({
        item,
        balance: wallet.balance,
        available: wallet.available,
        frozen: wallet.frozen,
        address,
        shippingHint: buildShippingHint(item, address),
      });
    });
  },

  goSameGiverItem(e) {
    const { id } = e.currentTarget.dataset;
    if (!id || id === this.driftId) return;
    wx.redirectTo({ url: `/pages/pool/detail?id=${id}` });
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
          this.setData({
            address,
            shippingHint: buildShippingHint(this.data.item, address),
          });
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
      this.setData({
        address: selected,
        shippingHint: buildShippingHint(this.data.item, selected),
      });
      wx.removeStorageSync('selectedAddress');
    }
  },

  async confirm() {
    if (!this.data.address) {
      wx.showToast({ title: '请选择地址', icon: 'none' });
      return;
    }
    try {
      track('drift_claim_submit', { driftId: this.driftId });
      const result = await api.claimDrift(this.driftId, this.data.address.id);
      if (result.merged) {
        wx.showToast({ title: '已与上一本合并寄出', icon: 'none' });
      } else {
        wx.showToast({ title: '申请已提交' });
      }
      setTimeout(() => wx.redirectTo({ url: '/pages/drift/received?milestone=claim' }), 1000);
    } catch (e) {
      console.error(e);
    }
  },

  onCoverError,
});
