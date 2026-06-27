const api = require('../../utils/api');
const safeAreaBehavior = require('../../behaviors/safe-area');

const TABS = [
  { key: 'events', label: '行为事件' },
  { key: 'coin', label: '积分流水' },
  { key: 'order', label: '订单事件' },
];

function buildDayOptions(count = 7) {
  const list = [];
  const now = Date.now();
  for (let i = 0; i < count; i += 1) {
    const d = new Date(now - i * 86400000 + 8 * 3600000);
    const day = d.toISOString().slice(0, 10);
    list.push({ day, label: i === 0 ? '今天' : i === 1 ? '昨天' : day.slice(5) });
  }
  return list;
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

Page({
  behaviors: [safeAreaBehavior],
  data: {
    loading: true,
    denied: false,
    tabs: TABS,
    tab: 'events',
    dayOptions: buildDayOptions(),
    dayIndex: 0,
    day: buildDayOptions()[0].day,
    list: [],
    offset: 0,
    hasMore: false,
    loadingMore: false,
  },

  onLoad(options) {
    if (options.tab && TABS.some((t) => t.key === options.tab)) {
      this.setData({ tab: options.tab });
    }
    this.loadList(true);
  },

  onPullDownRefresh() {
    this.loadList(true).finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loadingMore) this.loadList(false);
  },

  switchTab(e) {
    const { key } = e.currentTarget.dataset;
    if (!key || key === this.data.tab) return;
    this.setData({ tab: key });
    this.loadList(true);
  },

  pickDay(e) {
    const index = Number(e.detail.value) || 0;
    const day = this.data.dayOptions[index].day;
    this.setData({ dayIndex: index, day });
    this.loadList(true);
  },

  loadList(reset) {
    const offset = reset ? 0 : this.data.offset;
    if (reset) this.setData({ loading: true, denied: false, list: [] });
    else this.setData({ loadingMore: true });

    const action = this.data.tab === 'events' ? 'admin.events' : 'admin.ledger';
    const payload = { day: this.data.day, limit: 20, offset };
    if (this.data.tab !== 'events') payload.kind = this.data.tab;

    return api.call(action, payload, { showError: false }).then((res) => {
      const rows = (res.list || []).map((row) => this.decorateRow(row));
      this.setData({
        loading: false,
        loadingMore: false,
        list: reset ? rows : this.data.list.concat(rows),
        offset: offset + rows.length,
        hasMore: !!res.hasMore,
      });
    }).catch((err) => {
      const denied = String((err && err.message) || '').includes('无权');
      this.setData({ loading: false, loadingMore: false, denied });
    });
  },

  decorateRow(row) {
    if (this.data.tab === 'events') {
      const props = row.props || {};
      const page = props.page ? ` · ${props.page}` : '';
      return {
        id: row.id,
        title: row.type + page,
        meta: `${formatTime(row.ts)} · ${row.uidHash || 'anon'}${row.success === false ? ' · 失败' : ''}`,
        detail: row.action || (props.scene ? `scene=${props.scene}` : ''),
      };
    }
    if (this.data.tab === 'coin') {
      const sign = Number(row.amount) >= 0 ? '+' : '';
      return {
        id: row.id,
        title: `${sign}${row.amount} · ${row.type || 'coin'}`,
        meta: `${formatTime(row.createdAt)} · ${row.userId || ''}`,
        detail: row.description || row.refId || '',
      };
    }
    return {
      id: row.id,
      title: row.type || 'order_event',
      meta: `${formatTime(row.createdAt)} · ${row.userId || ''}`,
      detail: row.orderId || '',
    };
  },
});
