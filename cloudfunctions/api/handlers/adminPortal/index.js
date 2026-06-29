const auth = require('./auth');
const orders = require('./orders');
const users = require('./users');
const drifts = require('./drifts');

const ROUTES = {
  'admin.auth.login': (data, openid, ctx, adminCtx, headers) => auth.login(data, openid, ctx, adminCtx, headers),
  'admin.auth.me': (data, openid, ctx, adminCtx, headers) => auth.me(data, openid, ctx, adminCtx, headers),

  'admin.orders.list': (data, openid, ctx, adminCtx, headers) => orders.list(data, openid, ctx, adminCtx, headers),
  'admin.orders.detail': (data, openid, ctx, adminCtx, headers) => orders.detail(data, openid, ctx, adminCtx, headers),
  'admin.orders.todos': (data, openid, ctx, adminCtx, headers) => orders.todos(data, openid, ctx, adminCtx, headers),
  'admin.orders.forceCancel': (data, openid, ctx, adminCtx, headers) => orders.forceCancel(data, openid, ctx, adminCtx, headers),
  'admin.orders.forceComplete': (data, openid, ctx, adminCtx, headers) => orders.forceComplete(data, openid, ctx, adminCtx, headers),
  'admin.orders.extendDeadline': (data, openid, ctx, adminCtx, headers) => orders.extendDeadline(data, openid, ctx, adminCtx, headers),

  'admin.users.list': (data, openid, ctx, adminCtx, headers) => users.list(data, openid, ctx, adminCtx, headers),
  'admin.users.detail': (data, openid, ctx, adminCtx, headers) => users.detail(data, openid, ctx, adminCtx, headers),
  'admin.users.adjustCoin': (data, openid, ctx, adminCtx, headers) => users.adjustCoin(data, openid, ctx, adminCtx, headers),
  'admin.users.adjustCredit': (data, openid, ctx, adminCtx, headers) => users.adjustCredit(data, openid, ctx, adminCtx, headers),

  'admin.drifts.list': (data, openid, ctx, adminCtx, headers) => drifts.list(data, openid, ctx, adminCtx, headers),
  'admin.drifts.detail': (data, openid, ctx, adminCtx, headers) => drifts.detail(data, openid, ctx, adminCtx, headers),
  'admin.drifts.updateCoin': (data, openid, ctx, adminCtx, headers) => drifts.updateCoin(data, openid, ctx, adminCtx, headers),
  'admin.drifts.updateCategory': (data, openid, ctx, adminCtx, headers) => drifts.updateCategory(data, openid, ctx, adminCtx, headers),
  'admin.drifts.updateStatus': (data, openid, ctx, adminCtx, headers) => drifts.updateStatus(data, openid, ctx, adminCtx, headers),
  'admin.drifts.statusOptions': (data, openid, ctx, adminCtx, headers) => drifts.statusOptions(data, openid, ctx, adminCtx, headers),
  'admin.drifts.pin': (data, openid, ctx, adminCtx, headers) => drifts.pin(data, openid, ctx, adminCtx, headers),
  'admin.drifts.unpin': (data, openid, ctx, adminCtx, headers) => drifts.unpin(data, openid, ctx, adminCtx, headers),
  'admin.drifts.reorderPins': (data, openid, ctx, adminCtx, headers) => drifts.reorderPins(data, openid, ctx, adminCtx, headers),
  'admin.drifts.listPinned': (data, openid, ctx, adminCtx, headers) => drifts.listPinned(data, openid, ctx, adminCtx, headers),
  'admin.drifts.hide': (data, openid, ctx, adminCtx, headers) => drifts.hide(data, openid, ctx, adminCtx, headers),
  'admin.drifts.show': (data, openid, ctx, adminCtx, headers) => drifts.show(data, openid, ctx, adminCtx, headers),
  'admin.drifts.removeFromPool': (data, openid, ctx, adminCtx, headers) => drifts.removeFromPool(data, openid, ctx, adminCtx, headers),
  'admin.drifts.approve': (data, openid, ctx, adminCtx, headers) => drifts.approve(data, openid, ctx, adminCtx, headers),
  'admin.drifts.reject': (data, openid, ctx, adminCtx, headers) => drifts.reject(data, openid, ctx, adminCtx, headers),
};

function getHandler(action) {
  return ROUTES[action] || null;
}

module.exports = { ROUTES, getHandler };
