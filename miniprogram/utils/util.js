const CATEGORIES = [
  { key: 'reading', label: '在读' },
  { key: 'read', label: '已读' },
  { key: 'want_read', label: '想读' },
];

const BOOK_CLASSES = [
  { key: 'child', label: '童书' },
  { key: 'literature', label: '文学' },
  { key: 'social', label: '社科' },
  { key: 'business', label: '经管' },
  { key: 'science', label: '科普' },
  { key: 'life', label: '生活' },
  { key: 'art', label: '艺术' },
  { key: 'other', label: '其他' },
];

const SHELF_LOCATIONS = [
  { key: 'shelf_1', label: '默认书架 1' },
  { key: 'shelf_2', label: '默认书架 2' },
  { key: 'shelf_3', label: '默认书架 3' },
];

const POOL_CATEGORIES = [
  { key: 'all', label: '全部' },
  { key: 'children', label: '童书' },
  { key: 'literature', label: '文学' },
  { key: 'social', label: '社科' },
  { key: 'business', label: '经管' },
  { key: 'science', label: '科普' },
  { key: 'art', label: '艺术' },
  { key: 'life', label: '生活' },
  { key: 'other', label: '其他' },
];

function findLabel(list, key, fallback = '') {
  const item = list.find((entry) => entry.key === key);
  return item ? item.label : fallback;
}

const CONDITIONS = [
  { key: 'new', label: '全新' },
  { key: 'like_new', label: '9成新' },
  { key: 'good', label: '8成新' },
  { key: 'seven_new', label: '7成新' },
  { key: 'below_seven', label: '7成新以下' },
];

const CONDITION_ISSUES = [
  { key: 'notes', label: '有笔记' },
  { key: 'water', label: '有泡水' },
  { key: 'stain', label: '有脏污' },
  { key: 'damage', label: '有破损' },
  { key: 'crease', label: '有折痕' },
  { key: 'yellowing', label: '有泛黄' },
];

const ORDER_STATUS = {
  PENDING_REVIEW: '待审核',
  CHECKING: '审核中',
  IN_POOL: '待接漂',
  REJECTED: '未通过',
  CLAIMED: '已被领取',
  COMPLETED: '已完成',
  PENDING_SHIP: '待寄出',
  SHIPPED: '在途',
  DISPUTED: '申诉处理中',
  RECEIVED: '待收货',
  DONE: '已完成',
  CANCELLED: '已取消',
  CLOSED: '已关闭',
};

const EXPRESS_COMPANIES = ['顺丰', '中通', '圆通', '韵达', '申通', '邮政', '京东', '极兔'];

function formatDate(str) {
  if (!str) return '';
  return str.replace('T', ' ').slice(0, 16);
}

function isLoggedIn() {
  const user = wx.getStorageSync('userInfo');
  return !!(user && user.id);
}

/** 业务操作前引导登录，返回是否已登录 */
function requireLogin(message = '登录后可使用完整功能') {
  if (isLoggedIn()) return true;
  wx.showModal({
    title: '需要登录',
    content: message,
    confirmText: '去登录',
    cancelText: '先看看',
    success(res) {
      if (res.confirm) {
        wx.navigateTo({ url: '/pages/auth/login' });
      }
    },
  });
  return false;
}

/** @deprecated 使用 isLoggedIn / requireLogin */
function checkLogin() {
  return requireLogin();
}

module.exports = {
  CATEGORIES,
  BOOK_CLASSES,
  SHELF_LOCATIONS,
  POOL_CATEGORIES,
  findLabel,
  CONDITIONS,
  CONDITION_ISSUES,
  ORDER_STATUS,
  EXPRESS_COMPANIES,
  formatDate,
  isLoggedIn,
  requireLogin,
  checkLogin,
};
