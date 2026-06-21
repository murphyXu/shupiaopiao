Page({
  data: { trackingNo: '', expressCompany: '' },

  onLoad(options) {
    this.setData({
      trackingNo: options.trackingNo,
      expressCompany: options.expressCompany || '',
    });
  },
});
