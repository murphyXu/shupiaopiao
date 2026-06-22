const { env } = require('../config/index');
const { normalizeBooksDeep, normalizeBook } = require('./cover');
const { cacheRemoteCover, cacheRemoteCovers } = require('./coverRefresh');

function enrichData(action, data) {
  if (!data) return data;
  if (action === 'books.search') {
    const list = (data.list || []).map(normalizeBook);
    cacheRemoteCovers(list);
    return { ...data, list };
  }
  if (action === 'books.isbn' || action === 'books.detail') {
    const book = normalizeBook(data);
    cacheRemoteCover(book);
    return book;
  }
  return normalizeBooksDeep(data);
}

function call(action, data = {}, options = {}) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'api',
      data: { action, data },
    }).then((res) => {
      const result = res.result || {};
      if (result.code === 0) {
        resolve(enrichData(action, result.data));
      } else if (result.code === 401) {
        wx.removeStorageSync('userInfo');
        const msg = result.msg || '请先登录';
        if (options.showError !== false) wx.showToast({ title: msg, icon: 'none' });
        reject(new Error(msg));
      } else {
        const msg = result.msg || '请求失败';
        if (options.showError !== false) wx.showToast({ title: msg, icon: 'none' });
        reject(new Error(msg));
      }
    }).catch((err) => {
      const msg = '云函数调用失败，请确认已开通云开发并上传云函数';
      if (options.showError !== false) wx.showToast({ title: msg, icon: 'none', duration: 3000 });
      reject(err || new Error(msg));
    });
  });
}

function uploadImage(filePath) {
  const ext = (filePath.match(/\.(\w+)$/) || [, 'jpg'])[1];
  const cloudPath = `drift/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  return wx.cloud.uploadFile({ cloudPath, filePath }).then((res) => res.fileID);
}

function actionsForFallbackOrder(order, role) {
  return {
    canShip: role === 'giver' && order.status === 'PENDING_SHIP',
    canCancel: ['giver', 'receiver'].includes(role) && order.status === 'PENDING_SHIP',
    canConfirm: role === 'receiver' && order.status === 'SHIPPED',
    canDispute: ['giver', 'receiver'].includes(role) && order.status === 'SHIPPED',
    canReview: ['giver', 'receiver'].includes(role) && order.status === 'DONE',
    canAddToShelf: role === 'receiver' && order.status === 'DONE',
  };
}

async function fallbackOrderDetail(orderId, sourceRole = '') {
  const roles = sourceRole ? [sourceRole] : ['given', 'received'];
  for (const roleName of roles) {
    const result = await call('drift.orders', { role: roleName }, { showError: false });
    const order = (result.list || []).find((item) => item.id === orderId);
    if (order) {
      const role = roleName === 'given' ? 'giver' : 'receiver';
      return {
        fallback: true,
        order,
        role,
        actions: actionsForFallbackOrder(order, role),
      };
    }
  }
  throw new Error('漂流记录不存在');
}

async function getOrderDetail(orderId, sourceRole = '') {
  try {
    return await call('drift.orderDetail', { orderId }, { showError: false });
  } catch (err) {
    if (!String(err.message || '').includes('未知 action')) throw err;
    return fallbackOrderDetail(orderId, sourceRole);
  }
}

module.exports = {
  call,
  uploadImage,
  login: (inviterId = '') => call('auth.login', { inviterId }),
  getProfile: () => call('user.profile'),
  updateProfile: (data) => call('user.updateProfile', data),
  getBookByIsbn: (isbn, source = '') => call('books.isbn', { isbn, source }),
  getBookDetail: (id) => call('books.detail', { id }),
  searchBooks: (keyword, page = 1) => call('books.search', { keyword, page }),
  updateBookCover: (isbn, cover) => call('books.updateCover', { isbn, cover }),
  getShelfBooks: (category) => call('shelf.list', { category }),
  addShelfBook: (data) => call('shelf.add', data),
  manualAddShelfBook: (data) => call('shelf.manualAdd', data),
  updateShelfBook: (id, data) => call('shelf.update', { id, ...data }),
  deleteShelfBook: (id) => call('shelf.delete', { id }),
  getDashboard: () => call('shelf.dashboard'),
  redeemShelfCapacity: (count = 1) => call('shelf.redeemCapacity', { count }),
  getSharedShelf: (userId) => call('shelf.public', { userId }),
  createReport: (data) => call('report.create', data),
  estimatePrice: (isbn, condition) => call('pricing.estimate', { isbn, condition }),
  publishDrift: (data) => call('drift.publish', data),
  getDriftCheck: (driftId) => call('drift.check', { driftId }),
  appealDrift: (driftId, reason) => call('drift.appeal', { driftId, reason }),
  getPoolList: (params) => call('pool.list', params),
  getPoolStats: () => call('pool.stats'),
  getPoolDetail: (id) => call('pool.detail', { id }),
  togglePoolWant: (driftId) => call('pool.want', { driftId }),
  getPoolWants: () => call('pool.wants'),
  claimDrift: (driftId, addressId) => call('drift.claim', { driftId, addressId }),
  getOrders: (role, status) => call('drift.orders', { role, status }),
  getOrderDetail,
  shipOrder: (orderId, data) => call('drift.ship', { orderId, ...data }),
  cancelOrder: (orderId, reason) => call('drift.cancel', { orderId, reason }),
  cancelOpenDrift: (driftId, reason = '') => call('drift.cancelOpen', { driftId, reason }),
  confirmOrder: (orderId) => call('drift.confirm', { orderId }),
  addReceivedBook: (orderId) => call('drift.addReceivedBook', { orderId }),
  createDispute: (orderId, data) => call('drift.dispute', { orderId, ...data }),
  getDisputes: (status = 'OPEN') => call('drift.disputes', { status }),
  resolveDispute: (disputeId, action, compensate = false, remark = '') => call('drift.resolveDispute', {
    disputeId,
    action,
    compensate: !!compensate,
    remark,
  }),
  reviewOrder: (orderId, data) => call('drift.review', { orderId, ...data }),
  getWalletBalance: () => call('wallet.balance'),
  getTransactions: (page = 1) => call('wallet.transactions', { page }),
  getCredit: () => call('credit.score'),
  getAddresses: () => call('address.list'),
  addAddress: (data) => call('address.add', data),
  updateAddress: (id, data) => call('address.update', { id, ...data }),
  deleteAddress: (id) => call('address.delete', { id }),
  getLogistics: (trackingNo, expressCompany) => call('logistics.track', { trackingNo, expressCompany }),
  runSeed: () => call('health').then(() => wx.cloud.callFunction({ name: 'seed' })),
};
