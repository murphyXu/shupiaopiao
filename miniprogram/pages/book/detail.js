const api = require('../../utils/api');
const {
  CATEGORIES, BOOK_CLASSES, SHELF_LOCATIONS, findLabel,
} = require('../../utils/util');
const { onCoverError } = require('../../utils/cover');

function isGenericCategory(category) {
  return !category || ['图书', '童书', '其他', '未分类'].includes(String(category).trim());
}

function needsMetadataRefresh(book = {}) {
  return !!book.isbn && (!book.listPrice || isGenericCategory(book.category));
}

Page({
  data: {
    item: null,
    categories: CATEGORIES,
    bookClasses: BOOK_CLASSES,
    shelfLocations: SHELF_LOCATIONS,
    stars: [1, 2, 3, 4, 5],
    customLocationName: '',
  },

  onLoad(options) {
    this.shelfId = options.id;
  },

  onShow() {
    this.loadBook();
  },

  async loadBook() {
    const shelf = await api.getShelfBooks('all');
    const item = shelf.list.find((entry) => entry.id === this.shelfId);
    if (item) this.setBookItem(item);
  },

  setBookItem(item) {
    const nextItem = {
      ...item,
      readingStatusLabel: item.readingStatusLabel || findLabel(CATEGORIES, item.readingStatus, '想读'),
      bookClassLabel: item.bookClassLabel || findLabel(BOOK_CLASSES, item.bookClass, '其他'),
    };
    nextItem.displayCategory = item.displayCategory || item.sourceCategory || (item.book || {}).category || nextItem.bookClassLabel;
    nextItem.book = {
      ...(item.book || {}),
      category: nextItem.displayCategory,
    };
    this.setData({
      item: nextItem,
      customLocationName: item.shelfLocationName || '',
    });
    this.refreshBookMetadata(nextItem);
  },

  async refreshBookMetadata(item) {
    if (!needsMetadataRefresh(item.book)) return;
    const isbn = item.book.isbn;
    if (this.refreshingIsbn === isbn) return;
    this.refreshingIsbn = isbn;
    try {
      const book = await api.getBookByIsbn(isbn);
      if (!book || book.lookupStatus === 'manual_needed') return;
      this.setData({
        item: {
          ...this.data.item,
          sourceCategory: book.category || this.data.item.sourceCategory,
          displayCategory: book.category || this.data.item.displayCategory,
          book: {
            ...book,
            category: book.category || this.data.item.displayCategory,
          },
        },
      });
    } catch (e) {
      console.warn('[book-detail] metadata refresh skipped', e);
    } finally {
      this.refreshingIsbn = '';
    }
  },

  async changeReadingStatus(e) {
    const readingStatus = e.currentTarget.dataset.key;
    const item = await api.updateShelfBook(this.shelfId, { readingStatus, category: readingStatus });
    this.setBookItem(item);
  },

  async changeBookClass(e) {
    const bookClass = e.currentTarget.dataset.key;
    const item = await api.updateShelfBook(this.shelfId, { bookClass });
    this.setBookItem(item);
  },

  async changeLocation(e) {
    const shelfLocationKey = e.currentTarget.dataset.key;
    const shelfLocationName = e.currentTarget.dataset.label;
    const item = await api.updateShelfBook(this.shelfId, { shelfLocationKey, shelfLocationName });
    this.setBookItem(item);
  },

  onCustomLocation(e) {
    this.setData({ customLocationName: e.detail.value });
  },

  async saveCustomLocation() {
    const shelfLocationName = this.data.customLocationName.trim();
    if (!shelfLocationName) return;
    const item = await api.updateShelfBook(this.shelfId, {
      shelfLocationKey: `custom_${Date.now()}`,
      shelfLocationName,
    });
    this.setBookItem(item);
    wx.showToast({ title: '位置已保存' });
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
    wx.navigateTo({ url: `/pages/drift/publish?bookId=${this.data.item.bookId}` });
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
    return {
      title: `我书架上的《${book.title || '一本书'}》`,
      path: `/pages/book/catalog?id=${book.id || this.data.item.bookId}&inviterId=${user.id || ''}`,
    };
  },
});
