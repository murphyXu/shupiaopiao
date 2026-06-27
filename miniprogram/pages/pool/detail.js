const api = require('../../utils/api');
const { requireLogin } = require('../../utils/util');
const { onCoverError } = require('../../utils/cover');
const { trackPageView } = require('../../utils/track');
const { driftShare } = require('../../utils/share');

const SUMMARY_FOLD_THRESHOLD = 96;

function buildSummaryView(summary = '') {
  const text = String(summary || '').trim();
  return {
    summaryText: text || '暂无简介',
    summaryNeedsFold: text.length > SUMMARY_FOLD_THRESHOLD,
    summaryExpanded: false,
  };
}

Page({
  data: { item: null, summaryText: '', summaryNeedsFold: false, summaryExpanded: false },

  onLoad(options) {
    this.driftId = options.id;
    this.loadDetail();
  },

  loadDetail() {
    return api.getPoolDetail(this.driftId).then((item) => {
      const book = item.book || {};
      this.setData({ item, ...buildSummaryView(book.summary) });
      trackPageView('pool/detail', {
        driftId: this.driftId,
        bookId: item.bookId,
        category: item.category,
        author: item.book && item.book.author,
      });
    });
  },

  goClaim() {
    if (!this.data.item || !this.data.item.canClaim) {
      wx.showToast({ title: '不能接漂自己赠送的书', icon: 'none' });
      return;
    }
    if (!requireLogin('申请接漂需登录，以便管理漂流记录与公益积分')) return;
    wx.navigateTo({ url: `/pages/drift/claim?driftId=${this.driftId}` });
  },

  goSameGiverItem(e) {
    const { id } = e.currentTarget.dataset;
    if (!id || id === this.driftId) return;
    wx.navigateTo({ url: `/pages/pool/detail?id=${id}` });
  },

  async toggleWant() {
    if (this.data.item && this.data.item.isMine) {
      wx.showToast({ title: '不能想要接漂自己赠送的书', icon: 'none' });
      return;
    }
    if (!requireLogin('登录后可标记想要接漂')) return;
    try {
      const result = await api.togglePoolWant(this.driftId);
      this.setData({ 'item.wanted': result.wanted });
      wx.showToast({ title: result.wanted ? '已加入想要接漂' : '已取消想要', icon: 'none' });
    } catch (err) {
      console.error(err);
    }
  },

  reportItem() {
    if (!requireLogin('登录后可提交举报')) return;
    wx.showModal({
      title: '举报内容',
      editable: true,
      placeholderText: '请说明问题',
      success: async (res) => {
        if (!res.confirm) return;
        const reason = String(res.content || '').trim();
        if (!reason) {
          wx.showToast({ title: '请填写举报原因', icon: 'none' });
          return;
        }
        await api.createReport({ targetType: 'drift', targetId: this.driftId, reason });
        wx.showToast({ title: '举报已提交', icon: 'none' });
      },
    });
  },

  onCoverError,

  toggleSummary() {
    this.setData({ summaryExpanded: !this.data.summaryExpanded });
  },

  onShareAppMessage() {
    const item = this.data.item || {};
    const book = item.book || {};
    const user = wx.getStorageSync('userInfo') || {};
    return driftShare({
      title: book.title,
      driftId: this.driftId || item.id,
      inviterId: user.id,
      cover: book.cover,
    });
  },
});
