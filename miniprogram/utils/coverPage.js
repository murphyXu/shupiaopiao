function reloadIfCoversUpdated(reloadFn) {
  const app = getApp();
  if (app && app.globalData.coversUpdated) {
    app.globalData.coversUpdated = false;
    reloadFn();
  }
}

module.exports = { reloadIfCoversUpdated };
