const api = require('../../utils/api');
const {
  CATEGORIES, SHELF_LOCATIONS, isLoggedIn, requireLogin,
} = require('../../utils/util');
const { onCoverError: baseOnCoverError } = require('../../utils/cover');
const safeAreaBehavior = require('../../behaviors/safe-area');
const { setTabBarIndex, setTabBarHidden, refreshTabBarPendingShip } = require('../../utils/tab-bar');
const { trackPageView } = require('../../utils/track');
const { shelfShare } = require('../../utils/share');
const { measureMoreFilterLayout } = require('../../utils/poolMoreFilterLayout');
const {
  readPageCache, writePageCache, shouldUseCachedPage, invalidatePageCache,
} = require('../../utils/pageCache');

// 一级横滑分类（与漂流首页横滑逻辑一致）
const CATEGORY_CHIPS = [
  { key: 'all', label: '全部' },
  { key: '童书', label: '童书' },
  { key: '文学', label: '文学' },
  { key: '经管', label: '经管' },
  { key: '其他', label: '其他' },
];
// 更多筛选：阅读状态
const STATUS_OPTS = [
  { key: 'all', label: '全部' },
  ...CATEGORIES,
];
const MAX_SHELF_NAME = 12;
const BACK_TOP_BOOK_THRESHOLD = 20;
const FIRST_SCREEN_SHELF_SIZE = 30;
const DEFAULT_DASHBOARD = {
  totalBooks: 0,
  totalValue: 0,
  shelfLimit: 100,
  remainingCapacity: 100,
};
function defaultLocations() {
  return SHELF_LOCATIONS.map((item) => ({ key: item.label, label: item.label }));
}

function shelfListCacheKey(data = {}) {
  const {
    activeCategory = 'all',
    activeStatus = 'all',
    activeLocation = 'all',
    searchKeyword = '',
  } = data;
  return [
    'shelf/list',
    activeCategory || 'all',
    activeStatus || 'all',
    activeLocation || 'all',
    String(searchKeyword || '').trim() || '-',
  ].join(':');
}

function shelfCategoryLabel(item = {}) {
  return (item.bookClassLabel || '其他').trim();
}

function shouldDeferCategoryList(data = {}) {
  return data.activeCategory !== 'all' && !data.shelfFullLoadDone;
}

function mergeShelfBookRows(prev = [], incoming = []) {
  if (!incoming.length) return prev;
  if (!prev.length || incoming.length >= prev.length) return incoming;
  const patchById = {};
  incoming.forEach((item) => { patchById[item.id] = item; });
  return prev.map((item) => patchById[item.id] || item);
}

function sourceCategory(item = {}) {
  return shelfCategoryLabel(item);
}

function matchesShelfSearch(item = {}, keyword = '') {
  if (!keyword) return true;
  const book = item.book || {};
  const text = [
    book.title,
    book.rawTitle,
    book.author,
    book.isbn,
    book.publisher,
    book.category,
    item.sourceCategory,
    item.bookClassLabel,
    item.shelfLocationName,
  ].filter(Boolean).join(' ').toLowerCase();
  return text.includes(keyword.toLowerCase());
}

