const api = require('../../utils/api');
const safeAreaBehavior = require('../../behaviors/safe-area');

function pct(v) {
  return `${Math.round((Number(v) || 0) * 100)}%`;
}

Page({
  behaviors: [safeAreaBehavior],
  data: {
    loading: true,
    denied: false,
    overview: null,
    funnel: null,
    conclusions: [],
    trend: null,
  },

  onLoad() {
    this.loadAll();
  },

  onPullDownRefresh() {
    this.loadAll().finally(() => wx.stopPullDownRefresh());
  },

  loadAll() {
    this.setData({ loading: true, denied: false });
    return Promise.all([
      api.call('admin.overview', {}, { showError: false }),
      api.call('admin.funnel', { days: 7 }, { showError: false }),
      api.call('admin.conclusion', {}, { showError: false }),
      api.call('admin.trend', { days: 14 }, { showError: false }),
    ]).then(([overview, funnel, conclusion, trend]) => {
      const dauSeries = (trend && trend.series && trend.series.dau) || [];
      const barMax = Math.max(1, ...dauSeries);
      this.setData({
        loading: false,
        overview: this.decorateOverview(overview),
        funnel: this.decorateFunnel(funnel),
        conclusions: (conclusion && conclusion.conclusions) || [],
        trend: this.buildTrend(trend, barMax),
      });
    }).catch((err) => {
      const denied = String((err && err.message) || '').includes('无权');
      this.setData({ loading: false, denied });
      if (!denied) wx.showToast({ title: '加载失败，请确认已部署并聚合数据', icon: 'none' });
    });
  },

  decorateOverview(overview) {
    if (!overview) return null;
    const week = overview.week || {};
    return {
      today: overview.today || {},
      cumulative: overview.cumulative || {},
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

  buildTrend(trend, barMax) {
    if (!trend || !trend.days) return null;
    const dau = (trend.series && trend.series.dau) || [];
    return {
      bars: trend.days.map((day, i) => ({
        day: day.slice(5),
        value: dau[i] || 0,
        height: Math.round(((dau[i] || 0) / barMax) * 100),
      })),
    };
  },
});
