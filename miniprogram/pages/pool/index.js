const api = require('../../utils/api');
const {
  CONDITIONS, POOL_CATEGORIES, isLoggedIn, requireLogin,
} = require('../../utils/util');
const safeAreaBehavior = require('../../behaviors/safe-area');
const { setTabBarIndex, setTabBarHidden, refreshTabBarPendingShip } = require('../../utils/tab-bar');
const { trackPageView, track } = require('../../utils/track');
const { onCoverError } = require('../../utils/cover');
const { publishEarnGuideModal } = require('../../utils/pointRules');
const { showPublishEntryOptions } = require('../../utils/publishEntry');
const { poolShare } = require('../../utils/share');
const { measureMoreFilterLayout } = require('../../utils/poolMoreFilterLayout');
const {
  readPageCache, writePageCache, shouldUseCachedPage, bumpPoolFeedVersion, invalidatePageCache,
} = require('../../utils/pageCache');

const FIRST_SCREEN_POOL_SIZE = 30;

const CATEGORY_CHIPS = [
  { key: 'recommend', label: '推荐' },
  ...POOL_CATEGORIES.filter((item) => item.key !== 'all'),
];

const VALUE_TABS = [
  { key: 'all', label: '全部' },
  { key: 'low', label: '0-5积分', min: 0, max: 5 },
  { key: 'middle', label: '6-10积分', min: 6, max: 10 },
  { key: 'high', label: '11-20积分', min: 11, max: 20 },
  { key: 'premium', label: '20积分以上', min: 21 },
];

const CONDITION_TABS = [
  { key: 'all', label: '全部' },
  ...CONDITIONS,
];

function mergePoolList(existing = [], incoming = []) {
  if (!existing.length) return incoming;
  if (!incoming.length) return existing;
  const byId = {};
  existing.forEach((item) => { byId[item.id] = item; });
  incoming.forEach((item) => { byId[item.id] = item; });
  const seen = new Set();
  const merged = [];
  existing.forEach((item) => {
    if (!seen.has(item.id)) {
      merged.push(byId[item.id]);
      seen.add(item.id);
    }
  });
  incoming.forEach((item) => {
    if (!seen.has(item.id)) {
      merged.push(byId[item.id]);
      seen.add(item.id);
    }
  });
  return merged;
}

