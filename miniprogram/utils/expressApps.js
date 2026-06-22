// AppId 需在真机收藏对应小程序后核对；shortLink 为备用跳转方式。
const EXPRESS_MINI_PROGRAMS = [
  { id: 'cainiao', name: '菜鸟裹裹', appId: 'wx66188bf666705688', shortLink: 'mp://06ZExfzsQpSexDm' },
  { id: 'sf', name: '顺丰速运+', appId: 'wx5882299e98d3b22a', shortLink: 'mp://mugAZXcwStRa8wp' },
  { id: 'zto', name: '中通快递', appId: 'wx0b42aa50950c02e9', shortLink: 'mp://ead82evrqbSNlgD' },
  { id: 'jd', name: '京东快递', appId: 'wx73247a629467043c', shortLink: 'mp://Yu0xMAof8jOxQAb' },
  { id: 'other', name: '其他（自行打开）' },
];

const EXPRESS_APP_IDS = EXPRESS_MINI_PROGRAMS
  .map((item) => item.appId)
  .filter(Boolean);

function openExpressMiniProgram(app) {
  return new Promise((resolve, reject) => {
    if (!app || app.id === 'other') {
      reject(new Error('NO_JUMP'));
      return;
    }
    const options = { envVersion: 'release' };
    if (app.shortLink) options.shortLink = app.shortLink;
    else if (app.appId) options.appId = app.appId;
    else {
      reject(new Error('NO_TARGET'));
      return;
    }
    wx.navigateToMiniProgram({
      ...options,
      success: resolve,
      fail: reject,
    });
  });
}

module.exports = {
  EXPRESS_MINI_PROGRAMS,
  EXPRESS_APP_IDS,
  openExpressMiniProgram,
};
