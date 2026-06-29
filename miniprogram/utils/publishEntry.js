const { requireLogin } = require('./util');

function scanAndOpenPublish() {
  wx.scanCode({
    scanType: ['barCode'],
    success: (res) => {
      const isbn = res.result.replace(/[^0-9X]/gi, '');
      wx.navigateTo({ url: `/pages/drift/scan-publish?isbn=${encodeURIComponent(isbn)}` });
    },
  });
}

function showPublishEntryOptions() {
  if (!requireLogin('登录后可发起漂流赠书')) return;
  wx.showActionSheet({
    itemList: ['直接扫码上漂', '书架选书上漂'],
    success: (res) => {
      if (res.tapIndex === 0) {
        scanAndOpenPublish();
        return;
      }
      if (res.tapIndex === 1) {
        wx.navigateTo({ url: '/pages/drift/publish?mode=shelf' });
      }
    },
  });
}

module.exports = {
  showPublishEntryOptions,
  scanAndOpenPublish,
};
