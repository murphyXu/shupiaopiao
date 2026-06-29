const { fetchPendingShipSummary, formatTabBadge } = require('./pendingShip');

/** 同步自定义 TabBar 选中态 */
function setTabBarIndex(index) {
  if (typeof this.getTabBar === 'function' && this.getTabBar()) {
    this.getTabBar().setData({ selected: index });
  }
}

function applyTabBarData(patch) {
  const pages = getCurrentPages();
  for (let i = pages.length - 1; i >= 0; i -= 1) {
    const page = pages[i];
    if (typeof page.getTabBar !== 'function') continue;
    const tabBar = page.getTabBar();
    if (tabBar) {
      tabBar.setData(patch);
      return true;
    }
  }
  return false;
}

function setTabBarHidden(hidden) {
  return applyTabBarData({ hidden: !!hidden });
}

function applyTabBarBadge(badge) {
  return applyTabBarData({ mineBadge: badge });
}

/** 刷新「我的」Tab 待发货角标（仅角标，无横幅） */
function refreshTabBarPendingShip() {
  return fetchPendingShipSummary().then(({ pendingShip }) => {
    const badge = formatTabBadge(pendingShip);
    applyTabBarBadge(badge);
    try {
      const app = getApp();
      if (app && app.globalData) {
        app.globalData.pendingShipBadge = badge;
        app.globalData.pendingShipCount = pendingShip;
      }
    } catch (err) { /* 非 Tab 页冷启动 */ }
    return { pendingShip, badge };
  });
}

module.exports = {
  setTabBarIndex,
  setTabBarHidden,
  refreshTabBarPendingShip,
};
