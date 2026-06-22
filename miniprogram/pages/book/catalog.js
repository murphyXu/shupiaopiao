const api = require('../../utils/api');
const { requireLogin } = require('../../utils/util');
const { onCoverError } = require('../../utils/cover');
const { reloadIfCoversUpdated } = require('../../utils/coverPage');

Page({
  data: { book: null, bookId: '' },

  onLoad(options) {
    if (options.inviterId) {
      const user = wx.getStorageSync('userInfo') || {};
      if (options.inviterId !== user.id) wx.setStorageSync('pendingInviterId', options.inviterId);
    }
    if (!options.id) return;
    this.setData({ bookId: options.id });
    this.loadBook();
  },

  onShow() {
    reloadIfCoversUpdated(() => this.loadBook());
  },

  loadBook() {
    const { bookId } = this.data;
    if (!bookId) return;
    api.getBookDetail(bookId).then((book) => {
      this.setData({ book });
    });
  },

  onCoverError,

  addWant() {
    if (!requireLogin('加入想读需登录')) return;
    api.addShelfBook({ bookId: this.data.book.id, category: 'want_read' }).then(() => {
      wx.showToast({ title: '已加入想读' });
    });
  },

  findDrift() {
    wx.switchTab({ url: '/pages/pool/index' });
    wx.setStorageSync('poolSearch', this.data.book.isbn);
  },
});
