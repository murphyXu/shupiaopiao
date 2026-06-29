const api = require('../../utils/api');
const safeAreaBehavior = require('../../behaviors/safe-area');

const TREND_METRICS = [
  { key: 'dau', label: '日活' },
  { key: 'driftPublished', label: '上漂' },
  { key: 'driftDone', label: '完成' },
  { key: 'coinIssued', label: '积分发行' },
  { key: 'coinConsumed', label: '积分消耗' },
];

const TREND_DAYS_OPTIONS = [
  { days: 7, label: '7 天' },
  { days: 14, label: '14 天' },
  { days: 30, label: '30 天' },
];

function pct(v) {
  return `${Math.round((Number(v) || 0) * 100)}%`;
}

function formatRefreshTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

Page({
  behaviors: [safeAreaBehavior],
  data: {
    loading: true,
    denied: false,
    rebuilding: false,
    todayLiveLoading: false,
    todayLive: null,
    overview: null,
    funnel: null,
    conclusions: [],
    trend: null,
    trendMetrics: TREND_METRICS,
    trendMetric: 'dau',
    trendMetricIndex: 0,
    trendDaysOptions: TREND_DAYS_OPTIONS,
    trendDaysIndex: 1,
    trendDays: 14,
  },

  onLoad() {
    this.loadAll();
  },

  onShow() {
    if (!this.data.denied) this.loadTodayLive();
  },

  onPullDownRefresh() {
    Promise.all([this.loadAll(), this.loadTodayLive()])
      .finally(() => wx.stopPullDownRefresh());
  },

  loadTodayLive() {
    this.setData({ todayLiveLoading: true });
    return api.call('admin.todayLive', {}, { showError: false }).then((todayLive) => {
      this.setData({
        todayLiveLoading: false,
        todayLive: this.decorateTodayLive(todayLive),
      });
    }).catch(() => {
      this.setData({ todayLiveLoading: false });
    });
  },

  loadAll() {
    this.setData({ loading: true, denied: false });
    const { trendDays } = this.data;
    return Promise.all([
      api.call('admin.overview', {}, { showError: false }),
      api.call('admin.funnel', { days: 7 }, { showError: false }),
      api.call('admin.conclusion', {}, { showError: false }),
      api.call('admin.trend', { days: trendDays }, { showError: false }),
      api.call('admin.todayLive', {}, { showError: false }),
    ]).then(([overview, funnel, conclusion, trend, todayLive]) => {
      this.setData({
        loading: false,
        overview: this.decorateOverview(overview),
        todayLive: this.decorateTodayLive(todayLive),
        funnel: this.decorateFunnel(funnel),
        conclusions: (conclusion && conclusion.conclusions) || [],
        trend: this.buildTrend(trend, this.data.trendMetric),
      });
    }).catch((err) => {
      const denied = String((err && err.message) || '').includes('无权');
      this.setData({ loading: false, denied });
      if (!denied) wx.showToast({ title: '加载失败，请确认已部署并聚合数据', icon: 'none' });
    });
  },

  loadTrend() {
    const { trendDays, trendMetric } = this.data;
    return api.call('admin.trend', { days: trendDays }, { showError: false }).then((trend) => {
      this.setData({ trend: this.buildTrend(trend, trendMetric) });
    });
  },

  pickTrendMetric(e) {
    const index = Number(e.detail.value) || 0;
    const metric = TREND_METRICS[index].key;
    this.setData({ trendMetricIndex: index, trendMetric: metric });
    this.loadTrend();
  },

  pickTrendDays(e) {
    const index = Number(e.detail.value) || 0;
    const days = TREND_DAYS_OPTIONS[index].days;
    this.setData({ trendDaysIndex: index, trendDays: days });
    this.loadTrend();
  },

  goLogs() {
    wx.navigateTo({ url: '/pages/admin/logs' });
  },

  rebuildMetrics() {
    if (this.data.rebuilding) return;
    wx.showModal({
      title: '重算昨日数据',
      content: '将重新聚合昨日 daily_metrics，通常用于首次上线或修复数据。',
      success: (res) => {
        if (!res.confirm) return;
        this.setData({ rebuilding: true });
        api.call('admin.rebuild', {}, { showError: true }).then(() => {
          wx.showToast({ title: '重算完成', icon: 'success' });
          this.loadAll();
        }).finally(() => this.setData({ rebuilding: false }));
      },
    });
  },

  decorateTodayLive(todayLive) {
    if (!todayLive) return null;
    return {
      ...todayLive,
      refreshedAtText: formatRefreshTime(todayLive.refreshedAt),
      errorRateText: pct(todayLive.errorRate),
    };
  },

  decorateOverview(overview) {
    if (!overview) return null;
    const week = overview.week || {};
    const cumulative = overview.cumulative || {};
    return {
      today: overview.today || {},
      cumulative,
      consumeBreakdown: cumulative.coinConsumeBreakdown || [],
      consumeHint: cumulative.consumeHint || '',
      cumulativeText: {
        claimRate: pct(cumulative.claimRate),
        doneRate: pct(cumulative.doneRate),
      },
      week,
      weekText: {
        dauWoW: pct(week.dauWoW),
        dauWoWUp: (Number(week.dauWoW) || 0) >= 0,
        retentionD1: pct(week.retentionD1),
        errorRate: pct(week.errorRate),
      },
    };
  },

  decorateFunnel(funnel) {
    if (!funnel) return null;
    const stages = funnel.stages || [];
    const max = Math.max(1, ...stages.map((s) => s.value));
    const rates = funnel.rates || {};
    return {
      rangeDays: funnel.rangeDays,
      abnormal: funnel.abnormal || {},
      stages: stages.map((s) => ({
        label: s.label,
        value: s.value,
        width: Math.max(6, Math.round((s.value / max) * 100)),
      })),
      ratesText: {
        publishToClaim: pct(rates.publishToClaim),
        claimToShip: pct(rates.claimToShip),
        shipToDone: pct(rates.shipToDone),
        overall: pct(rates.overall),
      },
    };
  },

  buildTrend(trend, metricKey) {
    if (!trend || !trend.days) return null;
    const series = (trend.series && trend.series[metricKey]) || [];
    const barMax = Math.max(1, ...series);
    const metricLabel = (TREND_METRICS.find((m) => m.key === metricKey) || {}).label || '';
    return {
      metricLabel,
      bars: trend.days.map((day, i) => ({
        day: day.slice(5),
        value: series[i] || 0,
        height: Math.round(((series[i] || 0) / barMax) * 100),
      })),
    };
  },
});
