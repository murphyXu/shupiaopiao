const api = require('../../utils/api');
const {
  CATEGORIES, BOOK_CLASSES, SHELF_LOCATIONS, isLoggedIn, requireLogin,
} = require('../../utils/util');
const safeAreaBehavior = require('../../behaviors/safe-area');
const { setTabBarIndex } = require('../../utils/tab-bar');
const { trackPageView } = require('../../utils/track');

const PRIMARY_TABS = [
  { key: 'class', label: '书籍分类' },
  { key: 'status', label: '阅读状态' },
  { key: 'location', label: '书架位置' },
];
const ALL_TAB = { key: 'all', label: '全部' };
const MAX_SHELF_NAME = 12;
const BACK_TOP_BOOK_THRESHOLD = 20;
const DEFAULT_DASHBOARD = {
  totalBooks: 0,
  monthNew: 0,
  totalValue: 0,
  shelfLimit: 100,
  remainingCapacity: 100,
};
const KNOWN_SERIES_NAMES = [
  '屁屁侦探',
  '神奇校车',
  '不一样的卡梅拉',
  '小猪佩奇',
  '米小圈',
  '故宫里的大怪兽',
  '可怕的科学',
  '猫武士',
  '哈利·波特',
];

function defaultLocations() {
  return SHELF_LOCATIONS.map((item) => ({ key: item.label, label: item.label }));
}

