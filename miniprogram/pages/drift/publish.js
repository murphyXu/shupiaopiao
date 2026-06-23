const api = require('../../utils/api');
const { CONDITIONS, CONDITION_ISSUES } = require('../../utils/util');
const {
  formatShipFromLabel,
  normalizeShipRegion,
  parseShipRegionFromAddresses,
} = require('../../utils/shipRegion');

function createConditionIssueOptions(selected = []) {
  return CONDITION_ISSUES.map((option) => ({
    ...option,
    selected: selected.includes(option.key),
  }));
}

function parseListPrice(value) {
  const match = String(value || '').replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

const CONDITION_FACTORS = { new: 1.5, like_new: 1, good: 0.9, seven_new: 0.8, below_seven: 0.8 };

function calculateSystemCoinValue(book, condition) {
  const price = parseListPrice(book && book.listPrice);
  return Math.max(Math.round(price * (CONDITION_FACTORS[condition] || 0.8) * 0.2), 0);
}

function clampCoinValue(coinValue, systemCoinValue) {
  const system = Math.max(Math.floor(Number(systemCoinValue) || 0), 0);
  const value = Math.floor(Number(coinValue) || 0);
  return Math.max(0, Math.min(value, system));
}

function coinHintText(coinValue, systemCoinValue) {
  const value = Number(coinValue) || 0;
  const system = Number(systemCoinValue) || 0;
  if (value === 0) {
    return '接漂方无需消耗公益积分；完成赠书后无流转积分，且不计入首次完成赠书奖励。';
  }
  if (value < system) {
    return '你已调低流转积分，接漂更容易；完成赠书后你将获得相应流转积分。';
  }
  return '按系统建议，接漂方需占用相应公益积分，完成赠书后你将获得相同流转积分。';
}

function pricingState(book, condition, currentCoinValue) {
  const sourceIsEstimate = book && book.listPriceSource === 'pricing_cache';
  const listPrice = sourceIsEstimate ? 0 : parseListPrice(book && book.listPrice);
  const systemCoinValue = listPrice ? calculateSystemCoinValue(book, condition) : 0;
  const coinValue = listPrice
    ? clampCoinValue(currentCoinValue === undefined ? systemCoinValue : currentCoinValue, systemCoinValue)
    : 0;
  return {
    listPrice,
    systemCoinValue,
    coinValue,
    coinHint: coinHintText(coinValue, systemCoinValue),
    hasListPrice: listPrice > 0,
  };
}

Page({
  data: {
    book: null,
    bookId: '',
    shelfBookId: '',
    shelfBooks: [],
    loadingShelfBooks: false,
    condition: 'like_new',
    conditions: CONDITIONS,
    conditionIssues: [],
    conditionIssueOptions: createConditionIssueOptions(),
    listPrice: 0,
    systemCoinValue: 0,
    coinValue: 0,
    coinHint: '',
    hasListPrice: false,
    isAnonymous: true,
    submitting: false,
    shipRegion: null,
    shipRegionLabel: '',
    needsShipRegionPicker: false,
  },

  onLoad(options) {
    this.setData({ bookId: options.bookId || '' });
    this.loadBook();
  },

  async loadBook() {
    this.setData({ loadingShelfBooks: true });
    try {
      const [shelf, addrRes] = await Promise.all([
        api.getShelfBooks('all'),
        api.getAddresses().catch(() => ({ list: [] })),
      ]);
      const shelfBooks = shelf.list || [];
      const shipRegion = parseShipRegionFromAddresses(addrRes.list || []);
      const shipRegionLabel = formatShipFromLabel(shipRegion);
      const item = this.data.bookId
        ? shelfBooks.find((b) => b.bookId === this.data.bookId)
        : null;
      this.setData({
        shelfBooks,
        shipRegion,
        shipRegionLabel,
        needsShipRegionPicker: !shipRegion,
      });
      if (item) {
        this.setSelectedBook(item);
      } else if (this.data.bookId) {
        wx.showToast({ title: '未在书架找到这本书', icon: 'none' });
      }
    } finally {
      this.setData({ loadingShelfBooks: false });
    }
  },

  selectBook(e) {
    const bookId = e.currentTarget.dataset.bookId;
    const item = this.data.shelfBooks.find((entry) => entry.bookId === bookId);
    if (!item) return;
    this.setSelectedBook(item);
  },

  setSelectedBook(item) {
    const { book, bookId } = item;
    this.setData({
      shelfBookId: item.id,
      bookId,
      book,
      conditionIssues: [],
      conditionIssueOptions: createConditionIssueOptions(),
      isAnonymous: true,
      ...pricingState(book, this.data.condition),
    });
  },

  clearSelectedBook() {
    if (!this.data.shelfBooks.length) return;
    this.setData({
      bookId: '',
      shelfBookId: '',
      book: null,
      conditionIssues: [],
      conditionIssueOptions: createConditionIssueOptions(),
      listPrice: 0,
      systemCoinValue: 0,
      coinValue: 0,
      coinHint: '',
      hasListPrice: false,
      isAnonymous: true,
    });
  },

  goAddBook() {
    wx.scanCode({
      scanType: ['barCode'],
      success: (res) => {
        const isbn = res.result.replace(/[^0-9X]/gi, '');
        wx.navigateTo({ url: `/pages/shelf/scan?isbn=${isbn}` });
      },
    });
  },

  selectCondition(e) {
    const condition = e.currentTarget.dataset.key;
    this.setData({
      condition,
      ...pricingState(this.data.book, condition, this.data.coinValue),
    });
  },

  decreaseCoinValue() {
    const coinValue = Math.max(0, this.data.coinValue - 1);
    this.setData({
      coinValue,
      coinHint: coinHintText(coinValue, this.data.systemCoinValue),
    });
  },

  increaseCoinValue() {
    const coinValue = Math.min(this.data.systemCoinValue, this.data.coinValue + 1);
    this.setData({
      coinValue,
      coinHint: coinHintText(coinValue, this.data.systemCoinValue),
    });
  },

  toggleConditionIssue(e) {
    const key = e.currentTarget.dataset.key;
    const conditionIssues = [...this.data.conditionIssues];
    const index = conditionIssues.indexOf(key);
    if (index >= 0) {
      conditionIssues.splice(index, 1);
    } else {
      conditionIssues.push(key);
    }
    this.setData({
      conditionIssues,
      conditionIssueOptions: createConditionIssueOptions(conditionIssues),
    });
  },

  toggleAnonymous(e) {
    this.setData({ isAnonymous: e.currentTarget.dataset.anonymous === '1' });
  },

  onShipRegionChange(e) {
    const [province, city] = e.detail.value || [];
    const shipRegion = normalizeShipRegion({ province, city });
    this.setData({
      shipRegion,
      shipRegionLabel: formatShipFromLabel(shipRegion),
      needsShipRegionPicker: !shipRegion,
    });
  },

  validateCoinValue() {
    if (!this.data.hasListPrice) {
      wx.showToast({ title: '图书定价缺失，暂不能发起漂流', icon: 'none' });
      return false;
    }
    return true;
  },

  confirmZeroCoinValue() {
    return new Promise((resolve) => {
      wx.showModal({
        title: '确认设为 0 积分',
        content: '接漂方无需消耗公益积分即可领取；完成赠书后你也不会获得流转积分，且不计入首次完成赠书奖励。',
        confirmText: '继续提交',
        success: (res) => resolve(!!res.confirm),
        fail: () => resolve(false),
      });
    });
  },

  async submit() {
    if (this.data.submitting) return;
    if (!this.data.bookId) {
      wx.showToast({ title: '请选择要赠出的书', icon: 'none' });
      return;
    }
    if (!this.validateCoinValue()) return;
    if (this.data.coinValue === 0) {
      const confirmed = await this.confirmZeroCoinValue();
      if (!confirmed) return;
    }
    this.setData({ submitting: true });
    try {
      const result = await api.publishDrift({
        shelfBookId: this.data.shelfBookId,
        bookId: this.data.bookId,
        condition: this.data.condition,
        conditionIssues: this.data.conditionIssues,
        isAnonymous: this.data.isAnonymous,
        coinValue: this.data.coinValue,
        shipRegion: this.data.shipRegion || undefined,
      });
      wx.redirectTo({ url: `/pages/drift/check-result?driftId=${result.driftId}&passed=${result.passed}&status=${result.status || ''}` });
    } catch (e) {
      console.error(e);
    } finally {
      this.setData({ submitting: false });
    }
  },
});
