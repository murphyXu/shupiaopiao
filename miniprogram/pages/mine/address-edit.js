const api = require('../../utils/api');

Page({
  data: { id: '', name: '', phone: '', region: '', detail: '', isDefault: false },

  onLoad(options) {
    if (options.id) {
      this.setData({ id: options.id });
      api.getAddresses().then((res) => {
        const addr = res.list.find((a) => a.id === options.id);
        if (addr) this.setData(addr);
      });
    }
  },

  onName(e) { this.setData({ name: e.detail.value }); },
  onPhone(e) { this.setData({ phone: e.detail.value }); },
  onRegion(e) { this.setData({ region: e.detail.value }); },
  onDetail(e) { this.setData({ detail: e.detail.value }); },
  onDefault(e) { this.setData({ isDefault: e.detail.value }); },

  async save() {
    const data = {
      name: this.data.name,
      phone: this.data.phone,
      region: this.data.region,
      detail: this.data.detail,
      isDefault: this.data.isDefault,
    };
    if (this.data.id) {
      await api.updateAddress(this.data.id, data);
    } else {
      await api.addAddress(data);
    }
    wx.showToast({ title: '保存成功' });
    setTimeout(() => wx.navigateBack(), 800);
  },
});