Page({
  behaviors: [safeAreaBehavior],
  data: {
    loggedIn: false,
    shareMode: false,
    shareUserId: '',
    owner: null,
    shelfName: '我的书架',
    editingShelfName: false,
    shelfNameInput: '',
    categoryChips: CATEGORY_CHIPS,
    activeCategory: 'all',
    statusOpts: STATUS_OPTS,
    locationOpts: [{ key: 'all', label: '全部' }],
    // 已生效的更多筛选
    activeStatus: 'all',
    activeLocation: 'all',
    moreActive: false,
    // 抽屉草稿值
    showMoreFilter: false,
    filterFootPadding: 0,
    filterCompact: false,
    draftStatus: 'all',
    draftLocation: 'all',
    allBooks: [],
    books: [],
    shelfTotal: 0,
    shelfHasMore: false,
    shelfLoadingMore: false,
    shelfPage: 1,
    shelfFullLoadDone: true,
    categoryFilterPending: false,
    searchKeyword: '',
    showBackTop: false,
    dashboard: DEFAULT_DASHBOARD,
  },

  onLoad(options = {}) {
    const inviterId = options.inviterId || options.shareUserId || '';
    const user = wx.getStorageSync('userInfo') || {};
    if (inviterId && inviterId !== user.id) wx.setStorageSync('pendingInviterId', inviterId);
    this.setData({
      shareMode: !!options.shareUserId,
      shareUserId: options.shareUserId || '',
    });
  },

  onShow() {
    setTabBarIndex.call(this, 1);
    setTimeout(() => refreshTabBarPendingShip(), 500);
    trackPageView('shelf/index');
    if (wx.getStorageSync('forceOwnShelf')) {
      wx.removeStorageSync('forceOwnShelf');
      if (this.data.shareMode) {
        this.setData({ shareMode: false, shareUserId: '', owner: null });
      }
    }
    const loggedIn = isLoggedIn();
    this.setData({ loggedIn });
    const { reloadIfCoversUpdated } = require('../../utils/coverPage');
    if (this.data.shareMode) {
      this.loadSharedData();
    } else if (loggedIn) {
      reloadIfCoversUpdated(() => this.loadData(true));
      const cacheKey = shelfListCacheKey(this.data);
      const cached = readPageCache(cacheKey);
      if (cached && cached.data) this.applyShelfPayload(cached.data, { mergeOnly: false });
      if (!shouldUseCachedPage(cacheKey) || !cached) this.loadData(true);
    } else {
      this.setData({
        allBooks: [],
        books: [],
        showBackTop: false,
        shelfTotal: 0,
        shelfHasMore: false,
        shelfFullLoadDone: true,
        categoryFilterPending: false,
        dashboard: DEFAULT_DASHBOARD,
      });
    }
  },

  onReachBottom() {
    if (this.data.shareMode || !this.data.loggedIn) return;
    if (this.data.shelfHasMore && !this.data.shelfLoadingMore) this.loadData(false);
  },

  buildShelfListParams(page = 1) {
    const { activeCategory, activeStatus, activeLocation, searchKeyword } = this.data;
    return {
      page,
      size: FIRST_SCREEN_SHELF_SIZE,
      includeDashboard: page === 1,
      category: 'all',
      bookClassChip: activeCategory !== 'all' ? activeCategory : '',
      readingStatus: activeStatus !== 'all' ? activeStatus : '',
      shelfLocationName: activeLocation !== 'all' ? activeLocation : '',
      searchKeyword: String(searchKeyword || '').trim(),
    };
  },

  applyShelfPayload(shelf, options = {}) {
    const incoming = shelf.list || [];
    const allBooks = options.mergeOnly
      ? mergeShelfBookRows(this.data.allBooks || [], incoming)
      : incoming;
    const user = wx.getStorageSync('userInfo') || {};
    this.setData({
      allBooks,
      books: allBooks,
      shelfTotal: Number(shelf.total) || allBooks.length,
      shelfHasMore: !!shelf.hasMore,
      shelfPage: shelf.page || this.data.shelfPage,
      shelfFullLoadDone: !shelf.hasMore,
      categoryFilterPending: false,
      shelfLoadingMore: false,
      dashboard: shelf.dashboard || this.data.dashboard,
      shelfName: (user.shelfName || '我的书架').slice(0, MAX_SHELF_NAME),
      shelfNameInput: (user.shelfName || '我的书架').slice(0, MAX_SHELF_NAME),
    });
    this.refreshSecondaryTabs();
  },

  onHide() {
    setTabBarHidden(false);
  },

  async loadData(reset = true) {
    const requestId = Date.now();
    this.lastShelfRequestId = requestId;
    const page = reset ? 1 : (this.data.shelfPage || 1) + 1;
    const cacheKey = shelfListCacheKey(this.data);
    if (!reset) this.setData({ shelfLoadingMore: true });
    else if (!readPageCache(cacheKey)) {
      this.setData({
        shelfFullLoadDone: false,
        categoryFilterPending: shouldDeferCategoryList(this.data),
      });
    }

    try {
      const shelf = await api.getShelfBooks('all', this.buildShelfListParams(page), {
        deferCoverEnrichment: true,
        onEnriched: (enriched) => {
          if (this.lastShelfRequestId !== requestId) return;
          this.applyShelfPayload(enriched, { mergeOnly: !reset });
        },
      });
      if (this.lastShelfRequestId !== requestId) return;
      this.applyShelfPayload(shelf, { mergeOnly: !reset });
      if (reset) writePageCache(cacheKey, shelf);
    } catch (e) {
      console.error(e);
      if (this.lastShelfRequestId === requestId) {
        this.setData({ shelfFullLoadDone: true, categoryFilterPending: false, shelfLoadingMore: false });
      }
    }
  },

  async loadSharedData() {
    try {
      const res = await api.getSharedShelf(this.data.shareUserId);
      this.setData({
        owner: res.owner,
        shelfName: (res.owner && res.owner.shelfName) || 'TA的书架',
        allBooks: res.list || [],
        shelfTotal: (res.list || []).length,
        shelfFullLoadDone: true,
        categoryFilterPending: false,
        dashboard: res.dashboard || DEFAULT_DASHBOARD,
      });
      this.refreshSecondaryTabs();
    } catch (e) {
      console.error(e);
      wx.showToast({ title: '分享书架加载失败', icon: 'none' });
    }
  },

  // 兼容旧调用：刷新书架位置选项并重新筛选
  refreshSecondaryTabs() {
    const map = new Map(defaultLocations().map((item) => [item.key, item]));
    this.data.allBooks.forEach((item) => {
      const name = item.shelfLocationName || '默认书架 1';
      map.set(name, { key: name, label: name });
    });
    const locationOpts = [{ key: 'all', label: '全部' }].concat([...map.values()]);
    let { activeLocation } = this.data;
    if (!locationOpts.some((item) => item.key === activeLocation)) {
      activeLocation = 'all';
    }
    this.setData({ locationOpts, activeLocation });
    this.filterBooks();
  },

  filterBooks() {
    this.setData({ books: this.data.allBooks || [] });
  },

  onShelfSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value || '' });
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      invalidatePageCache('shelf/');
      this.loadData(true);
    }, 400);
  },

  clearShelfSearch() {
    this.setData({ searchKeyword: '' });
    invalidatePageCache('shelf/');
    this.loadData(true);
  },

  onCategoryChip(e) {
    if (!this.data.shareMode && !requireLogin('登录后可管理个人书架')) return;
    const key = e.currentTarget.dataset.key || 'all';
    invalidatePageCache('shelf/');
    this.setData({
      activeCategory: key,
      books: [],
      allBooks: [],
      categoryFilterPending: key !== 'all',
      shelfFullLoadDone: false,
    }, () => this.loadData(true));
  },

  openMoreFilter() {
    if (!this.data.shareMode && !requireLogin('登录后可管理个人书架')) return;
    setTabBarHidden(true);
    const layout = measureMoreFilterLayout();
    this.setData({
      showMoreFilter: true,
      filterFootPadding: layout.filterFootPadding,
      filterCompact: layout.filterCompact,
      draftStatus: this.data.activeStatus,
      draftLocation: this.data.activeLocation,
    });
  },

  closeMoreFilter() {
    setTabBarHidden(false);
    this.setData({ showMoreFilter: false });
  },

  onDraftStatus(e) {
    this.setData({ draftStatus: e.currentTarget.dataset.key || 'all' });
  },

  onDraftLocation(e) {
    this.setData({ draftLocation: e.currentTarget.dataset.key || 'all' });
  },

  resetMoreFilter() {
    this.setData({ draftStatus: 'all', draftLocation: 'all' });
  },

  applyMoreFilter() {
    const { draftStatus, draftLocation } = this.data;
    const moreActive = draftStatus !== 'all' || draftLocation !== 'all';
    setTabBarHidden(false);
    this.setData({
      activeStatus: draftStatus,
      activeLocation: draftLocation,
      moreActive,
      showMoreFilter: false,
      books: [],
      allBooks: [],
      shelfFullLoadDone: false,
    }, () => {
      invalidatePageCache('shelf/');
      this.loadData(true);
    });
  },

  goDashboard() {
    if (this.data.shareMode) return;
    if (!requireLogin('登录后可查看数据看板')) return;
    wx.navigateTo({ url: '/pages/shelf/dashboard' });
  },

  goDetail(e) {
    if (this.data.shareMode) {
      wx.navigateTo({ url: `/pages/book/catalog?id=${e.currentTarget.dataset.bookId}` });
      return;
    }
    if (!requireLogin('登录后可查看藏书详情')) return;
    wx.navigateTo({ url: `/pages/book/detail?id=${e.currentTarget.dataset.id}` });
  },

  showAddMenu() {
    if (!requireLogin('登录后可添加藏书')) return;
    if ((this.data.dashboard.remainingCapacity || 0) <= 0) {
      wx.showModal({
        title: '书架容量已满',
        content: '可用公益积分兑换更多可收藏额度。',
        confirmText: '去兑换',
        success: (res) => {
          if (res.confirm) this.goRedeemCapacity();
        },
      });
      return;
    }
    this.openAddActionSheet();
  },

  openAddActionSheet() {
    wx.showActionSheet({
      itemList: ['扫码录入', '手动添加'],
      success: (res) => {
        if (res.tapIndex === 0) this.scanAndOpenResult();
        if (res.tapIndex === 1) wx.navigateTo({ url: '/pages/shelf/manual-add' });
      },
    });
  },

  goRedeemCapacity() {
    if (!requireLogin('登录后可兑换书架额度')) return;
    wx.navigateTo({ url: '/pages/shelf/redeem-capacity' });
  },

  onPageScroll(e) {
    const showBackTop = this.data.allBooks.length >= BACK_TOP_BOOK_THRESHOLD && e.scrollTop > 600;
    if (showBackTop !== this.data.showBackTop) this.setData({ showBackTop });
  },

  scrollToTop() {
    wx.pageScrollTo({ scrollTop: 0, duration: 260 });
  },

  scanAndOpenResult() {
    wx.scanCode({
      scanType: ['barCode'],
      success: (res) => {
        const isbn = res.result.replace(/[^0-9X]/gi, '');
        wx.navigateTo({ url: `/pages/shelf/scan?isbn=${isbn}` });
      },
    });
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/auth/login' });
  },

  startEditShelfName() {
    if (this.data.shareMode) return;
    if (!requireLogin('登录后可编辑书架名称')) return;
    this.setData({ editingShelfName: true, shelfNameInput: this.data.shelfName });
  },

  onShelfNameInput(e) {
    this.setData({ shelfNameInput: String(e.detail.value || '').slice(0, MAX_SHELF_NAME) });
  },

  async saveShelfName() {
    const shelfName = this.data.shelfNameInput.trim().slice(0, MAX_SHELF_NAME);
    if (!shelfName) {
      wx.showToast({ title: '书架名不能为空', icon: 'none' });
      return;
    }
    const user = await api.updateProfile({ shelfName });
    wx.setStorageSync('userInfo', user);
    getApp().globalData.userInfo = user;
    this.setData({ shelfName: user.shelfName, shelfNameInput: user.shelfName, editingShelfName: false });
    wx.showToast({ title: '已更新书架名' });
  },

  exitShareMode() {
    wx.setStorageSync('forceOwnShelf', true);
    this.setData({ shareMode: false, shareUserId: '', owner: null });
    if (isLoggedIn()) this.loadData(true);
    else this.setData({
      allBooks: [],
      books: [],
      showBackTop: false,
      dashboard: DEFAULT_DASHBOARD,
    });
  },

  onCoverError(e) {
    const { isbn } = e.currentTarget.dataset;
    if (!isbn) return;
    const book = (this.data.allBooks || []).find((item) => (item.book || {}).isbn === isbn);
    if (!book || !book.book) return;
    const ctx = {
      data: { list: this.data.allBooks },
      setData: (patch) => {
        const match = Object.keys(patch).find((key) => /^\w+\[\d+\]\.book\.cover$/.test(key));
        if (!match) return;
        const cover = patch[match];
        const allBooks = (this.data.allBooks || []).map((item) => {
          if ((item.book || {}).isbn !== isbn) return item;
          return { ...item, book: { ...item.book, cover } };
        });
        this.setData({ allBooks });
        this.filterBooks();
      },
    };
    const index = (this.data.allBooks || []).findIndex((item) => (item.book || {}).isbn === isbn);
    e.currentTarget.dataset.index = index;
    e.currentTarget.dataset.listKey = 'list';
    e.currentTarget.dataset.nestedKey = 'book';
    baseOnCoverError.call(ctx, e);
  },

  onShareAppMessage() {
    const user = wx.getStorageSync('userInfo') || {};
    return shelfShare({
      shelfName: this.data.shelfName,
      shareUserId: this.data.shareUserId || user.id || '',
      owner: this.data.owner,
      shareMode: this.data.shareMode,
    });
  },
});
