function getWindowInfo(getWindowInfoFn) {
  if (typeof getWindowInfoFn === 'function') return getWindowInfoFn();
  try {
    return wx.getWindowInfo();
  } catch (err) {
    return wx.getSystemInfoSync();
  }
}

function measureMoreFilterLayout(getWindowInfoFn) {
  const info = getWindowInfo(getWindowInfoFn);
  const windowHeight = info.windowHeight || 667;
  const safeBottom = info.safeArea
    ? Math.max((info.screenHeight || windowHeight) - info.safeArea.bottom, 0)
    : 0;
  return {
    filterFootPadding: safeBottom,
    filterCompact: windowHeight < 720,
  };
}

module.exports = {
  measureMoreFilterLayout,
};
