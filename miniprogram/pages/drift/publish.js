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
const { SET_COMPLETENESS_OPTIONS, detectSetBookRisk } = require('../../utils/setBookRisk');
const { readPageCache, writePageCache, shouldUseCachedPage, invalidatePageCache } = require('../../utils/pageCache');

function createConditionIssueOptions(selected = []) {
  return CONDITION_ISSUES.map((option) => ({
    ...option,
    selected: selected.includes(option.key),
  }));
}

function splitSelectedByListPrice(selectedIds = [], shelfBooks = [], condition = 'like_new', bookSettings = {}) {
  const validIds = [];
  const invalidItems = [];
  selectedIds.forEach((id) => {
    const item = shelfBooks.find((entry) => entry.id === id);
    if (!item) return;
    const itemCondition = (bookSettings[id] && bookSettings[id].condition) || condition;
    if (pricingState(item.book, itemCondition).hasListPrice) validIds.push(id);
    else invalidItems.push(item);
  });
  return { validIds, invalidItems };
}

function createDefaultBookSetting(book, condition = 'like_new') {
  const pricing = pricingState(book, condition);
  return {
    condition,
    conditionIssues: [],
    conditionIssueOptions: createConditionIssueOptions(),
    listPrice: pricing.listPrice,
    systemCoinValue: pricing.systemCoinValue,
    coinValue: pricing.coinValue,
    hasListPrice: pricing.hasListPrice,
    coinHint: coinHintText(pricing.coinValue, pricing.systemCoinValue),
  };
}

function syncBookSettings(selectedIds = [], shelfBooks = [], existing = {}) {
  const next = {};
  selectedIds.forEach((id) => {
    const item = shelfBooks.find((entry) => entry.id === id);
    if (!item) return;
    const prev = existing[id];
    if (prev) {
      const pricing = pricingState(item.book, prev.condition, prev.coinValue);
      next[id] = {
        ...prev,
        listPrice: pricing.listPrice,
        systemCoinValue: pricing.systemCoinValue,
        coinValue: pricing.coinValue,
        hasListPrice: pricing.hasListPrice,
        coinHint: coinHintText(pricing.coinValue, pricing.systemCoinValue),
        conditionIssueOptions: createConditionIssueOptions(prev.conditionIssues),
      };
    } else {
      next[id] = createDefaultBookSetting(item.book);
    }
  });
  return next;
}

function formatSetConfirmationDisplay(setCompleteness, setDescription = '') {
  if (!setCompleteness) return '';
  if (setCompleteness === 'partial') {
    const desc = String(setDescription || '').trim();
    return desc ? `非全套，${desc}` : '非全套';
  }
  if (setCompleteness === 'complete') return '完整套装';
  if (setCompleteness === 'non_set') return '非套装书';
  const option = SET_COMPLETENESS_OPTIONS.find((item) => item.key === setCompleteness);
  return option ? option.label : '';
}

function buildBatchSelectedItems(selectedIds = [], shelfBooks = [], bookSettings = {}, setConfirmations = {}) {
  return selectedIds
    .map((id) => {
      const item = shelfBooks.find((entry) => entry.id === id);
      if (!item) return null;
      const settings = bookSettings[id] || createDefaultBookSetting(item.book);
      const conditionEntry = CONDITIONS.find((c) => c.key === settings.condition);
      const risk = detectSetBookRisk(item.book || {});
      const confirmation = setConfirmations[id] || {};
      return {
        id,
        book: item.book,
        needsMetaEdit: hasMissingBookMeta(item.book),
        missingListPrice: !settings.hasListPrice,
        conditionLabel: conditionEntry ? conditionEntry.label : settings.condition,
        setBookRisk: !!risk.setBookRisk,
        needsSetConfirmation: !!risk.setBookRisk && !confirmation.setCompleteness,
        setDisplayText: risk.setBookRisk
          ? formatSetConfirmationDisplay(confirmation.setCompleteness, confirmation.setDescription)
          : '',
        setDescription: confirmation.setDescription || '',
        ...settings,
      };
    })
    .filter(Boolean);
}

function mergeTargetShelfBook(list = [], target = null) {
  if (!target || target.canPublishDrift === false) return list;
  const idx = list.findIndex((item) => item.id === target.id);
  if (idx >= 0) {
    const next = list.slice();
    next[idx] = target;
    return next;
  }
  return [target, ...list];
}