function sourceCategory(item = {}) {
  const book = item.book || {};
  return (item.displayCategory || item.sourceCategory || book.category || item.bookClassLabel || '未分类').trim();
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

function hasRealCover(cover = '') {
  const value = String(cover || '').trim();
  return !!value && !/default\.png|brand\/logo|placeholder|undefined|null/.test(value);
}

function pickSeriesCover(items = []) {
  const withCover = items.find((item) => hasRealCover(((item.book || {}).cover)));
  return (((withCover || items[0] || {}).book || {}).cover) || '';
}

function cleanSeriesTitle(title = '') {
  return String(title)
    .replace(/[《》]/g, '')
    .replace(/[（(][^）)]*(第[一二三四五六七八九十百\d]+[册卷部本]|全[一二三四五六七八九十百\d]+册|共[一二三四五六七八九十百\d]+册|套装|全套|全集)[^）)]*[）)]/g, '')
    .replace(/[:：][^:：]*(第[一二三四五六七八九十百\d]+[册卷部本]|套装|全套|全集|全[一二三四五六七八九十百\d]+册|共[一二三四五六七八九十百\d]+册).*$/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function seriesMeta(item = {}) {
  const rawTitle = String(((item.book || {}).title || '')).replace(/[《》]/g, '').replace(/\s+/g, '').trim();
  const isSet = /套装|全套|全集|套书|礼盒|全[一二三四五六七八九十百\d]+册|共[一二三四五六七八九十百\d]+册/.test(rawTitle);
  const knownSeriesName = KNOWN_SERIES_NAMES.find((name) => rawTitle.includes(name));
  if (knownSeriesName) {
    return {
      key: knownSeriesName,
      title: `${knownSeriesName}系列`,
      typeLabel: isSet ? '套装' : '系列',
      standalone: isSet,
    };
  }
  const title = cleanSeriesTitle(rawTitle);
  if (!title) return null;
  let key = title
    .replace(/[（(].*?[）)]/g, '')
    .replace(/(套装|全套|全集|套书|礼盒|全[一二三四五六七八九十百\d]+册|共[一二三四五六七八九十百\d]+册).*$/g, '')
    .replace(/第[一二三四五六七八九十百\d]+[册卷部本].*$/g, '')
    .replace(/[·:：-]?[上下中][册卷部本]?$/g, '')
    .replace(/\s+/g, '')
    .trim();
  let isSeries = isSet || key !== title;
  if (!isSeries && /系列|丛书/.test(title)) {
    key = title.replace(/(系列|丛书).*$/g, '$1');
    isSeries = true;
  }
  if (!isSeries && title.includes('·')) {
    const parts = title.split('·');
    const secondPart = (parts[1] || '').replace(/[与和:：-].*$/g, '');
    const prefix = secondPart ? `${parts[0]}·${secondPart}` : parts[0];
    if (prefix.length >= 2 && prefix.length <= 10) {
      key = prefix;
      isSeries = true;
    }
  }
  if (!key || key.length < 2) return null;
  return {
    key,
    title: /系列|丛书|全集|套装|全套|套书/.test(key) ? key : `${key}系列`,
    typeLabel: isSet ? '套装' : '系列',
    standalone: isSet,
  };
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
    primaryTabs: PRIMARY_TABS,
    activePrimary: 'class',
    secondaryTabs: [ALL_TAB].concat(BOOK_CLASSES),
    activeSecondary: 'all',
    allBooks: [],
    books: [],
    shelfEntries: [],
    seriesCollapsed: {},
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
      reloadIfCoversUpdated(() => this.loadData());
      this.loadData();
    } else {
      this.setData({
        allBooks: [],
        books: [],
        shelfEntries: [],
        showBackTop: false,
        dashboard: DEFAULT_DASHBOARD,
      });
    }
  },

  async loadData() {
    try {
      const user = wx.getStorageSync('userInfo') || {};
      const [shelf, dashboard] = await Promise.all([
        api.getShelfBooks('all'),
        api.getDashboard(),
      ]);
      this.setData({
        allBooks: shelf.list,
        dashboard,
        shelfName: (user.shelfName || '我的书架').slice(0, MAX_SHELF_NAME),
        shelfNameInput: (user.shelfName || '我的书架').slice(0, MAX_SHELF_NAME),
      });
      this.refreshSecondaryTabs();
    } catch (e) {
      console.error(e);
    }
  },

  async loadSharedData() {
    try {
      const res = await api.getSharedShelf(this.data.shareUserId);
      this.setData({
        owner: res.owner,
        shelfName: (res.owner && res.owner.shelfName) || 'TA的书架',
        allBooks: res.list || [],
        dashboard: res.dashboard || DEFAULT_DASHBOARD,
      });
      this.refreshSecondaryTabs();
    } catch (e) {
      console.error(e);
      wx.showToast({ title: '分享书架加载失败', icon: 'none' });
    }
  },

  refreshSecondaryTabs() {
    const { activePrimary } = this.data;
    let secondaryTabs = [ALL_TAB].concat(CATEGORIES);
    let activeSecondary = this.data.activeSecondary;
    if (activePrimary === 'class') {
      secondaryTabs = this.buildClassTabs();
    }
    if (activePrimary === 'location') {
      const map = new Map(defaultLocations().map((item) => [item.key, item]));
      this.data.allBooks.forEach((item) => {
        const name = item.shelfLocationName || '默认书架 1';
        map.set(name, { key: name, label: name });
      });
      secondaryTabs = [ALL_TAB].concat([...map.values()]);
    }
    if (!secondaryTabs.some((item) => item.key === activeSecondary)) {
      activeSecondary = secondaryTabs[0] ? secondaryTabs[0].key : '';
    }
    this.setData({ secondaryTabs, activeSecondary });
    this.filterBooks();
  },

  buildClassTabs() {
    const map = new Map();
    this.data.allBooks.forEach((item) => {
      const category = sourceCategory(item);
      map.set(category, { key: category, label: category });
    });
    if (!map.size) {
      BOOK_CLASSES.forEach((item) => map.set(item.label, { key: item.label, label: item.label }));
    }
    return [ALL_TAB].concat([...map.values()]);
  },

  filterBooks() {
    const {
      activePrimary, activeSecondary, allBooks, searchKeyword,
    } = this.data;
    const keyword = String(searchKeyword || '').trim().toLowerCase();
    const books = allBooks.filter((item) => {
      let matchedTab = true;
      if (activeSecondary !== 'all') {
        if (activePrimary === 'status') matchedTab = item.readingStatus === activeSecondary;
        if (activePrimary === 'class') matchedTab = sourceCategory(item) === activeSecondary;
        if (activePrimary === 'location') matchedTab = (item.shelfLocationName || '默认书架 1') === activeSecondary;
      }
      return matchedTab && matchesShelfSearch(item, keyword);
    });
    this.setData({ books, shelfEntries: this.buildShelfEntries(books) });
  },

  onShelfSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value || '' });
    this.filterBooks();
  },

  clearShelfSearch() {
    this.setData({ searchKeyword: '' });
    this.filterBooks();
  },

  buildShelfEntries(books, collapsedState = this.data.seriesCollapsed) {
    const groups = new Map();
    books.forEach((bookItem, index) => {
      const meta = seriesMeta(bookItem);
      if (!meta) return;
      if (!groups.has(meta.key)) {
        groups.set(meta.key, {
          ...meta,
          firstIndex: index,
          books: [],
        });
      }
      const group = groups.get(meta.key);
      group.books.push(bookItem);
      group.standalone = group.standalone || meta.standalone;
    });

    const accepted = new Map();
    groups.forEach((group, key) => {
      if (group.standalone || group.books.length > 1) accepted.set(key, group);
    });

    const emitted = new Set();
    const entries = [];
    books.forEach((bookItem) => {
      const meta = seriesMeta(bookItem);
      const group = meta ? accepted.get(meta.key) : null;
      if (!group) {
        entries.push({ type: 'book', ...bookItem });
        return;
      }
      if (emitted.has(group.key)) return;
      emitted.add(group.key);
      entries.push({
        type: 'series',
        id: `series-${group.key}`,
        seriesKey: group.key,
        seriesTitle: group.title,
        seriesTypeLabel: group.typeLabel,
        count: group.books.length,
        cover: pickSeriesCover(group.books),
        books: group.books,
        collapsed: collapsedState[group.key] !== false,
      });
    });
    return entries;
  },

  toggleSeries(e) {
    const seriesKey = e.currentTarget.dataset.key;
    const seriesCollapsed = {
      ...this.data.seriesCollapsed,
      [seriesKey]: this.data.seriesCollapsed[seriesKey] === false,
    };
    this.setData({
      seriesCollapsed,
      shelfEntries: this.buildShelfEntries(this.data.books, seriesCollapsed),
    });
  },

  switchPrimary(e) {
    if (!this.data.shareMode && !requireLogin('登录后可管理个人书架')) return;
    this.setData({ activePrimary: e.currentTarget.dataset.key, activeSecondary: 'all' });
    this.refreshSecondaryTabs();
  },

  switchSecondary(e) {
    if (!this.data.shareMode && !requireLogin('登录后可管理个人书架')) return;
    this.setData({ activeSecondary: e.currentTarget.dataset.key });
    this.filterBooks();
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
    if (isLoggedIn()) this.loadData();
    else this.setData({
      allBooks: [],
      books: [],
      shelfEntries: [],
      showBackTop: false,
      dashboard: DEFAULT_DASHBOARD,
    });
  },

  onShareAppMessage() {
    const user = wx.getStorageSync('userInfo') || {};
    const shareUserId = this.data.shareUserId || user.id || '';
    return {
      title: this.data.shareMode && this.data.owner
        ? this.data.shelfName
        : `来看看${this.data.shelfName}`,
      path: `/pages/shelf/index?shareUserId=${shareUserId}&inviterId=${shareUserId}`,
    };
  },
});
