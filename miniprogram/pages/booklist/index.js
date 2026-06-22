const api = require('../../utils/api');
const safeAreaBehavior = require('../../behaviors/safe-area');
const { setTabBarIndex } = require('../../utils/tab-bar');
const { getBooklistSignals } = require('../../utils/booklistSignals');
const { trackPageView } = require('../../utils/track');

Page({
  behaviors: [safeAreaBehavior],
  data: {
    feeds: [],
    page: 1,
    size: 20,
    hasMore: true,
    loading: false,
    source: 'cold_start',
  },

  onLoad() {
    if (!this.restoreFeedState()) this.refresh();
  },

  onShow() {
    setTabBarIndex.call(this, 0);
    trackPageView('booklist/index');
    this.restoreScrollPosition();
  },

  onPullDownRefresh() {
    this.refresh().finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) this.loadFeed(false);
  },

  refresh() {
    this.scrollTop = 0;
    wx.removeStorageSync('booklistFeedState');
    this.setData({ feeds: [], page: 1, hasMore: true });
    return this.loadFeed(true);
  },

  async loadFeed(reset) {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      const page = reset ? 1 : this.data.page;
      const res = await api.getBooklistFeed(page, this.data.size, getBooklistSignals());
      this.setData({
        feeds: reset ? res.list : this.data.feeds.concat(res.list),
        page: page + 1,
        hasMore: res.hasMore,
        source: res.source,
      });
      this.saveFeedState();
    } catch (e) {
      console.error(e);
      wx.showToast({ title: '书单加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onPageScroll(e) {
    this.scrollTop = e.scrollTop || 0;
  },

  onHide() {
    this.saveFeedState();
  },

  saveFeedState() {
    if (!this.data.feeds.length) return;
    wx.setStorageSync('booklistFeedState', {
      feeds: this.data.feeds,
      page: this.data.page,
      hasMore: this.data.hasMore,
      source: this.data.source,
      scrollTop: this.scrollTop || 0,
      savedAt: Date.now(),
    });
  },

  restoreFeedState() {
    const cached = wx.getStorageSync('booklistFeedState');
    if (!cached || !cached.feeds || !cached.feeds.length) return false;
    if (Date.now() - (cached.savedAt || 0) > 10 * 60 * 1000) return false;
    this.scrollTop = cached.scrollTop || 0;
    this.setData({
      feeds: cached.feeds,
      page: cached.page || 2,
      hasMore: cached.hasMore !== false,
      source: cached.source || 'cold_start',
    });
    this.restoreScrollPosition();
    return true;
  },

  restoreScrollPosition() {
    const scrollTop = this.scrollTop || 0;
    if (!scrollTop) return;
    setTimeout(() => {
      wx.pageScrollTo({ scrollTop, duration: 0 });
    }, 0);
  },

  goDetail(e) {
    this.saveFeedState();
    wx.navigateTo({ url: `/pages/booklist/detail?id=${e.currentTarget.dataset.id}` });
  },
});
