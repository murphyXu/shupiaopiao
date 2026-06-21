const api = require('../../utils/api');
const { requireLogin } = require('../../utils/util');
const { onCoverError } = require('../../utils/cover');
const { reloadIfCoversUpdated } = require('../../utils/coverPage');
const { recordBooklistView } = require('../../utils/booklistSignals');

Page({
  data: { list: null, listId: '' },

  onLoad(options) {
    this.setData({ listId: options.id || '' });
    this.loadList();
  },

  onShow() {
    reloadIfCoversUpdated(() => this.loadList());
  },

  loadList() {
    const { listId } = this.data;
    if (!listId) return;
    api.getBooklistDetail(listId).then((list) => {
      if (list) recordBooklistView(list);
      this.setData({ list });
    });
  },

  onCoverError,

  goBook(e) {
    const id = e.currentTarget.dataset.id;
    if (id) wx.navigateTo({ url: `/pages/book/catalog?id=${id}` });
  },

  goList(e) {
    const id = e.currentTarget.dataset.id;
    if (id) wx.navigateTo({ url: `/pages/booklist/detail?id=${id}` });
  },

  stopProp() {},

  async addWant(e) {
    if (!requireLogin('加入想读需登录')) return;
    const bookId = e.currentTarget.dataset.id;
    try {
      await api.addShelfBook({ bookId, category: 'want_read' });
      wx.showToast({ title: '已加入想读' });
    } catch (err) {
      console.error(err);
    }
  },

  findDrift(e) {
    const isbn = e.currentTarget.dataset.isbn;
    wx.switchTab({ url: '/pages/pool/index' });
    wx.setStorageSync('poolSearch', isbn);
  },
});
