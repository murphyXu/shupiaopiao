const api = require('../../utils/api');
const {
  CONDITIONS, POOL_CATEGORIES, isLoggedIn, requireLogin,
} = require('../../utils/util');
const safeAreaBehavior = require('../../behaviors/safe-area');
const { setTabBarIndex } = require('../../utils/tab-bar');

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
      givenCount: 0, receivedCount: 0, wantCount: 0, availableCoin: 0,
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
    claimableOnly: false,
  },

  onShow() {
    setTabBarIndex.call(this, 0);
    this.setData({ loggedIn: isLoggedIn() });
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
      });
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
    try {
      const stats = await api.getPoolStats();
      this.setData({
        stats: {
          ...this.data.stats,
          ...stats,
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

  goStatTarget(e) {
    const target = e.currentTarget.dataset.target;
    if (target === 'given') {
      if (!requireLogin('登录后可查看漂流赠出记录')) return;
      wx.navigateTo({ url: '/pages/drift/given' });
      return;
    }
    if (target === 'received') {
      if (!requireLogin('登录后可查看接漂记录')) return;
      wx.navigateTo({ url: '/pages/drift/received' });
      return;
    }
    if (target === 'want') {
      if (!requireLogin('登录后可查看想要接漂的书')) return;
      wx.navigateTo({ url: '/pages/pool/wants' });
      return;
    }
    this.setData({
      activeFilterMode: 'category',
      activeFilterKey: 'all',
      secondaryTabs: secondaryTabsFor('category'),
      filterCategory: 'all',
      activeValue: 'all',
      activeCondition: 'all',
      claimableOnly: false,
    }, () => {
      this.loadList().then(() => this.scrollToList());
    });
  },

  scrollToList() {
    wx.pageScrollTo({ selector: '#pool-list', duration: 220 });
  },

  goDetail(e) {
    wx.navigateTo({ url: `/pages/pool/detail?id=${e.currentTarget.dataset.id}` });
  },

  goApply(e) {
    if (!requireLogin('申请接漂需登录，以便管理漂流记录与公益积分')) return;
    const driftId = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/pool/detail?id=${driftId}` });
  },

  goPublish() {
    if (!requireLogin('登录后可发起漂流赠书')) return;
    wx.navigateTo({ url: '/pages/drift/publish' });
  },

  showEarnPointGuide() {
    if (!requireLogin('登录后可查看和获得公益积分')) return;
    wx.showActionSheet({
      itemList: ['上漂一本书', '了解首赠', '邀请书友'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.goPublish();
          return;
        }
        if (res.tapIndex === 1) {
          wx.showModal({
            title: '首赠奖励',
            content: '首次完成一次赠书后，系统会按规则记录首赠公益积分；平时把书上漂，也是在为书友共建可流转的好书。',
            confirmText: '去上漂',
            cancelText: '知道了',
            success: (modalRes) => {
              if (modalRes.confirm) this.goPublish();
            },
          });
          return;
        }
        if (res.tapIndex === 2) {
          wx.switchTab({
            url: '/pages/mine/index',
            success: () => wx.showToast({ title: '在邀请书友共建处发出邀请', icon: 'none' }),
          });
        }
      },
    });
  },

  goGuide() {
    wx.navigateTo({ url: '/pages/drift/guide' });
  },
});
