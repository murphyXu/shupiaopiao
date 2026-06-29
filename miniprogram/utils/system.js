/**
 * 获取系统安全区信息（适配灵动岛 / 刘海屏 / 胶囊按钮）
 */
function getSystemMetrics() {
  let windowInfo = {};
  let deviceInfo = {};

  try {
    windowInfo = wx.getWindowInfo();
  } catch (e) {
    windowInfo = wx.getSystemInfoSync();
  }

  try {
    deviceInfo = wx.getDeviceInfo();
  } catch (e) {
    deviceInfo = {};
  }

  const statusBarHeight = windowInfo.statusBarHeight || 20;
  const safeArea = windowInfo.safeArea || {
    top: statusBarHeight,
    bottom: windowInfo.windowHeight || windowInfo.screenHeight || 0,
    left: 0,
    right: windowInfo.windowWidth || windowInfo.screenWidth || 375,
  };

  let menuButton = {
    top: statusBarHeight + 4,
    height: 32,
    bottom: statusBarHeight + 36,
    left: (windowInfo.windowWidth || 375) - 100,
    right: windowInfo.windowWidth || 375,
    width: 87,
  };
  try {
    const rect = wx.getMenuButtonBoundingClientRect();
    if (rect && rect.height) menuButton = rect;
  } catch (e) {
    // ignore
  }

  const safeTop = Math.max(safeArea.top || 0, statusBarHeight);
  const navBarHeight = (menuButton.top - statusBarHeight) * 2 + menuButton.height;
  const stickyTop = statusBarHeight + navBarHeight;
  // 内容从胶囊按钮下方开始，避免标题与灵动岛/胶囊重叠
  const navPaddingTop = Math.max(menuButton.bottom + 10, safeTop + 20);
  // 右侧可交互区域须避开胶囊
  const contentPaddingRight = Math.max((windowInfo.windowWidth || 375) - menuButton.left + 8, 16);

  return {
    statusBarHeight,
    navBarHeight,
    stickyTop,
    safeAreaTop: safeTop,
    navPaddingTop,
    contentPaddingRight,
    menuButtonBottom: menuButton.bottom,
    platform: deviceInfo.platform || windowInfo.platform || '',
  };
}

module.exports = { getSystemMetrics };
