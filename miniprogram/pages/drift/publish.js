const api = require('../../utils/api');
const { CONDITIONS, CONDITION_ISSUES } = require('../../utils/util');
const { trackPageView, track } = require('../../utils/track');
const { pricingState, coinHintText, calculateSystemCoinValue } = require('../../utils/driftPricing');
const {
  formatShipFromLabel,
  normalizeShipRegion,
  parseShipRegionFromAddresses,
} = require('../../utils/shipRegion');
const { hasMissingBookMeta } = require('../../utils/bookMetaEdit');

function createConditionIssueOptions(selected = []) {
  return CONDITION_ISSUES.map((option) => ({
    ...option,
    selected: selected.includes(option.key),
  }));
}

function splitSelectedByListPrice(selectedIds = [], shelfBooks = [], condition = 'like_new') {
  const validIds = [];
  const invalidItems = [];
  selectedIds.forEach((id) => {
    const item = shelfBooks.find((entry) => entry.id === id);
    if (!item) return;
    if (pricingState(item.book, condition).hasListPrice) validIds.push(id);
    else invalidItems.push(item);
  });
  return { validIds, invalidItems };
}

function decorateShelfBooks(list = [], selectedIds = [], condition = 'like_new') {
  const selectedSet = new Set(selectedIds);
  return list.map((item) => ({
    ...item,
    selected: selectedSet.has(item.id),
    previewCoinValue: calculateSystemCoinValue(item.book, condition),
    missingListPrice: !pricingState(item.book, condition).hasListPrice,
    needsMetaEdit: hasMissingBookMeta(item.book),
  }));
}