function decorateShelfBooks(list = [], selectedIds = [], condition = 'like_new', setConfirmations = {}, bookSettings = {}) {
  const selectedSet = new Set(selectedIds);
  return list.map((item) => {
    const risk = detectSetBookRisk(item.book || {});
    const confirmation = setConfirmations[item.id] || {};
    const itemCondition = (bookSettings[item.id] && bookSettings[item.id].condition) || condition;
    const pricing = pricingState(item.book, itemCondition);
    const setCompleteness = confirmation.setCompleteness || '';
    return {
      ...item,
      ...risk,
      selected: selectedSet.has(item.id),
      setCompleteness,
      setDescription: confirmation.setDescription || '',
      needsSetConfirmation: !!risk.setBookRisk && !setCompleteness,
      previewCoinValue: calculateSystemCoinValue(item.book, itemCondition),
      missingListPrice: !pricing.hasListPrice,
      needsMetaEdit: hasMissingBookMeta(item.book),
    };
  });
}

function buildSelectedRiskItems(selectedIds = [], shelfBooks = [], setConfirmations = {}) {
  return selectedIds
    .map((id) => shelfBooks.find((entry) => entry.id === id))
    .filter(Boolean)
    .map((item) => {
      const risk = detectSetBookRisk(item.book || {});
      const confirmation = setConfirmations[item.id] || {};
      const setCompleteness = confirmation.setCompleteness || '';
      const setDescription = confirmation.setDescription || '';
      return {
        id: item.id,
        title: item.book && item.book.title,
        ...risk,
        setCompleteness,
        setDescription,
        setDisplayText: formatSetConfirmationDisplay(setCompleteness, setDescription),
      };
    })
    .filter((item) => item.setBookRisk);
}

function setConfirmationPayload(item, setConfirmations = {}) {
  const risk = detectSetBookRisk(item.book || {});
  if (!risk.setBookRisk) return {};
  const confirmation = setConfirmations[item.id] || {};
  return {
    setCompleteness: confirmation.setCompleteness || '',
    setDescription: confirmation.setDescription || '',
  };
}

const PUBLISH_STEPS = [
  { key: 1, label: '选书' },
  { key: 2, label: '品相' },
  { key: 3, label: '积分' },
  { key: 4, label: '确认' },
];

