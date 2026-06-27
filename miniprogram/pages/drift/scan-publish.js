const api = require('../../utils/api');
const { CONDITIONS, CONDITION_ISSUES } = require('../../utils/util');
const { trackPageView, track } = require('../../utils/track');
const { pricingState, coinHintText } = require('../../utils/driftPricing');
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

Page({
  data: {
    book: null,
    bookId: '',
    shelfBookId: '',
    lookupStatus: 'idle',
    lookupError: '',
    scannedIsbn: '',
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
    sessionCount: 0,
  },

  onLoad(options = {}) {
    trackPageView('drift/scan-publish');
    this.setData({ sessionCount: Number(options.sessionCount) || 0 });
    this.loadShipRegion();
    this.doScan();
  },

  onShow() {
    if (this._hasShown && this.data.shelfBookId) this.refreshBookPricing();
    this._hasShown = true;
  },

  async refreshBookPricing() {
    try {
      const shelf = await api.getShelfBooks('all');
      const item = (shelf.list || []).find((entry) => entry.id === this.data.shelfBookId);
      if (!item || !item.book) return;
      this.setData({
        book: item.book,
        ...pricingState(item.book, this.data.condition, this.data.coinValue),
      });
    } catch (err) {
      console.error(err);
    }
  },

  async loadShipRegion() {
    try {
      const addrRes = await api.getAddresses();
      const shipRegion = parseShipRegionFromAddresses(addrRes.list || []);
      this.setData({
        shipRegion,
        shipRegionLabel: formatShipFromLabel(shipRegion),
        needsShipRegionPicker: !shipRegion,
      });
    } catch (err) {
      console.error(err);
    }
  },

  doScan() {
    wx.scanCode({
      scanType: ['barCode'],
      success: (res) => {
        const isbn = res.result.replace(/[^0-9X]/gi, '');
        this.prepareBook(isbn);
      },
    });
  },

  async prepareBook(isbn) {
    const clean = String(isbn || '').replace(/[^0-9X]/gi, '');
    if (!clean) return;
    this.setData({
      book: null,
      bookId: '',
      shelfBookId: '',
      lookupStatus: 'loading',
      lookupError: '',
      scannedIsbn: clean,
      conditionIssues: [],
      conditionIssueOptions: createConditionIssueOptions(),
    });
    wx.showLoading({ title: '识别中' });
    try {
      const book = await api.getBookByIsbn(clean, 'scan');
      track('book_lookup', { source: 'scan_publish', isbn: clean });
      const shelfItem = await api.addShelfBook({
        bookId: book.id,
        purpose: 'drift_quick',
        readingStatus: 'read',
        category: 'read',
      });
      this.setData({
        book,
        bookId: shelfItem.bookId,
        shelfBookId: shelfItem.id,
        lookupStatus: 'found',
        isAnonymous: true,
        ...pricingState(book, this.data.condition),
      });
    } catch (err) {
      const message = err.message || '未识别该 ISBN，请换一本重试';
      this.setData({
        lookupStatus: 'error',
        lookupError: message,
      });
      wx.showToast({ title: message, icon: 'none' });
    } finally {
      wx.hideLoading();
    }
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
    if (index >= 0) conditionIssues.splice(index, 1);
    else conditionIssues.push(key);
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
      wx.showToast({ title: '图书定价缺失，请先补录', icon: 'none' });
      return false;
    }
    return true;
  },

  goEditBookMeta() {
    if (!this.data.shelfBookId) return;
    wx.navigateTo({ url: `/pages/book/edit-meta?shelfBookId=${this.data.shelfBookId}&from=scan-publish` });
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
    if (!this.data.bookId || !this.data.shelfBookId) {
      wx.showToast({ title: '请先扫码识别图书', icon: 'none' });
      return;
    }
    if (!this.validateCoinValue()) return;
    if (this.data.coinValue === 0) {
      const confirmed = await this.confirmZeroCoinValue();
      if (!confirmed) return;
    }
    this.setData({ submitting: true });
    try {
      track('drift_publish_submit', { bookId: this.data.bookId, coinValue: this.data.coinValue, source: 'scan_publish' });
      const result = await api.publishDrift({
        shelfBookId: this.data.shelfBookId,
        bookId: this.data.bookId,
        condition: this.data.condition,
        conditionIssues: this.data.conditionIssues,
        isAnonymous: this.data.isAnonymous,
        coinValue: this.data.coinValue,
        shipRegion: this.data.shipRegion || undefined,
      });
      const sessionCount = this.data.sessionCount + 1;
      wx.redirectTo({
        url: `/pages/drift/check-result?driftId=${result.driftId}&passed=${result.passed}&status=${result.status || ''}&continueScan=1&sessionCount=${sessionCount}`,
      });
    } catch (e) {
      console.error(e);
    } finally {
      this.setData({ submitting: false });
    }
  },
});