Page({
  data: {
    mode: 'shelf',
    book: null,
    bookId: '',
    shelfBookId: '',
    shelfBooks: [],
    selectedShelfIds: [],
    selectedCount: 0,
    missingPriceSelectedCount: 0,
    batchMode: false,
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
    this.setData({
      bookId: options.bookId || '',
      mode: options.mode || 'shelf',
    });
    trackPageView('drift/publish', { bookId: options.bookId || '', mode: options.mode || 'shelf' });
    this.loadBook();
  },

  onShow() {
    if (this._hasShown) this.loadBook();
    this._hasShown = true;
  },

  async loadBook() {
    this.setData({ loadingShelfBooks: true });
    try {
      const [shelf, addrRes] = await Promise.all([
        api.getShelfBooks('all'),
        api.getAddresses().catch(() => ({ list: [] })),
      ]);
      const shelfBooks = decorateShelfBooks(
        (shelf.list || []).filter((item) => item.canPublishDrift !== false),
        this.data.selectedShelfIds,
        this.data.condition,
      );
      const shipRegion = parseShipRegionFromAddresses(addrRes.list || []);
      const shipRegionLabel = formatShipFromLabel(shipRegion);
      this.setData({
        shelfBooks,
        shipRegion,
        shipRegionLabel,
        needsShipRegionPicker: !shipRegion,
      });
      if (this.data.bookId) {
        const item = shelfBooks.find((b) => b.bookId === this.data.bookId);
        if (item) {
          this.setSelectedBooks([item.id], shelfBooks);
        } else {
          wx.showToast({ title: '未在书架找到这本书', icon: 'none' });
        }
      }
    } finally {
      this.setData({ loadingShelfBooks: false });
    }
  },

  syncShelfSelection(selectedShelfIds, shelfBooks = this.data.shelfBooks) {
    const selectedItems = shelfBooks.filter((item) => selectedShelfIds.includes(item.id));
    const batchMode = selectedItems.length > 1;
    const missingPriceSelectedCount = selectedItems.filter(
      (item) => !pricingState(item.book, this.data.condition).hasListPrice,
    ).length;
    const next = {
      shelfBooks: decorateShelfBooks(shelfBooks, selectedShelfIds, this.data.condition),
      selectedShelfIds,
      selectedCount: selectedItems.length,
      missingPriceSelectedCount,
      batchMode,
      conditionIssues: [],
      conditionIssueOptions: createConditionIssueOptions(),
      isAnonymous: true,
    };
    if (selectedItems.length === 1) {
      const item = selectedItems[0];
      Object.assign(next, {
        shelfBookId: item.id,
        bookId: item.bookId,
        book: item.book,
        ...pricingState(item.book, this.data.condition),
      });
    } else {
      Object.assign(next, {
        shelfBookId: '',
        bookId: '',
        book: null,
        listPrice: 0,
        systemCoinValue: 0,
        coinValue: 0,
        coinHint: batchMode ? '批量上漂将按每本书各自的系统建议积分提交。' : '',
        hasListPrice: selectedItems.every((item) => pricingState(item.book, this.data.condition).hasListPrice),
      });
    }
    this.setData(next);
  },

  toggleBookSelection(e) {
    const shelfId = e.currentTarget.dataset.shelfId;
    const selected = new Set(this.data.selectedShelfIds);
    if (selected.has(shelfId)) selected.delete(shelfId);
    else selected.add(shelfId);
    this.syncShelfSelection([...selected]);
  },

  setSelectedBooks(selectedShelfIds, shelfBooks = this.data.shelfBooks) {
    this.syncShelfSelection(selectedShelfIds, shelfBooks);
  },

  clearSelectedBook() {
    if (!this.data.shelfBooks.length) return;
    this.syncShelfSelection([]);
  },

  continueAddBooks() {
    this.setData({
      book: null,
      bookId: '',
      shelfBookId: '',
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

  goEditBookMeta(e) {
    const shelfId = e.currentTarget.dataset.shelfId;
    if (!shelfId) return;
    wx.navigateTo({ url: `/pages/book/edit-meta?shelfBookId=${shelfId}&from=publish` });
  },

  selectCondition(e) {
    const condition = e.currentTarget.dataset.key;
    const patch = {
      condition,
      shelfBooks: decorateShelfBooks(this.data.shelfBooks, this.data.selectedShelfIds, condition),
    };
    if (this.data.batchMode) {
      patch.hasListPrice = this.data.selectedShelfIds.every((id) => {
        const item = this.data.shelfBooks.find((entry) => entry.id === id);
        return item ? pricingState(item.book, condition).hasListPrice : false;
      });
    } else if (this.data.book) {
      Object.assign(patch, pricingState(this.data.book, condition, this.data.coinValue));
    }
    this.setData(patch);
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
    const { validIds, invalidItems } = splitSelectedByListPrice(
      this.data.selectedShelfIds,
      this.data.shelfBooks,
      this.data.condition,
    );
    if (invalidItems.length) {
      if (validIds.length !== this.data.selectedShelfIds.length) {
        this.syncShelfSelection(validIds);
      }
      const count = invalidItems.length;
      wx.showToast({
        title: count === 1
          ? `《${invalidItems[0].book.title}》定价缺失，已取消勾选`
          : `已取消 ${count} 本定价缺失的书`,
        icon: 'none',
        duration: 2500,
      });
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

  buildPublishPayload(item, coinValue) {
    return {
      shelfBookId: item.id,
      bookId: item.bookId,
      condition: this.data.condition,
      conditionIssues: this.data.conditionIssues,
      isAnonymous: this.data.isAnonymous,
      coinValue,
      shipRegion: this.data.shipRegion || undefined,
    };
  },

  async submitSingle() {
    if (this.data.coinValue === 0) {
      const confirmed = await this.confirmZeroCoinValue();
      if (!confirmed) return;
    }
    const item = this.data.shelfBooks.find((entry) => entry.id === this.data.shelfBookId);
    if (!item) {
      wx.showToast({ title: '请选择要赠出的书', icon: 'none' });
      return;
    }
    track('drift_publish_submit', { bookId: this.data.bookId, coinValue: this.data.coinValue });
    const result = await api.publishDrift(this.buildPublishPayload(item, this.data.coinValue));
    wx.redirectTo({
      url: `/pages/drift/check-result?driftId=${result.driftId}&passed=${result.passed}&status=${result.status || ''}`,
    });
  },

  async submitBatch() {
    const selectedItems = this.data.shelfBooks.filter((item) => this.data.selectedShelfIds.includes(item.id));
    if (!selectedItems.length) {
      wx.showToast({ title: '请选择要赠出的书', icon: 'none' });
      return;
    }
    const results = [];
    for (const item of selectedItems) {
      const pricing = pricingState(item.book, this.data.condition);
      try {
        track('drift_publish_submit', { bookId: item.bookId, coinValue: pricing.coinValue, batch: true });
        const result = await api.publishDrift(this.buildPublishPayload(item, pricing.coinValue));
        results.push({
          ok: true,
          title: item.book.title,
          passed: result.passed,
          status: result.status,
        });
      } catch (err) {
        results.push({
          ok: false,
          title: item.book.title,
          message: err.message || '提交失败',
        });
      }
    }
    wx.setStorageSync('driftBatchPublishResult', {
      results,
      at: Date.now(),
    });
    wx.redirectTo({ url: '/pages/drift/batch-result' });
  },

  async submit() {
    if (this.data.submitting) return;
    if (!this.data.selectedCount) {
      wx.showToast({ title: '请选择要赠出的书', icon: 'none' });
      return;
    }
    if (!this.validateCoinValue()) return;
    this.setData({ submitting: true });
    try {
      if (this.data.batchMode) {
        await this.submitBatch();
      } else {
        await this.submitSingle();
      }
    } catch (e) {
      console.error(e);
    } finally {
      this.setData({ submitting: false });
    }
  },
});