Page({
  data: {
    mode: 'shelf',
    step: 1,
    publishSteps: PUBLISH_STEPS,
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
    setCompletenessOptions: SET_COMPLETENESS_OPTIONS,
    setConfirmations: {},
    bookSettings: {},
    batchSelectedItems: [],
    selectedRiskItems: [],
    pendingSetConfirmCount: 0,
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
    if (options.shelfBookId || options.bookId) invalidatePageCache('drift/publish');
    this.setData({
      bookId: options.bookId || '',
      shelfBookId: options.shelfBookId || '',
      mode: options.mode || 'shelf',
    });
    trackPageView('drift/publish', {
      bookId: options.bookId || '',
      shelfBookId: options.shelfBookId || '',
      mode: options.mode || 'shelf',
    });
    this.loadBook();
  },

  onShow() {
    if (this._hasShown && shouldUseCachedPage('drift/publish')) return;
    if (this._hasShown) this.loadBook(false);
    this._hasShown = true;
  },

  async ensureShipRegionLoaded() {
    if (this.data.shipRegion || this._addressesLoaded) return;
    this._addressesLoaded = true;
    try {
      const addrRes = await api.getAddresses().catch(() => ({ list: [] }));
      const shipRegion = parseShipRegionFromAddresses(addrRes.list || []);
      this.setData({
        shipRegion,
        shipRegionLabel: formatShipFromLabel(shipRegion),
        needsShipRegionPicker: !shipRegion,
      });
    } catch (err) {
      console.warn('[publish] address load skipped', err);
    }
  },

  async resolveTargetShelfItem() {
    const { shelfBookId, bookId } = this.data;
    if (shelfBookId) {
      try {
        const item = await api.getShelfBookDetail(shelfBookId);
        if (item && item.activeDrift) {
          wx.showToast({ title: item.activeDrift.statusLabel || '这本书正在漂流中', icon: 'none' });
          return null;
        }
        return item ? { ...item, canPublishDrift: !item.activeDrift } : null;
      } catch (err) {
        console.warn('[publish] shelfBookId lookup failed', err);
        return null;
      }
    }
    if (bookId) return this.fetchPublishCandidateByBookId(bookId);
    return null;
  },

  async fetchPublishCandidateByBookId(bookId) {
    let page = 1;
    for (;;) {
      const shelf = await api.getPublishCandidates({ page, size: 50 }, { showError: page === 1 });
      const item = (shelf.list || []).find((entry) => entry.bookId === bookId);
      if (item) return item;
      if (!shelf.hasMore) return null;
      page += 1;
    }
  },

  async loadBook(force = true) {
    if (!force) {
      const cached = readPageCache('drift/publish');
      if (cached && cached.data) {
        this.applyPublishShelfPayload(cached.data, this._targetShelfItem || null);
        return;
      }
    }
    this.setData({ loadingShelfBooks: true });
    try {
      const targetItem = await this.resolveTargetShelfItem();
      this._targetShelfItem = targetItem;
      const shelf = await api.getPublishCandidates({ page: 1, size: 50 }, {
        deferCoverEnrichment: true,
        onEnriched: (enriched) => {
          this.applyPublishShelfPayload(enriched, this._targetShelfItem || null);
          writePageCache('drift/publish', enriched);
        },
      });
      this.applyPublishShelfPayload(shelf, targetItem);
      writePageCache('drift/publish', shelf);
    } finally {
      this.setData({ loadingShelfBooks: false });
    }
  },

  applyPublishShelfPayload(shelf = {}, targetItem = null) {
    const rawList = mergeTargetShelfBook(
      (shelf.list || []).filter((item) => item.canPublishDrift !== false),
      targetItem,
    );
    const shelfBooks = decorateShelfBooks(
      rawList,
      this.data.selectedShelfIds,
      this.data.condition,
      this.data.setConfirmations,
      this.data.bookSettings,
    );
    this.setData({ shelfBooks });
    if (this.data.shelfBookId || this.data.bookId) {
      const item = this.data.shelfBookId
        ? shelfBooks.find((b) => b.id === this.data.shelfBookId)
        : shelfBooks.find((b) => b.bookId === this.data.bookId);
      if (item) {
        this.setSelectedBooks([item.id], shelfBooks);
      } else if (this.data.loadingShelfBooks === false) {
        wx.showToast({ title: '未在书架找到这本书', icon: 'none' });
      }
    }
  },

  syncShelfSelection(selectedShelfIds, shelfBooks = this.data.shelfBooks) {
    const selectedItems = shelfBooks.filter((item) => selectedShelfIds.includes(item.id));
    const batchMode = selectedItems.length > 1;
    const bookSettings = batchMode
      ? syncBookSettings(selectedShelfIds, shelfBooks, this.data.bookSettings)
      : {};
    const batchSelectedItems = batchMode
      ? buildBatchSelectedItems(selectedShelfIds, shelfBooks, bookSettings, this.data.setConfirmations)
      : [];
    const selectedRiskItems = buildSelectedRiskItems(selectedShelfIds, shelfBooks, this.data.setConfirmations);
    const missingPriceSelectedCount = batchMode
      ? batchSelectedItems.filter((item) => item.missingListPrice).length
      : selectedItems.filter(
        (item) => !pricingState(item.book, this.data.condition).hasListPrice,
      ).length;
    const next = {
      shelfBooks: decorateShelfBooks(
        shelfBooks,
        selectedShelfIds,
        this.data.condition,
        this.data.setConfirmations,
        bookSettings,
      ),
      selectedShelfIds,
      selectedCount: selectedItems.length,
      missingPriceSelectedCount,
      batchMode,
      bookSettings,
      batchSelectedItems,
      selectedRiskItems,
      pendingSetConfirmCount: selectedRiskItems.filter((item) => !item.setCompleteness).length,
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
        coinHint: '',
        hasListPrice: batchSelectedItems.every((item) => item.hasListPrice),
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
      shelfBooks: decorateShelfBooks(
        this.data.shelfBooks,
        this.data.selectedShelfIds,
        condition,
        this.data.setConfirmations,
        this.data.bookSettings,
      ),
    };
    if (this.data.book) {
      Object.assign(patch, pricingState(this.data.book, condition, this.data.coinValue));
    }
    this.setData(patch);
  },

  applyBookSettingsUpdate(shelfId, updater) {
    const item = this.data.shelfBooks.find((entry) => entry.id === shelfId);
    const prev = this.data.bookSettings[shelfId] || createDefaultBookSetting(item && item.book);
    const updated = updater(prev);
    const bookSettings = {
      ...this.data.bookSettings,
      [shelfId]: updated,
    };
    const batchSelectedItems = buildBatchSelectedItems(
      this.data.selectedShelfIds,
      this.data.shelfBooks,
      bookSettings,
      this.data.setConfirmations,
    );
    this.setData({
      bookSettings,
      batchSelectedItems,
      missingPriceSelectedCount: batchSelectedItems.filter((entry) => entry.missingListPrice).length,
      hasListPrice: batchSelectedItems.every((entry) => entry.hasListPrice),
      shelfBooks: decorateShelfBooks(
        this.data.shelfBooks,
        this.data.selectedShelfIds,
        this.data.condition,
        this.data.setConfirmations,
        bookSettings,
      ),
    });
  },

  selectBookCondition(e) {
    const shelfId = e.currentTarget.dataset.shelfId;
    const condition = e.currentTarget.dataset.key;
    if (!shelfId || !condition) return;
    this.applyBookSettingsUpdate(shelfId, (prev) => {
      const item = this.data.shelfBooks.find((entry) => entry.id === shelfId);
      const pricing = pricingState(item && item.book, condition, prev.coinValue);
      return {
        ...prev,
        condition,
        listPrice: pricing.listPrice,
        systemCoinValue: pricing.systemCoinValue,
        coinValue: pricing.coinValue,
        hasListPrice: pricing.hasListPrice,
        coinHint: coinHintText(pricing.coinValue, pricing.systemCoinValue),
      };
    });
  },

  toggleBookConditionIssue(e) {
    const shelfId = e.currentTarget.dataset.shelfId;
    const key = e.currentTarget.dataset.key;
    if (!shelfId || !key) return;
    this.applyBookSettingsUpdate(shelfId, (prev) => {
      const conditionIssues = [...(prev.conditionIssues || [])];
      const index = conditionIssues.indexOf(key);
      if (index >= 0) conditionIssues.splice(index, 1);
      else conditionIssues.push(key);
      return {
        ...prev,
        conditionIssues,
        conditionIssueOptions: createConditionIssueOptions(conditionIssues),
      };
    });
  },

  decreaseBookCoinValue(e) {
    const shelfId = e.currentTarget.dataset.shelfId;
    if (!shelfId) return;
    this.applyBookSettingsUpdate(shelfId, (prev) => {
      const coinValue = Math.max(0, prev.coinValue - 1);
      return {
        ...prev,
        coinValue,
        coinHint: coinHintText(coinValue, prev.systemCoinValue),
      };
    });
  },

  increaseBookCoinValue(e) {
    const shelfId = e.currentTarget.dataset.shelfId;
    if (!shelfId) return;
    this.applyBookSettingsUpdate(shelfId, (prev) => {
      const coinValue = Math.min(prev.systemCoinValue, prev.coinValue + 1);
      return {
        ...prev,
        coinValue,
        coinHint: coinHintText(coinValue, prev.systemCoinValue),
      };
    });
  },

  patchSetConfirmationState(setConfirmations) {
    const selectedRiskItems = buildSelectedRiskItems(
      this.data.selectedShelfIds,
      this.data.shelfBooks,
      setConfirmations,
    );
    const patch = {
      setConfirmations,
      shelfBooks: decorateShelfBooks(
        this.data.shelfBooks,
        this.data.selectedShelfIds,
        this.data.condition,
        setConfirmations,
        this.data.bookSettings,
      ),
      selectedRiskItems,
      pendingSetConfirmCount: selectedRiskItems.filter((item) => !item.setCompleteness).length,
    };
    if (this.data.batchMode) {
      patch.batchSelectedItems = buildBatchSelectedItems(
        this.data.selectedShelfIds,
        this.data.shelfBooks,
        this.data.bookSettings,
        setConfirmations,
      );
    }
    this.setData(patch);
  },

  selectSetCompleteness(e) {
    const shelfId = e.currentTarget.dataset.shelfId;
    const value = e.currentTarget.dataset.value;
    if (!shelfId || !value) return;
    const setConfirmations = {
      ...this.data.setConfirmations,
      [shelfId]: {
        ...(this.data.setConfirmations[shelfId] || {}),
        setCompleteness: value,
      },
    };
    this.patchSetConfirmationState(setConfirmations);
  },

  onSetDescription(e) {
    const shelfId = e.currentTarget.dataset.shelfId;
    if (!shelfId) return;
    const setConfirmations = {
      ...this.data.setConfirmations,
      [shelfId]: {
        ...(this.data.setConfirmations[shelfId] || {}),
        setDescription: String(e.detail.value || '').slice(0, 60),
      },
    };
    this.patchSetConfirmationState(setConfirmations);
  },

  scrollToSetConfirm() {
    if (this.data.step !== 1) {
      this.setData({ step: 1 }, () => {
        wx.pageScrollTo({ selector: '#set-confirm-section', duration: 300 });
      });
      return;
    }
    wx.pageScrollTo({ selector: '#set-confirm-section', duration: 300 });
  },

  promptSetConfirmation(item, message) {
    wx.showModal({
      title: '需确认赠出内容',
      content: message || `《${item.title}》可能是套装/多册书，请确认实际赠出内容。`,
      confirmText: '去确认',
      cancelText: '知道了',
      success: (res) => {
        if (res.confirm) this.scrollToSetConfirm();
      },
    });
  },

  validateSetConfirmations() {
    for (const item of this.data.selectedRiskItems) {
      if (!item.setCompleteness) {
        this.promptSetConfirmation(item);
        return false;
      }
      if (item.setCompleteness === 'partial' && !String(item.setDescription || '').trim()) {
        this.promptSetConfirmation(item, `请补充《${item.title}》实际包含哪些册，例如：仅第1、2册。`);
        return false;
      }
    }
    return true;
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
    const { invalidItems } = splitSelectedByListPrice(
      this.data.selectedShelfIds,
      this.data.shelfBooks,
      this.data.condition,
      this.data.batchMode ? this.data.bookSettings : {},
    );
    if (invalidItems.length) {
      const count = invalidItems.length;
      wx.showModal({
        title: '有书缺少定价',
        content: count === 1
          ? `《${invalidItems[0].book.title}》缺少定价，补录后才能上漂。请先补录定价或取消勾选这本书。`
          : `有 ${count} 本书缺少定价，补录后才能上漂。请先补录定价或取消勾选这些书。`,
        showCancel: false,
        confirmText: '我知道了',
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
    const settings = this.data.batchMode ? this.data.bookSettings[item.id] : null;
    return {
      shelfBookId: item.id,
      bookId: item.bookId,
      condition: settings ? settings.condition : this.data.condition,
      conditionIssues: settings ? settings.conditionIssues : this.data.conditionIssues,
      isAnonymous: this.data.isAnonymous,
      coinValue,
      shipRegion: this.data.shipRegion || undefined,
      ...setConfirmationPayload(item, this.data.setConfirmations),
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
    invalidatePageCache('pool/');
    invalidatePageCache('shelf/');
    invalidatePageCache('drift/publish');
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
    const hasZeroCoin = selectedItems.some((item) => {
      const settings = this.data.bookSettings[item.id];
      return settings && settings.coinValue === 0;
    });
    if (hasZeroCoin) {
      const confirmed = await this.confirmZeroCoinValue();
      if (!confirmed) return;
    }
    const results = [];
    for (const item of selectedItems) {
      const settings = this.data.bookSettings[item.id] || createDefaultBookSetting(item.book);
      try {
        track('drift_publish_submit', { bookId: item.bookId, coinValue: settings.coinValue, batch: true });
        const result = await api.publishDrift(this.buildPublishPayload(item, settings.coinValue));
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

  // 校验当前步骤是否可进入下一步
  canLeaveStep(step) {
    if (step === 1) {
      if (!this.data.selectedCount) {
        wx.showToast({ title: '请选择要赠出的书', icon: 'none' });
        return false;
      }
      if (!this.validateSetConfirmations()) return false;
    }
    if (step === 3) {
      if (!this.validateCoinValue()) return false;
    }
    return true;
  },

  goNextStep() {
    const { step } = this.data;
    if (!this.canLeaveStep(step)) return;
    if (step >= PUBLISH_STEPS.length) return;
    const nextStep = step + 1;
    if (nextStep >= 3) this.ensureShipRegionLoaded();
    this.setData({ step: nextStep });
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
  },

  goPrevStep() {
    const { step } = this.data;
    if (step <= 1) return;
    this.setData({ step: step - 1 });
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
  },

  gotoStep(e) {
    const target = Number(e.currentTarget.dataset.step) || 1;
    const { step } = this.data;
    if (target === step) return;
    // 仅允许回退到已完成步骤，或顺序前进时逐步校验
    if (target < step) {
      this.setData({ step: target });
      wx.pageScrollTo({ scrollTop: 0, duration: 0 });
      return;
    }
    // 前进：逐步校验中间步骤
    for (let s = step; s < target; s += 1) {
      if (!this.canLeaveStep(s)) {
        if (s !== step) this.setData({ step: s });
        return;
      }
    }
    this.setData({ step: target });
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
  },

  async submit() {
    if (this.data.submitting) return;
    await this.ensureShipRegionLoaded();
    if (!this.data.selectedCount) {
      wx.showToast({ title: '请选择要赠出的书', icon: 'none' });
      return;
    }
    if (!this.validateCoinValue()) return;
    if (!this.validateSetConfirmations()) return;
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
