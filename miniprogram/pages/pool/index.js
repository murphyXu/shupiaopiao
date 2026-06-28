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

function isValueMatched(item, key) {
  if (!key || key === 'all') return true;
  const tab = VALUE_TABS.find((entry) => entry.key === key);
  if (!tab) return true;
  const value = Number(item.coinValue) || 0;
  if (tab.min !== undefined && value < tab.min) return false;
  if (tab.max !== undefined && value > tab.max) return false;
  return true;
}

function hasRealCover(cover = '') {
  const value = String(cover || '').trim();
  return !!value && !/default\.png|brand\/logo|placeholder|undefined|null/.test(value);
}

const TOP_LOW_POINT_CHILDREN = 6;
const LOW_POINT_CHILDREN_MAX = 5;

function isLowPointChildrenItem(item = {}) {
  const value = Number(item.coinValue) || 0;
  return item.category === 'children' && value >= 0 && value <= LOW_POINT_CHILDREN_MAX;
}

function promoteTopLowPointChildren(list = [], topN = TOP_LOW_POINT_CHILDREN) {
  if (!list.length || topN <= 0) return list;
  const lowPointChildren = [];
  const others = [];
  list.forEach((item) => {
    if (isLowPointChildrenItem(item)) lowPointChildren.push(item);
    else others.push(item);
  });
  return [...lowPointChildren.slice(0, topN), ...lowPointChildren.slice(topN), ...others];
}

// 推荐排序：可接漂优先 + 童书优先 + 有封面优先，前 6 位优先 0-5 积分童书
function recommendSort(list = []) {
  const sorted = [...list].sort((a, b) => {
    const claimableDiff = (b.canClaim ? 1 : 0) - (a.canClaim ? 1 : 0);
    if (claimableDiff) return claimableDiff;
    const childrenDiff = (b.category === 'children' ? 1 : 0) - (a.category === 'children' ? 1 : 0);
    if (childrenDiff) return childrenDiff;
    return (hasRealCover((b.book || {}).cover) ? 1 : 0) - (hasRealCover((a.book || {}).cover) ? 1 : 0);
  });
  return promoteTopLowPointChildren(sorted);
}

Page({
  behaviors: [safeAreaBehavior],
  data: {
    loggedIn: false,
    keyword: '',
    rawList: [],
    list: [],
    stats: {
      availableCoin: 0,
    },
    categoryChips: CATEGORY_CHIPS,
    activeCategory: 'recommend',
    valueTabs: VALUE_TABS,
    conditionTabs: CONDITION_TABS,
    // 已生效的更多筛选
    activeValue: 'all',
    activeCondition: 'all',
    // 抽屉内草稿值
    showMoreFilter: false,
    filterFootPadding: 0,
    filterCompact: false,
    moreActive: false,
    draftValue: 'all',
    draftCondition: 'all',
    claimableOnly: true,
    showEarnGuideModal: false,
    earnGuide: publishEarnGuideModal(),
  },

  onShow() {
    setTabBarIndex.call(this, 0);
    setTimeout(() => refreshTabBarPendingShip(), 500);
    trackPageView('pool/index');
    const loggedIn = isLoggedIn();
    this.setData({ loggedIn, claimableOnly: loggedIn });
    const poolSearch = wx.getStorageSync('poolSearch');
    if (poolSearch) {
      this.setData({ keyword: poolSearch });
      wx.removeStorageSync('poolSearch');
    }
    const { reloadIfCoversUpdated } = require('../../utils/coverPage');
    reloadIfCoversUpdated(() => this.loadList());
    this.loadStats();
    this.loadList();
  },

  onHide() {
    setTabBarHidden(false);
  },

  onInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  async loadList() {
    const requestId = Date.now();
    this.lastListRequestId = requestId;
    const params = {
      keyword: this.data.keyword,
      category: this.data.activeCategory === 'recommend' ? 'all' : this.data.activeCategory,
      claimableOnly: this.data.claimableOnly,
      page: 1,
      size: FIRST_SCREEN_POOL_SIZE,
    };
    const applyList = (res) => {
      if (this.lastListRequestId !== requestId) return;
      this.setData({ rawList: res.list || [] });
      this.filterList();
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
    }
  },

  filterList() {
    const { activeCategory, activeValue, activeCondition, rawList } = this.data;
    let list = rawList;
    if (activeValue !== 'all') {
      list = list.filter((item) => isValueMatched(item, activeValue));
    }
    if (activeCondition !== 'all') {
      list = list.filter((item) => item.condition === activeCondition);
    }
    if (activeCategory === 'recommend') {
      list = recommendSort(list);
    }
    this.setData({ list });
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
    this.setData({ activeCategory }, () => this.loadList());
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
    this.setData({
      activeValue: draftValue,
      activeCondition: draftCondition,
      moreActive,
      showMoreFilter: false,
    }, () => this.filterList());
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

  goApply(e) {
    if (e.currentTarget.dataset.mine) {
      wx.showToast({ title: '不能接漂自己赠送的书', icon: 'none' });
      return;
    }
    const driftId = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/pool/detail?id=${driftId}` });
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
