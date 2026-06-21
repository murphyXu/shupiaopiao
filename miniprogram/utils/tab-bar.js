/** 同步自定义 TabBar 选中态 */
function setTabBarIndex(index) {
  if (typeof this.getTabBar === 'function' && this.getTabBar()) {
    this.getTabBar().setData({ selected: index });
  }
}

module.exports = { setTabBarIndex };
