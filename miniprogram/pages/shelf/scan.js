const api = require('../../utils/api');
const {
  CATEGORIES, BOOK_CLASSES, SHELF_LOCATIONS, requireLogin,
} = require('../../utils/util');
const { onCoverError } = require('../../utils/cover');
const { cacheRemoteCover } = require('../../utils/coverRefresh');

function inferBookClass(book = {}) {
  const text = [book.category, book.ageRange, book.title, book.summary].filter(Boolean).join(' ');
  if (/童书|绘本|儿童|亲子|0-3|3-6|6-9|9-12/.test(text)) return 'child';
  if (/经管|商业|管理|创业|金融|理财/.test(text)) return 'business';
  if (/科普|科学|自然|技术|计算机/.test(text)) return 'science';
  if (/社科|社会|历史|心理|哲学|传记/.test(text)) return 'social';
  if (/文学|小说|诗|散文|名著/.test(text)) return 'literature';
  return 'other';
}

Page({
  data: {
    book: null,
    category: 'want_read',
    categories: CATEGORIES,
    bookClass: 'other',
    bookClasses: BOOK_CLASSES,
    shelfLocationKey: 'shelf_1',
    shelfLocationName: '默认书架 1',
    shelfLocations: SHELF_LOCATIONS,
    shelfId: null,
    lookupStatus: 'idle',
    scannedIsbn: '',
    lookupError: '',
    continuousScan: false,
    batchAutoAdd: false,
    batchAddedCount: 0,
    batchMessage: '',
  },

  onLoad(options = {}) {
    if (!requireLogin('扫码录入需登录')) return;
    if (options.isbn) this.lookupIsbn(options.isbn);
  },

  doScan() {
    wx.scanCode({
      scanType: ['barCode'],
      success: async (res) => {
        const isbn = res.result.replace(/[^0-9X]/gi, '');
        this.lookupIsbn(isbn);
      },
    });
  },

  async lookupIsbn(isbn) {
    const clean = String(isbn || '').replace(/[^0-9X]/gi, '');
    this.setData({
      book: null,
      shelfId: null,
      lookupStatus: 'loading',
      scannedIsbn: clean,
      lookupError: '',
      batchMessage: '',
    });
    wx.showLoading({ title: '查询中' });
    try {
      const book = await api.getBookByIsbn(clean, 'scan');
      const inferredBookClass = inferBookClass(book);
      this.setData({ book, bookClass: inferredBookClass, lookupStatus: 'found' });
      cacheRemoteCover(book).then((cover) => {
        if (cover) this.setData({ 'book.cover': cover });
      });
      if (this.data.continuousScan && this.data.batchAutoAdd) {
        await this.addScannedBook({ book, bookClass: inferredBookClass, silent: true });
      }
    } catch (e) {
      const msg = e.message || '未识别该 ISBN，可手动补录';
      this.setData({
        lookupStatus: 'not_found',
        lookupError: msg,
      });
      wx.showToast({ title: msg, icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  selectCategory(e) {
    this.setData({ category: e.currentTarget.dataset.key });
  },

  selectBookClass(e) {
    this.setData({ bookClass: e.currentTarget.dataset.key });
  },

  selectShelfLocation(e) {
    this.setData({
      shelfLocationKey: e.currentTarget.dataset.key,
      shelfLocationName: e.currentTarget.dataset.label,
    });
  },

  toggleContinuousScan() {
    const continuousScan = !this.data.continuousScan;
    this.setData({
      continuousScan,
      batchAutoAdd: continuousScan ? this.data.batchAutoAdd : false,
      batchMessage: continuousScan ? this.data.batchMessage : '',
    });
  },

  async addToShelf() {
    await this.addScannedBook();
  },

  async addScannedBook(options = {}) {
    const book = options.book || this.data.book;
    if (!book) return false;
    try {
      const item = await api.addShelfBook({
        isbn: book.isbn,
        category: this.data.category,
        readingStatus: this.data.category,
        bookClass: options.bookClass || this.data.bookClass,
        shelfLocationKey: this.data.shelfLocationKey,
        shelfLocationName: this.data.shelfLocationName,
      });
      const batchAddedCount = this.data.batchAddedCount + 1;
      this.setData({
        shelfId: item.id,
        batchAutoAdd: this.data.continuousScan ? true : this.data.batchAutoAdd,
        batchAddedCount,
        batchMessage: this.data.continuousScan ? `已自动加入 ${batchAddedCount} 本` : '',
      });
      if (!options.silent) wx.showToast({ title: '已加入书架' });
      if (this.data.continuousScan) {
        setTimeout(() => this.doScan(), options.silent ? 450 : 700);
      }
      return true;
    } catch (e) {
      console.error(e);
      const message = e.message || '';
      if (this.data.continuousScan && /已在书架/.test(message)) {
        this.setData({ batchMessage: '这本已在书架，继续扫下一本' });
        setTimeout(() => this.doScan(), 700);
        return false;
      }
      return false;
    }
  },

  scanNext() {
    this.doScan();
  },

  goPublish() {
    if (!this.data.book) return;
    wx.navigateTo({ url: `/pages/drift/publish?bookId=${this.data.book.id}` });
  },

  manualAdd() {
    const isbn = encodeURIComponent(this.data.scannedIsbn || '');
    wx.navigateTo({ url: `/pages/shelf/manual-add?isbn=${isbn}` });
  },

  onCoverError,
});
