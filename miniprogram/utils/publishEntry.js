const { requireLogin } = require('./util');

function showPublishEntryOptions() {
  if (!requireLogin('登录后可发起漂流赠书')) return;
  wx.showActionSheet({
    itemList: ['连续扫码上漂', '书架选书上漂'],
    success: (res) => {
      if (res.tapIndex === 0) {
        wx.navigateTo({ url: '/pages/drift/scan-publish' });
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
};