Page({
  behaviors: [safeAreaBehavior],
  data: {
    loggedIn: false,
    keyword: '',
    rawList: [],
    list: [],
    page: 1,
    hasMore: false,
    loading: false,
    loadingMore: false,
    feedVersion: 0,
    stats: {
      availableCoin: 0,
    },
    categoryChips: CATEGORY_CHIPS,
    activeCategory: 'recommend',
    valueTabs: VALUE_TABS,
    conditionTabs: CONDITION_TABS,
    activeValue: 'all',
    activeCondition: 'all',
    showMoreFilter: false,
    filterFootPadding: 0,
    filterCompact: false,
    moreActive: false,
    draftValue: 'all',
    draftCondition: 'all',
    claimableOnly: false,
    showEarnGuideModal: false,
    earnGuide: publishEarnGuideModal(),
  },

  onShow() {
    setTabBarIndex.call(this, 0);
    setTimeout(() => refreshTabBarPendingShip(), 500);
    trackPageView('pool/index');
    const loggedIn = isLoggedIn();
    this.setData({ loggedIn });
    const poolSearch = wx.getStorageSync('poolSearch');
    if (poolSearch) {
      this.setData({ keyword: poolSearch });
      wx.removeStorageSync('poolSearch');
    }
    const { reloadIfCoversUpdated } = require('../../utils/coverPage');
    reloadIfCoversUpdated(() => this.loadList(true));
    const cached = readPageCache('pool/list');
    if (cached && cached.data) this.applyPoolPayload(cached.data, { mergeOnly: false });
    if (!shouldUseCachedPage('pool/list') || !cached) this.loadList(true);
    this.loadStats();
  },

  onHide() {
    setTabBarHidden(false);
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loadingMore && !this.data.loading) {
      this.loadList(false);
    }
  },

  onInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  applyPoolPayload(res, options = {}) {
    const incoming = res.list || [];
    const rawList = options.mergeOnly
      ? mergePoolList(this.data.rawList, incoming)
      : incoming;
    if (res.feedVersion) bumpPoolFeedVersion(res.feedVersion);
    this.setData({
      rawList,
      list: rawList,
      page: res.page || this.data.page,
      hasMore: !!res.hasMore,
      feedVersion: res.feedVersion || this.data.feedVersion,
      loading: false,
      loadingMore: false,
    });
  },

  async loadList(reset = true) {
    if (!reset) {
      if (this.data.loadingMore || !this.data.hasMore || this.data.loading) return;
      this.setData({ loadingMore: true });
    } else {
      const requestId = Date.now();
      this.lastListRequestId = requestId;
      if (!readPageCache('pool/list')) {
        this.setData({ loading: true, page: 1, hasMore: false });
      }
    }

    const requestId = this.lastListRequestId;
    const page = reset ? 1 : this.data.page + 1;
    const params = {
      keyword: this.data.keyword,
      category: this.data.activeCategory === 'recommend' ? 'all' : this.data.activeCategory,
      claimableOnly: this.data.claimableOnly,
      valueKey: this.data.activeValue,
      condition: this.data.activeCondition,
      page,
      size: FIRST_SCREEN_POOL_SIZE,
    };
    const append = !reset;
    const applyList = (res) => {
      if (this.lastListRequestId !== requestId) return;
      const incoming = res.list || [];
      const payload = {
        list: append ? mergePoolList(this.data.rawList, incoming) : incoming,
        page: res.page || page,
        hasMore: !!res.hasMore,
        feedVersion: res.feedVersion,
      };
      this.applyPoolPayload(payload, { mergeOnly: append });
      if (reset && (payload.list || []).length) writePageCache('pool/list', payload);
    };
    try {
      const res = await api.getPoolList(params, {
        showError: false,
        deferCoverEnrichment: true,
        onEnriched: applyList,
      });
      applyList(res);
    } catch (e) {
      console.error(e);
      if (this.lastListRequestId === requestId) {
        this.setData({ loading: false, loadingMore: false });
      }
    }
  },

  async loadStats() {
    if (!this.data.loggedIn) {
      this.setData({ stats: { availableCoin: 0 } });
      return;
    }
    try {
      const stats = await api.getPoolStats();
      this.setData({
        stats: {
          availableCoin: Number(stats.availableCoin) || 0,
        },
      });
    } catch (e) {
      console.warn('[pool] stats skipped', e);
    }
  },

  onCategoryChip(e) {
    const activeCategory = e.currentTarget.dataset.key || 'recommend';
    invalidatePageCache('pool/');
    this.setData({ activeCategory }, () => this.loadList(true));
  },

  openMoreFilter() {
    setTabBarHidden(true);
    const layout = measureMoreFilterLayout();
    this.setData({
      showMoreFilter: true,
      filterFootPadding: layout.filterFootPadding,
      filterCompact: layout.filterCompact,
      draftValue: this.data.activeValue,
      draftCondition: this.data.activeCondition,
    });
  },

  closeMoreFilter() {
    setTabBarHidden(false);
    this.setData({ showMoreFilter: false });
  },

  onDraftValue(e) {
    this.setData({ draftValue: e.currentTarget.dataset.key || 'all' });
  },

  onDraftCondition(e) {
    this.setData({ draftCondition: e.currentTarget.dataset.key || 'all' });
  },

  resetMoreFilter() {
    this.setData({ draftValue: 'all', draftCondition: 'all' });
  },

  applyMoreFilter() {
    const { draftValue, draftCondition } = this.data;
    const moreActive = draftValue !== 'all' || draftCondition !== 'all';
    setTabBarHidden(false);
    invalidatePageCache('pool/');
    this.setData({
      activeValue: draftValue,
      activeCondition: draftCondition,
      moreActive,
      showMoreFilter: false,
    }, () => this.loadList(true));
  },

  goDetail(e) {
    const { id, category, bookId, author } = e.currentTarget.dataset;
    track('page_view', {
      page: 'pool/index',
      action: 'pool_card_click',
      driftId: id,
      category: category || '',
      bookId: bookId || '',
      author: author || '',
    });
    wx.navigateTo({ url: `/pages/pool/detail?id=${id}` });
  },

  goWants() {
    if (!requireLogin('登录后可查看想要接漂的书')) return;
    wx.navigateTo({ url: '/pages/pool/wants' });
  },

  goPublish() {
    showPublishEntryOptions();
  },

  showEarnPointGuide() {
    if (!requireLogin('登录后可查看和获得公益积分')) return;
    wx.showActionSheet({
      itemList: ['上漂一本书', '邀请书友'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.setData({ earnGuide: publishEarnGuideModal(), showEarnGuideModal: true });
          return;
        }
        if (res.tapIndex === 1) {
          wx.switchTab({
            url: '/pages/mine/index',
            success: () => wx.showToast({ title: '在邀请书友共建处发出邀请', icon: 'none' }),
          });
        }
      },
    });
  },

  hideEarnPointGuide() {
    this.setData({ showEarnGuideModal: false });
  },

  confirmEarnPointGuide() {
    this.hideEarnPointGuide();
    this.goPublish();
  },

  goGuide() {
    wx.navigateTo({ url: '/pages/drift/guide' });
  },

  onCoverError,

  onShareAppMessage() {
    const user = wx.getStorageSync('userInfo') || {};
    return {
      ...poolShare(user.id),
      path: user.id ? `/pages/pool/index?inviterId=${user.id}` : '/pages/pool/index',
    };
  },
});
