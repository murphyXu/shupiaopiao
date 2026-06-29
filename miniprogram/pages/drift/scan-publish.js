const api = require('../../utils/api');
const { CONDITIONS, CONDITION_ISSUES } = require('../../utils/util');
const { trackPageView, track } = require('../../utils/track');
const { pricingState, coinHintText } = require('../../utils/driftPricing');
const {
  formatShipFromLabel,
  normalizeShipRegion,
  parseShipRegionFromAddresses,
} = require('../../utils/shipRegion');
const { SET_COMPLETENESS_OPTIONS, detectSetBookRisk } = require('../../utils/setBookRisk');

const GIVEN_LIST_URL = '/pages/drift/given?status=IN_POOL';

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
    setCompletenessOptions: SET_COMPLETENESS_OPTIONS,
    setBookRisk: false,
    setBookRiskReason: '',
    setCompleteness: '',
    setDescription: '',
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
    continuousScan: false,
    batchMessage: '',
  },

  onLoad(options = {}) {
    trackPageView('drift/scan-publish');
    this.setData({ sessionCount: Number(options.sessionCount) || 0 });
    this.loadShipRegion();
    if (options.isbn) {
      this.prepareBook(decodeURIComponent(options.isbn));
    } else if (options.autoScan === '1') {
      this.doScan();
    }
  },

  onShow() {
    if (this._hasShown && this.data.shelfBookId) this.refreshBookPricing();
    this._hasShown = true;
  },

  async refreshBookPricing() {
    try {
      const item = await api.getShelfBookDetail(this.data.shelfBookId);
      if (!item || !item.book) return;
      this.setData({
        book: item.book,
        ...detectSetBookRisk(item.book),
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

  resetBookForm() {
    this.setData({
      book: null,
      bookId: '',
      shelfBookId: '',
      lookupStatus: 'idle',
      lookupError: '',
      scannedIsbn: '',
      conditionIssues: [],
      conditionIssueOptions: createConditionIssueOptions(),
      setBookRisk: false,
      setBookRiskReason: '',
      setCompleteness: '',
      setDescription: '',
      listPrice: 0,
      systemCoinValue: 0,
      coinValue: 0,
      coinHint: '',
      hasListPrice: false,
      isAnonymous: true,
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
      setBookRisk: false,
      setBookRiskReason: '',
      setCompleteness: '',
      setDescription: '',
      batchMessage: '',
    });
    wx.showLoading({ title: '识别中' });
    try {
      const book = await api.getBookByIsbn(clean, 'scan');
      track('book_lookup', { source: 'scan_publish', isbn: clean });
      const shelfItem = await api.addShelfBook({
        bookId: book.id,
        fromScanPublish: true,
        readingStatus: 'read',
        category: 'read',
      });
      this.setData({
        book,
        bookId: shelfItem.bookId,
        shelfBookId: shelfItem.id,
        lookupStatus: 'found',
        isAnonymous: true,
        ...detectSetBookRisk(book),
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

  toggleContinuousScan() {
    this.setData({
      continuousScan: !this.data.continuousScan,
      batchMessage: !this.data.continuousScan ? this.data.batchMessage : '',
    });
  },

  goFinishGiven() {
    wx.redirectTo({ url: GIVEN_LIST_URL });
  },

  selectSetCompleteness(e) {
    this.setData({ setCompleteness: e.currentTarget.dataset.value || '' });
  },

  onSetDescription(e) {
    this.setData({ setDescription: String(e.detail.value || '').slice(0, 60) });
  },

  validateSetConfirmation() {
    if (!this.data.setBookRisk) return true;
    if (!this.data.setCompleteness) {
      wx.showToast({ title: '请确认赠出内容后再上漂', icon: 'none' });
      return false;
    }
    if (this.data.setCompleteness === 'partial' && !String(this.data.setDescription || '').trim()) {
      wx.showToast({ title: '请说明实际包含哪些册', icon: 'none' });
      return false;
    }
    return true;
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

  showPublishFailure(result = {}) {
    const reasons = (result.reasons || []).map((item) => item.message).filter(Boolean);
    wx.showModal({
      title: '检测未通过',
      content: reasons.length ? reasons.join('\n') : '请修改后重试',
      showCancel: false,
    });
  },

  continueBatchScan(sessionCount) {
    this.setData({
      sessionCount,
      batchMessage: `已上漂，本次已连续 ${sessionCount} 本`,
    });
    wx.showToast({ title: '已上漂', icon: 'success' });
    this.resetBookForm();
    setTimeout(() => this.doScan(), 700);
  },

  async submit() {
    if (this.data.submitting) return;
    if (!this.data.bookId || !this.data.shelfBookId) {
      wx.showToast({ title: '请先扫码识别图书', icon: 'none' });
      return;
    }
    if (!this.validateCoinValue()) return;
    if (!this.validateSetConfirmation()) return;
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
        setCompleteness: this.data.setBookRisk ? this.data.setCompleteness : undefined,
        setDescription: this.data.setBookRisk ? this.data.setDescription : undefined,
      });
      const sessionCount = this.data.sessionCount + 1;
      if (this.data.continuousScan) {
        if (result.passed) {
          this.continueBatchScan(sessionCount);
          return;
        }
        this.showPublishFailure(result);
        return;
      }
      wx.redirectTo({
        url: `/pages/drift/check-result?driftId=${result.driftId}&passed=${result.passed}&status=${result.status || ''}&source=scan&sessionCount=${sessionCount}`,
      });
    } catch (e) {
      console.error(e);
    } finally {
      this.setData({ submitting: false });
    }
  },
});
