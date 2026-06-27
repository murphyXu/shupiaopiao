const api = require('../../utils/api');
const { missingBookMetaFields, fieldLabel } = require('../../utils/bookMetaEdit');

function displayListPrice(book = {}) {
  const raw = String(book.listPrice || '').trim();
  if (!raw) return '';
  return raw.replace(/^¥\s*/, '');
}

Page({
  data: {
    shelfBookId: '',
    from: '',
    loading: true,
    saving: false,
    title: '',
    author: '',
    isbn: '',
    publisher: '',
    pubDate: '',
    listPrice: '',
    missingFields: [],
    missingHint: '',
  },

  onLoad(options) {
    this.setData({
      shelfBookId: options.shelfBookId || '',
      from: options.from || '',
    });
    this.loadBook();
  },

  async loadBook() {
    const { shelfBookId } = this.data;
    if (!shelfBookId) {
      wx.showToast({ title: '缺少书架记录', icon: 'none' });
      return;
    }
    this.setData({ loading: true });
    try {
      const shelf = await api.getShelfBooks('all');
      const item = (shelf.list || []).find((entry) => entry.id === shelfBookId);
      if (!item || !item.book) {
        wx.showToast({ title: '未找到这本书', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 600);
        return;
      }
      const book = item.book;
      const missingFields = missingBookMetaFields(book);
      this.setData({
        title: book.title || '',
        author: book.author || '',
        isbn: String(book.isbn || '').startsWith('manual-') ? '' : (book.isbn || ''),
        publisher: book.publisher || '',
        pubDate: book.pubDate || '',
        listPrice: displayListPrice(book),
        missingFields,
        missingHint: missingFields.map(fieldLabel).join('、'),
        loading: false,
      });
    } catch (err) {
      console.error(err);
      this.setData({ loading: false });
    }
  },

  onTitle(e) { this.setData({ title: e.detail.value }); },
  onAuthor(e) { this.setData({ author: e.detail.value }); },
  onIsbn(e) { this.setData({ isbn: e.detail.value }); },
  onPublisher(e) { this.setData({ publisher: e.detail.value }); },
  onPubDate(e) { this.setData({ pubDate: e.detail.value }); },
  onListPrice(e) { this.setData({ listPrice: e.detail.value }); },

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
    wx.showLoading({ title: '保存中' });
    try {
      await api.updateBookMetadata(this.data.shelfBookId, {
        title,
        author,
        isbn: this.data.isbn.trim(),
        publisher: this.data.publisher.trim(),
        pubDate: this.data.pubDate.trim(),
        listPrice: this.data.listPrice.trim(),
      });
      wx.showToast({ title: '已保存' });
      setTimeout(() => wx.navigateBack(), 500);
    } catch (err) {
      console.error(err);
    } finally {
      wx.hideLoading();
      this.setData({ saving: false });
    }
  },
});
