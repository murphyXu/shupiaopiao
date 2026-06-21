const api = require('../../utils/api');

Page({
  data: {
    nickname: '',
    avatar: '',
    childAgeRange: '',
    addressId: '',
    addressName: '',
    addressPhone: '',
    addressRegion: '',
    addressDetail: '',
    ageRanges: [
      { key: '0-3', label: '0-3岁' },
      { key: '3-6', label: '3-6岁' },
      { key: '6-9', label: '6-9岁' },
      { key: '9-12', label: '9-12岁' },
    ],
  },

  onLoad() {
    const user = wx.getStorageSync('userInfo') || {};
    this.setData({
      nickname: user.nickname || '',
      avatar: user.avatar || '',
      childAgeRange: user.childAgeRange || '',
    });
    this.loadDefaultAddress();
  },

  async loadDefaultAddress() {
    try {
      const res = await api.getAddresses();
      const address = (res.list || []).find((item) => item.isDefault) || (res.list || [])[0];
      if (!address) return;
      this.setData({
        addressId: address.id,
        addressName: address.name || '',
        addressPhone: address.phone || '',
        addressRegion: address.region || '',
        addressDetail: address.detail || '',
      });
    } catch (e) {
      console.warn('[profile] address skipped', e);
    }
  },

  onChooseAvatar(e) {
    this.setData({ avatar: e.detail.avatarUrl });
  },

  onNickname(e) {
    this.setData({ nickname: e.detail.value });
  },

  selectAge(e) {
    this.setData({ childAgeRange: e.currentTarget.dataset.key });
  },

  onAddressName(e) { this.setData({ addressName: e.detail.value }); },
  onAddressPhone(e) { this.setData({ addressPhone: e.detail.value }); },
  onAddressRegion(e) { this.setData({ addressRegion: e.detail.value }); },
  onAddressDetail(e) { this.setData({ addressDetail: e.detail.value }); },

  chooseWxAddress() {
    wx.chooseAddress({
      success: (res) => {
        const region = [res.provinceName, res.cityName, res.countyName].filter(Boolean).join(' ');
        this.setData({
          addressName: res.userName || '',
          addressPhone: res.telNumber || '',
          addressRegion: region,
          addressDetail: res.detailInfo || '',
        });
      },
      fail: () => {
        wx.showToast({ title: '未选择微信地址', icon: 'none' });
      },
    });
  },

  addressPayload() {
    const payload = {
      name: this.data.addressName.trim(),
      phone: this.data.addressPhone.trim(),
      region: this.data.addressRegion.trim(),
      detail: this.data.addressDetail.trim(),
      isDefault: true,
    };
    const values = [payload.name, payload.phone, payload.region, payload.detail];
    if (values.every((value) => !value)) return null;
    if (values.some((value) => !value)) {
      wx.showToast({ title: '请补全收货地址', icon: 'none' });
      return false;
    }
    return payload;
  },

  async save() {
    try {
      const address = this.addressPayload();
      if (address === false) return;
      const user = await api.updateProfile({
        nickname: this.data.nickname,
        avatar: this.data.avatar,
        childAgeRange: this.data.childAgeRange,
      });
      if (address) {
        if (this.data.addressId) {
          await api.updateAddress(this.data.addressId, address);
        } else {
          const savedAddress = await api.addAddress(address);
          this.setData({ addressId: savedAddress.id });
        }
      }
      wx.setStorageSync('userInfo', user);
      getApp().globalData.userInfo = user;
      wx.showToast({ title: '保存成功' });
      setTimeout(() => wx.navigateBack(), 1000);
    } catch (e) {
      console.error(e);
    }
  },
});
