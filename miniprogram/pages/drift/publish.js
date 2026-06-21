const api = require('../../utils/api');
const { CONDITIONS, CONDITION_ISSUES } = require('../../utils/util');

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

function pricingState(book) {
  const sourceIsEstimate = book && book.listPriceSource === 'pricing_cache';
  const listPrice = sourceIsEstimate ? 0 : parseListPrice(book && book.listPrice);
  const maxCoinValue = Math.floor(listPrice);
  const defaultCoinValue = listPrice ? Math.min(maxCoinValue, Math.round(listPrice * 0.2)) : '';
  return {
    listPrice,
    maxCoinValue,
    defaultCoinValue,
    coinValue: defaultCoinValue,
    hasListPrice: listPrice > 0,
  };
}

const CONDITION_FACTORS = { new: 1.5, like_new: 1, good: 0.9, seven_new: 0.8, below_seven: 0.8 };

function calculateDisplayValue(book, condition) {
  const price = parseListPrice(book && book.listPrice);
  return Math.max(Math.round(price * (CONDITION_FACTORS[condition] || 0.8) * 0.2), 0);
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
    maxCoinValue: 0,
    defaultCoinValue: '',
    coinValue: '',
    hasListPrice: false,
    isAnonymous: true,
    submitting: false,
  },

  onLoad(options) {
    this.setData({ bookId: options.bookId || '' });
    this.loadBook();
  },

  async loadBook() {
    this.setData({ loadingShelfBooks: true });
    try {
      const shelf = await api.getShelfBooks('all');
      const shelfBooks = shelf.list || [];
      const item = this.data.bookId
        ? shelfBooks.find((b) => b.bookId === this.data.bookId)
        : null;
      this.setData({ shelfBooks });
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
      ...pricingState(book),
      coinValue: calculateDisplayValue(book, this.data.condition),
      isAnonymous: true,
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
      maxCoinValue: 0,
      defaultCoinValue: '',
      coinValue: '',
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
    this.setData({ condition, coinValue: calculateDisplayValue(this.data.book, condition) });
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

  validateCoinValue() {
    if (!this.data.hasListPrice) {
      wx.showToast({ title: '图书定价缺失，暂不能发起漂流', icon: 'none' });
      return false;
    }
    return true;
  },

  async submit() {
    if (this.data.submitting) return;
    if (!this.data.bookId) {
      wx.showToast({ title: '请选择要赠出的书', icon: 'none' });
      return;
    }
    if (!this.validateCoinValue()) return;
    this.setData({ submitting: true });
    try {
      const result = await api.publishDrift({
        shelfBookId: this.data.shelfBookId,
        bookId: this.data.bookId,
        condition: this.data.condition,
        conditionIssues: this.data.conditionIssues,
        isAnonymous: this.data.isAnonymous,
      });
      wx.redirectTo({ url: `/pages/drift/check-result?driftId=${result.driftId}&passed=${result.passed}&status=${result.status || ''}` });
    } catch (e) {
      console.error(e);
    } finally {
      this.setData({ submitting: false });
    }
  },
});
