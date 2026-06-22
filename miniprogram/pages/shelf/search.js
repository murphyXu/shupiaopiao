const api = require('../../utils/api');
const { CATEGORIES, requireLogin } = require('../../utils/util');
const { onCoverError } = require('../../utils/cover');
const { cacheRemoteCovers } = require('../../utils/coverRefresh');

const LOADING_QUOTES = [
  '书卷多情似故人',
  '腹有诗书气自华',
  '读书破万卷，下笔如有神',
  '一日不读书，胸臆无佳想',
];

Page({
  data: {
    keyword: '',
    books: [],
    searched: false,
    loading: false,
    loadingQuote: LOADING_QUOTES[0],
  },

  onLoad() {
    if (!requireLogin('搜索录入需登录')) return;
  },

  onUnload() {
    this.stopQuoteLoop();
  },

  onInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  startQuoteLoop() {
    this.stopQuoteLoop();
    let index = 0;
    this.setData({ loadingQuote: LOADING_QUOTES[index] });
    this.quoteTimer = setInterval(() => {
      index = (index + 1) % LOADING_QUOTES.length;
      this.setData({ loadingQuote: LOADING_QUOTES[index] });
    }, 1600);
  },

  stopQuoteLoop() {
    if (this.quoteTimer) {
      clearInterval(this.quoteTimer);
      this.quoteTimer = null;
    }
  },

  async doSearch() {
    const keyword = this.data.keyword.trim();
    if (!keyword) return;
    this.startQuoteLoop();
    this.setData({ loading: true, searched: false, books: [] });
    try {
      const res = await api.searchBooks(keyword);
      this.setData({ books: res.list, searched: true });
      cacheRemoteCovers(res.list);
    } catch (e) {
      wx.showToast({ title: '搜索失败', icon: 'none' });
      console.error(e);
    } finally {
      this.stopQuoteLoop();
      this.setData({ loading: false });
    }
  },

  selectBook(e) {
    const book = e.currentTarget.dataset.book;
    wx.showActionSheet({
      itemList: CATEGORIES.map((c) => `加入「${c.label}」`),
      success: async (res) => {
        const category = CATEGORIES[res.tapIndex].key;
        try {
          await api.addShelfBook({ bookId: book.id, category });
          wx.showToast({ title: '已加入书架' });
        } catch (err) {
          console.error(err);
        }
      },
    });
  },

  manualAdd() {
    const title = encodeURIComponent(this.data.keyword.trim());
    wx.navigateTo({ url: `/pages/shelf/manual-add?title=${title}` });
  },

  onCoverError,
});
