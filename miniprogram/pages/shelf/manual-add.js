const api = require('../../utils/api');
const {
  CATEGORIES, BOOK_CLASSES, SHELF_LOCATIONS, requireLogin,
} = require('../../utils/util');

function decodeParam(value) {
  try {
    return decodeURIComponent(value || '');
  } catch (e) {
    return value || '';
  }
}

Page({
  data: {
    title: '',
    author: '',
    isbn: '',
    publisher: '',
    pubDate: '',
    listPrice: '',
    category: 'want_read',
    categories: CATEGORIES,
    bookClass: 'other',
    bookClasses: BOOK_CLASSES,
    shelfLocationKey: 'shelf_1',
    shelfLocationName: '默认书架 1',
    shelfLocations: SHELF_LOCATIONS,
    customLocationName: '',
    saving: false,
  },

  onLoad(options = {}) {
    if (!requireLogin('手动添加需登录')) return;
    this.setData({
      title: decodeParam(options.title),
      isbn: decodeParam(options.isbn),
    });
  },

  onTitle(e) { this.setData({ title: e.detail.value }); },
  onAuthor(e) { this.setData({ author: e.detail.value }); },
  onIsbn(e) { this.setData({ isbn: e.detail.value }); },
  onPublisher(e) { this.setData({ publisher: e.detail.value }); },
  onPubDate(e) { this.setData({ pubDate: e.detail.value }); },
  onListPrice(e) { this.setData({ listPrice: e.detail.value }); },

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

  onCustomLocation(e) {
    this.setData({ customLocationName: e.detail.value });
  },

  useCustomLocation() {
    const shelfLocationName = this.data.customLocationName.trim();
    if (!shelfLocationName) return;
    this.setData({
      shelfLocationKey: `custom_${Date.now()}`,
      shelfLocationName,
    });
  },

  async save() {
    const title = this.data.title.trim();
    if (!title) {
      wx.showToast({ title: '请填写书名', icon: 'none' });
      return;
    }
    const author = this.data.author.trim();
    if (!author) {
      wx.showToast({ title: '请填写作者', icon: 'none' });
      return;
    }
    if (this.data.saving) return;
    this.setData({ saving: true });
    try {
      await api.manualAddShelfBook({
        title,
        author,
        isbn: this.data.isbn.trim(),
        publisher: this.data.publisher.trim(),
        pubDate: this.data.pubDate.trim(),
        listPrice: this.data.listPrice.trim(),
        category: this.data.category,
        readingStatus: this.data.category,
        bookClass: this.data.bookClass,
        shelfLocationKey: this.data.shelfLocationKey,
        shelfLocationName: this.data.shelfLocationName,
      });
      wx.showToast({ title: '已加入书架' });
      setTimeout(() => wx.switchTab({ url: '/pages/shelf/index' }), 600);
    } catch (err) {
      console.error(err);
    } finally {
      this.setData({ saving: false });
    }
  },
});
