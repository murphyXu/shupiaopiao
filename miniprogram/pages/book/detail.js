const api = require('../../utils/api');
const {
  CATEGORIES, BOOK_CLASSES, SHELF_LOCATIONS, CONDITIONS, CONDITION_ISSUES, findLabel,
} = require('../../utils/util');
const { onCoverError } = require('../../utils/cover');
const { bookShare } = require('../../utils/share');
const { pricingState, parseListPrice } = require('../../utils/driftPricing');
const { hasMissingBookMeta, missingFieldsSummary } = require('../../utils/bookMetaEdit');

function isGenericCategory(category) {
  return !category || ['图书', '童书', '其他', '未分类'].includes(String(category).trim());
}

function needsCoverRefresh(book = {}) {
  const cover = String(book.cover || '').trim();
  if (cover.startsWith('cloud://')) return false;
  if (book.coverRemote && /^https?:\/\//.test(book.coverRemote)) return false;
  if (/^https?:\/\//.test(cover)) return false;
  return !!book.isbn;
}

function needsMetadataRefresh(book = {}) {
  return !!book.isbn && (needsCoverRefresh(book) || !book.listPrice || isGenericCategory(book.category));
}

function createConditionIssueOptions(selected = []) {
  return CONDITION_ISSUES.map((option) => ({
    ...option,
    selected: selected.includes(option.key),
  }));
}

function buildDraftFromItem(item) {
  const drift = item.activeDrift;
  const draft = {
    readingStatus: item.readingStatus,
    bookClass: item.bookClass,
    shelfLocationKey: item.shelfLocationKey,
    shelfLocationName: item.shelfLocationName,
    customLocationName: item.shelfLocationName || '',
  };
  if (drift && drift.canEdit) {
    draft.condition = drift.condition || 'like_new';
    draft.conditionIssues = [...(drift.conditionIssues || [])];
    draft.coinValue = Number(drift.coinValue) || 0;
    draft.systemCoinValue = Number(drift.systemCoinValue) || 0;
    const bookListPrice = parseListPrice(item.book && item.book.listPrice);
    draft.listPrice = Number(drift.listPrice) || bookListPrice || 0;
    draft.hasListPrice = draft.listPrice > 0;
    draft.coinHint = '';
  }
  return draft;
}

function syncDriftPricing(draft, book = {}) {
  if (draft.condition === undefined) return draft;
  const bookListPrice = parseListPrice(book.listPrice);
  const listPriceValue = Number(draft.listPrice) || bookListPrice || 0;
  const listPriceText = listPriceValue ? `¥${listPriceValue}` : '';
  const priced = pricingState({
    listPrice: listPriceText,
    medianPrice: book.medianPrice,
    listPriceSource: book.listPriceSource,
  }, draft.condition, draft.coinValue);
  return {
    ...draft,
    listPrice: priced.listPrice || listPriceValue,
    systemCoinValue: priced.systemCoinValue,
    coinValue: priced.coinValue,
    coinHint: priced.coinHint,
    hasListPrice: priced.hasListPrice || listPriceValue > 0,
  };
}

function resolveDraftLocation(draft) {
  const custom = String(draft.customLocationName || '').trim();
  const preset = SHELF_LOCATIONS.find((entry) => entry.key === draft.shelfLocationKey);
  if (preset && (!custom || custom === preset.label)) {
    return { shelfLocationKey: preset.key, shelfLocationName: preset.label };
  }
  if (custom) {
    const existingPreset = SHELF_LOCATIONS.find((entry) => entry.label === custom);
    if (existingPreset) {
      return { shelfLocationKey: existingPreset.key, shelfLocationName: existingPreset.label };
    }
    const key = preset && !SHELF_LOCATIONS.find((entry) => entry.key === draft.shelfLocationKey)
      ? draft.shelfLocationKey
      : `custom_${Date.now()}`;
    return { shelfLocationKey: key, shelfLocationName: custom };
  }
  return {
    shelfLocationKey: draft.shelfLocationKey,
    shelfLocationName: draft.shelfLocationName,
  };
}

function draftChanged(draft, baseline) {
  if (!draft || !baseline) return false;
  const location = resolveDraftLocation(draft);
  const baseLocation = resolveDraftLocation(baseline);
  if (draft.readingStatus !== baseline.readingStatus) return true;
  if (draft.bookClass !== baseline.bookClass) return true;
  if (location.shelfLocationKey !== baseLocation.shelfLocationKey) return true;
  if (location.shelfLocationName !== baseLocation.shelfLocationName) return true;
  if (baseline.condition !== undefined) {
    if (draft.condition !== baseline.condition) return true;
    if (JSON.stringify(draft.conditionIssues || []) !== JSON.stringify(baseline.conditionIssues || [])) return true;
    if (draft.coinValue !== baseline.coinValue) return true;
  }
  return false;
}

Page({
  data: {
    item: null,
    draft: null,
    draftBaseline: null,
    draftDirty: false,
    saving: false,
    categories: CATEGORIES,
    bookClasses: BOOK_CLASSES,
    shelfLocations: SHELF_LOCATIONS,
    conditions: CONDITIONS,
    conditionIssueOptions: createConditionIssueOptions(),
    stars: [1, 2, 3, 4, 5],
    needsMetaEdit: false,
    missingMetaHint: '',
  },

  onLoad(options) {
    this.shelfId = options.id;
  },

  onShow() {
    this.loadBook();
  },

  async loadBook() {
    if (!this.shelfId) return;
    try {
      const item = await api.getShelfBookDetail(this.shelfId);
      if (item) this.setBookItem(item);
      else wx.showToast({ title: '未找到这本书', icon: 'none' });
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
    }
  },

  setBookItem(item) {
    const nextItem = {
      ...item,
      readingStatusLabel: item.readingStatusLabel || findLabel(CATEGORIES, item.readingStatus, '想读'),
      bookClassLabel: item.bookClassLabel || findLabel(BOOK_CLASSES, item.bookClass, '其他'),
    };
    nextItem.displayCategory = nextItem.bookClassLabel
      || item.displayCategory
      || item.sourceCategory
      || (item.book || {}).category
      || '其他';
    nextItem.book = {
      ...(item.book || {}),
      category: nextItem.displayCategory,
    };
    let draft = buildDraftFromItem(nextItem);
    draft = syncDriftPricing(draft, nextItem.book);
    const draftBaseline = JSON.parse(JSON.stringify(draft));
    this.setData({
      item: nextItem,
      draft,
      draftBaseline,
      draftDirty: false,
      needsMetaEdit: hasMissingBookMeta(nextItem.book),
      missingMetaHint: missingFieldsSummary(nextItem.book),
      conditionIssueOptions: createConditionIssueOptions(draft.conditionIssues || []),
    });
    this.refreshBookMetadata(nextItem);
  },

  updateDraft(patch) {
    let draft = { ...this.data.draft, ...patch };
    if (patch.condition !== undefined || patch.coinValue !== undefined) {
      draft = syncDriftPricing(draft, this.data.item && this.data.item.book);
    }
    const draftDirty = draftChanged(draft, this.data.draftBaseline);
    const next = { draft, draftDirty };
    if (patch.conditionIssues !== undefined || patch.condition !== undefined) {
      next.conditionIssueOptions = createConditionIssueOptions(draft.conditionIssues || []);
    }
    this.setData(next);
  },

  async refreshBookMetadata(item) {
    if (!needsMetadataRefresh(item.book)) return;
    const isbn = item.book.isbn;
    if (this.refreshingIsbn === isbn) return;
    this.refreshingIsbn = isbn;
    try {
      const book = await api.getBookByIsbn(isbn);
      if (!book || book.lookupStatus === 'manual_needed') return;
      const categoryLabel = this.data.item.bookClassLabel
        || this.data.item.displayCategory
        || this.data.item.book.category;
      const nextItem = {
        ...this.data.item,
        book: {
          ...this.data.item.book,
          ...book,
          category: categoryLabel,
        },
      };
      let draft = syncDriftPricing(this.data.draft, nextItem.book);
      const draftDirty = draftChanged(draft, this.data.draftBaseline);
      this.setData({
        item: nextItem,
        draft,
        draftDirty,
        needsMetaEdit: hasMissingBookMeta(nextItem.book),
        missingMetaHint: missingFieldsSummary(nextItem.book),
      });
    } catch (e) {
      console.warn('[book-detail] metadata refresh skipped', e);
    } finally {
      this.refreshingIsbn = '';
    }
  },

  selectReadingStatus(e) {
    this.updateDraft({ readingStatus: e.currentTarget.dataset.key });
  },

  selectBookClass(e) {
    this.updateDraft({ bookClass: e.currentTarget.dataset.key });
  },

  selectLocation(e) {
    const shelfLocationKey = e.currentTarget.dataset.key;
    const shelfLocationName = e.currentTarget.dataset.label;
    this.updateDraft({
      shelfLocationKey,
      shelfLocationName,
      customLocationName: shelfLocationName,
    });
  },

  onCustomLocation(e) {
    this.updateDraft({ customLocationName: e.detail.value });
  },

  selectCondition(e) {
    this.updateDraft({ condition: e.currentTarget.dataset.key });
  },

  toggleConditionIssue(e) {
    const key = e.currentTarget.dataset.key;
    const conditionIssues = [...(this.data.draft.conditionIssues || [])];
    const index = conditionIssues.indexOf(key);
    if (index >= 0) conditionIssues.splice(index, 1);
    else conditionIssues.push(key);
    this.updateDraft({ conditionIssues });
  },

  decreaseCoinValue() {
    if (this.data.saving) return;
    const coinValue = Math.max((Number(this.data.draft.coinValue) || 0) - 1, 0);
    if (coinValue === this.data.draft.coinValue) return;
    this.updateDraft({ coinValue });
  },

  increaseCoinValue() {
    if (this.data.saving) return;
    const system = Number(this.data.draft.systemCoinValue) || 0;
    const coinValue = Math.min((Number(this.data.draft.coinValue) || 0) + 1, system);
    if (coinValue === this.data.draft.coinValue) return;
    this.updateDraft({ coinValue });
  },

  async confirmShelfChanges() {
    if (!this.data.draftDirty || this.data.saving) return;
    const { draft, item, draftBaseline } = this.data;
    const location = resolveDraftLocation(draft);
    const shelfPayload = {};
    if (draft.readingStatus !== draftBaseline.readingStatus) {
      shelfPayload.readingStatus = draft.readingStatus;
      shelfPayload.category = draft.readingStatus;
    }
    if (draft.bookClass !== draftBaseline.bookClass) {
      shelfPayload.bookClass = draft.bookClass;
    }
    const baseLocation = resolveDraftLocation(draftBaseline);
    if (location.shelfLocationKey !== baseLocation.shelfLocationKey
      || location.shelfLocationName !== baseLocation.shelfLocationName) {
      shelfPayload.shelfLocationKey = location.shelfLocationKey;
      shelfPayload.shelfLocationName = location.shelfLocationName;
    }

    const drift = item.activeDrift;
    const driftPayload = {};
    if (drift && drift.canEdit && draftBaseline.condition !== undefined) {
      if (draft.condition !== draftBaseline.condition) driftPayload.condition = draft.condition;
      if (JSON.stringify(draft.conditionIssues || []) !== JSON.stringify(draftBaseline.conditionIssues || [])) {
        driftPayload.conditionIssues = draft.conditionIssues || [];
      }
      if (draft.coinValue !== draftBaseline.coinValue) driftPayload.coinValue = draft.coinValue;
    }

    this.setData({ saving: true });
    wx.showLoading({ title: '保存中' });
    try {
      let updatedItem = item;
      if (Object.keys(shelfPayload).length) {
        updatedItem = await api.updateShelfBook(this.shelfId, shelfPayload);
      }
      if (Object.keys(driftPayload).length) {
        await api.updateOpenDrift(drift.id, driftPayload);
        await this.loadBook();
      } else if (Object.keys(shelfPayload).length) {
        this.setBookItem(updatedItem);
      }
      wx.showToast({ title: '已保存' });
    } catch (e) {
      wx.showToast({ title: e.message || '保存失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ saving: false });
    }
  },

  async setRating(e) {
    const rating = e.currentTarget.dataset.rating;
    const item = await api.updateShelfBook(this.shelfId, { rating });
    this.setBookItem(item);
  },

  goPublish() {
    const activeDrift = this.data.item && this.data.item.activeDrift;
    if (activeDrift) {
      wx.showToast({ title: activeDrift.statusLabel || '这本书正在漂流中', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: `/pages/drift/publish?shelfBookId=${this.shelfId}&bookId=${this.data.item.bookId}` });
  },

  goEditBookMeta() {
    if (!this.shelfId) return;
    wx.navigateTo({ url: `/pages/book/edit-meta?shelfBookId=${this.shelfId}&from=detail` });
  },

  cancelOpenDrift() {
    const activeDrift = this.data.item && this.data.item.activeDrift;
    if (!activeDrift || !activeDrift.canCancel) return;
    wx.showModal({
      title: '取消漂流',
      content: '取消后这本书会恢复为可发起漂流状态，是否继续？',
      success: async (res) => {
        if (!res.confirm) return;
        await api.cancelOpenDrift(activeDrift.id, '用户取消未接漂记录');
        wx.showToast({ title: '已取消', icon: 'none' });
        this.loadBook();
      },
    });
  },

  removeBook() {
    wx.showModal({
      title: '确认移除',
      content: '确定从书架移除这本书？',
      success: async (res) => {
        if (res.confirm) {
          await api.deleteShelfBook(this.shelfId);
          wx.navigateBack();
        }
      },
    });
  },

  onCoverError,

  onShareAppMessage() {
    const book = this.data.item ? this.data.item.book : {};
    const user = wx.getStorageSync('userInfo') || {};
    return bookShare({
      title: book.title,
      bookId: book.id || this.data.item.bookId,
      inviterId: user.id,
      cover: book.cover,
    });
  },
});
