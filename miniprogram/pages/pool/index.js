const api = require('../../utils/api');
const {
  CONDITIONS, POOL_CATEGORIES, isLoggedIn, requireLogin,
} = require('../../utils/util');
const safeAreaBehavior = require('../../behaviors/safe-area');
const { setTabBarIndex, refreshTabBarPendingShip } = require('../../utils/tab-bar');
const { trackPageView, track } = require('../../utils/track');
const { onCoverError } = require('../../utils/cover');
const { publishEarnGuideModal } = require('../../utils/pointRules');
const { showPublishEntryOptions } = require('../../utils/publishEntry');
const { poolShare } = require('../../utils/share');

const FILTER_MODES = [
  { key: 'category', label: '按品类' },
  { key: 'value', label: '按价值' },
  { key: 'condition', label: '按品相' },
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

function secondaryTabsFor(mode) {
  if (mode === 'value') return VALUE_TABS;
  if (mode === 'condition') return CONDITION_TABS;
  return POOL_CATEGORIES;
}

function isValueMatched(item, key) {
  if (!key || key === 'all') return true;
  const tab = VALUE_TABS.find((entry) => entry.key === key);
  if (!tab) return true;
  const value = Number(item.coinValue) || 0;
  if (tab.min !== undefined && value < tab.min) return false;
  if (tab.max !== undefined && value > tab.max) return false;
  return true;
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
    filterModes: FILTER_MODES,
    activeFilterMode: 'category',
    activeFilterKey: 'all',
    secondaryTabs: POOL_CATEGORIES,
    categoryTabs: POOL_CATEGORIES,
    filterCategory: 'all',
    valueTabs: VALUE_TABS,
    activeValue: 'all',
    conditionTabs: CONDITION_TABS,
    activeCondition: 'all',
    claimableOnly: true,
    showEarnGuideModal: false,
    earnGuide: publishEarnGuideModal(),
  },

  onShow() {
    setTabBarIndex.call(this, 0);
    refreshTabBarPendingShip();
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

  onInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  async loadList() {
    try {
      const res = await api.getPoolList({
        keyword: this.data.keyword,
        category: this.data.activeFilterMode === 'category' ? this.data.filterCategory : 'all',
        claimableOnly: this.data.claimableOnly,
      }, { showError: false });
      this.setData({ rawList: res.list || [] });
      this.filterList();
    } catch (e) {
      console.error(e);
    }
  },

  filterList() {
    const { activeFilterMode, activeValue, activeCondition, rawList } = this.data;
    let list = rawList;
    if (activeFilterMode === 'value') {
      list = list.filter((item) => isValueMatched(item, activeValue));
    } else if (activeFilterMode === 'condition' && activeCondition !== 'all') {
      list = list.filter((item) => item.condition === activeCondition);
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

  filterMode(e) {
    const activeFilterMode = e.currentTarget.dataset.key || 'category';
    const activeFilterKey = activeFilterMode === 'value'
      ? this.data.activeValue
      : (activeFilterMode === 'condition' ? this.data.activeCondition : this.data.filterCategory);
    this.setData({
      activeFilterMode,
      activeFilterKey,
      secondaryTabs: secondaryTabsFor(activeFilterMode),
    }, () => {
      this.loadList();
    });
  },

  filterSecondary(e) {
    const key = e.currentTarget.dataset.key || 'all';
    const data = { activeFilterKey: key };
    if (this.data.activeFilterMode === 'value') {
      data.activeValue = key;
    } else if (this.data.activeFilterMode === 'condition') {
      data.activeCondition = key;
    } else {
      data.filterCategory = key;
    }
    this.setData(data, () => {
      this.loadList();
    });
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
    if (!requireLogin('申请接漂需登录，以便管理漂流记录与公益积分')) return;
    const driftId = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/pool/detail?id=${driftId}` });
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
