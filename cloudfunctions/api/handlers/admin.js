const { ok, fail } = require('../lib/utils');
const { db } = require('../lib/db');

function adminOpenids() {
  return String(process.env.ADMIN_OPENIDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function isAdmin(openid) {
  return adminOpenids().includes(openid);
}

// openid 为空：来自云开发控制台「云端测试」或定时器等后台环境，
// 能进入这些环境本身即最高权限，放行运维/查询操作；
// 真机普通用户调用一定携带 openid，仍严格走白名单。
function requireAdmin(openid) {
  if (!openid) return true;
  return isAdmin(openid);
}

// 鉴权失败时返回的诊断信息（脱敏），帮助定位白名单未命中原因
function denyInfo(openid) {
  const list = adminOpenids();
  const mask = (id) => (id ? `${id.slice(0, 6)}…${id.slice(-4)}（长度${id.length}）` : '(空)');
  return fail(403, '无权访问', {
    reason: 'openid 未命中 ADMIN_OPENIDS 白名单',
    callerOpenid: mask(openid),
    whitelistConfigured: list.length > 0,
    whitelistCount: list.length,
    whitelistPreview: list.map(mask),
    hint: '若 callerOpenid 与你配置的不一致，请用诊断里的 openid 重新配置环境变量并重新上传云函数；空 openid 应已自动放行。',
  });
}

// 拉取最近 N 天 daily_metrics（按 day 升序）
async function recentMetrics(days = 30) {
  const n = Math.min(Math.max(Number(days) || 30, 1), 90);
  try {
    const { data } = await db.collection('daily_metrics')
      .orderBy('day', 'desc')
      .limit(n)
      .get();
    return (data || []).sort((a, b) => (a.day < b.day ? -1 : 1));
  } catch (e) {
    return [];
  }
}

function sum(list, key) {
  return list.reduce((acc, row) => acc + (Number(row[key]) || 0), 0);
}

function avg(list, key) {
  if (!list.length) return 0;
  return Number((sum(list, key) / list.length).toFixed(4));
}

/**
 * 核心概览卡：取最近一天 + 近 7 天汇总 + 环比
 */
async function overview(openid, data = {}) {
  if (!requireAdmin(openid)) return denyInfo(openid);
  const metrics = await recentMetrics(14);
  const last = metrics[metrics.length - 1] || {};
  const last7 = metrics.slice(-7);
  const prev7 = metrics.slice(-14, -7);

  // 累计用户 / 累计完成漂流（实时算）
  let totalUsers = 0;
  let totalDriftDone = 0;
  try {
    const u = await db.collection('users').count();
    totalUsers = u.total || 0;
  } catch (e) { /* ignore */ }
  try {
    const d = await db.collection('drift_orders').where({ status: 'DONE' }).count();
    totalDriftDone = d.total || 0;
  } catch (e) { /* ignore */ }

  const dau7 = avg(last7, 'dau');
  const dauPrev7 = avg(prev7, 'dau');

  return ok({
    today: {
      day: last.day || '',
      dau: last.dau || 0,
      newUsers: last.newUsers || 0,
      driftPublished: last.driftPublished || 0,
      driftDone: last.driftDone || 0,
      coinStock: last.coinStock || 0,
    },
    week: {
      dauAvg: dau7,
      dauWoW: dauPrev7 ? Number((((dau7 - dauPrev7) / dauPrev7)).toFixed(4)) : 0,
      newUsers: sum(last7, 'newUsers'),
      driftPublished: sum(last7, 'driftPublished'),
      driftDone: sum(last7, 'driftDone'),
      coinIssued: sum(last7, 'coinIssued'),
      coinConsumed: sum(last7, 'coinConsumed'),
      retentionD1: avg(last7, 'retentionD1'),
      errorRate: avg(last7, 'errorRate'),
    },
    cumulative: { totalUsers, totalDriftDone },
  });
}

/**
 * 趋势序列：返回最近 N 天各指标数组，供折线图
 */
async function trend(openid, data = {}) {
  if (!requireAdmin(openid)) return denyInfo(openid);
  const metrics = await recentMetrics(data.days || 30);
  return ok({
    days: metrics.map((m) => m.day),
    series: {
      dau: metrics.map((m) => m.dau || 0),
      newUsers: metrics.map((m) => m.newUsers || 0),
      driftPublished: metrics.map((m) => m.driftPublished || 0),
      driftDone: metrics.map((m) => m.driftDone || 0),
      coinIssued: metrics.map((m) => m.coinIssued || 0),
      coinConsumed: metrics.map((m) => m.coinConsumed || 0),
      coinStock: metrics.map((m) => m.coinStock || 0),
      errorRate: metrics.map((m) => m.errorRate || 0),
      retentionD1: metrics.map((m) => m.retentionD1 || 0),
    },
  });
}

/**
 * 漂流漏斗：近 N 天累计各环节，算转化率
 */
async function funnel(openid, data = {}) {
  if (!requireAdmin(openid)) return denyInfo(openid);
  const metrics = await recentMetrics(data.days || 7);
  const published = sum(metrics, 'driftPublished');
  const claimed = sum(metrics, 'driftClaimed');
  const shipped = sum(metrics, 'driftShipped');
  const done = sum(metrics, 'driftDone');
  const cancelled = sum(metrics, 'driftCancelled');
  const disputed = sum(metrics, 'driftDisputed');
  return ok({
    rangeDays: metrics.length,
    stages: [
      { key: 'published', label: '发布上漂', value: published },
      { key: 'claimed', label: '被接漂', value: claimed },
      { key: 'shipped', label: '已寄出', value: shipped },
      { key: 'done', label: '收货完成', value: done },
    ],
    rates: {
      publishToClaim: published ? Number((claimed / published).toFixed(4)) : 0,
      claimToShip: claimed ? Number((shipped / claimed).toFixed(4)) : 0,
      shipToDone: shipped ? Number((done / shipped).toFixed(4)) : 0,
      overall: published ? Number((done / published).toFixed(4)) : 0,
    },
    abnormal: { cancelled, disputed },
  });
}

function pct(v) {
  return `${Math.round((Number(v) || 0) * 100)}%`;
}

/**
 * 自动分析结论：基于规则引擎生成中文结论
 */
async function conclusion(openid, data = {}) {
  if (!requireAdmin(openid)) return denyInfo(openid);
  const metrics = await recentMetrics(14);
  if (metrics.length < 2) {
    return ok({ conclusions: [{ level: 'info', text: '数据积累不足（少于 2 天），暂无法生成趋势结论，请持续运营后再看。' }] });
  }
  const last7 = metrics.slice(-7);
  const prev7 = metrics.slice(-14, -7);
  const conclusions = [];

  // 1. 活跃趋势
  const dau7 = avg(last7, 'dau');
  const dauPrev = avg(prev7, 'dau');
  if (dauPrev > 0) {
    const wow = (dau7 - dauPrev) / dauPrev;
    if (wow >= 0.1) conclusions.push({ level: 'good', text: `近 7 天日活均值 ${dau7.toFixed(0)}，环比上升 ${pct(wow)}，活跃增长健康。` });
    else if (wow <= -0.1) conclusions.push({ level: 'warn', text: `近 7 天日活均值 ${dau7.toFixed(0)}，环比下降 ${pct(Math.abs(wow))}，需关注活跃流失，建议加强召回与内容更新。` });
    else conclusions.push({ level: 'info', text: `近 7 天日活均值 ${dau7.toFixed(0)}，环比基本持平。` });
  }

  // 2. 漂流转化（产品命脉）
  const pub = sum(last7, 'driftPublished');
  const claimed = sum(last7, 'driftClaimed');
  const done = sum(last7, 'driftDone');
  if (pub > 0) {
    const p2c = claimed / pub;
    if (p2c >= 0.4) conclusions.push({ level: 'good', text: `近 7 天上漂 ${pub} 本，被接率 ${pct(p2c)}，供需匹配良好。` });
    else conclusions.push({ level: 'warn', text: `近 7 天上漂 ${pub} 本，被接率仅 ${pct(p2c)}，供给可能过剩或品类不匹配，建议引导热门品类（亲子童书/绘本）上漂并优化漂流广场曝光。` });
    if (claimed > 0) {
      const c2d = done / claimed;
      if (c2d < 0.6) conclusions.push({ level: 'warn', text: `接漂→收货完成率 ${pct(c2d)}，履约环节流失偏高，建议排查寄出时效与到付体验。` });
    }
  } else {
    conclusions.push({ level: 'warn', text: '近 7 天无上漂记录，漂流供给为 0，冷启动期建议运营账号补充书源、强化首赠 +10 积分引导。' });
  }

  // 3. 积分经济健康度
  const issued = sum(last7, 'coinIssued');
  const consumed = sum(last7, 'coinConsumed');
  const net = issued - consumed;
  if (issued > 0) {
    if (net > 0 && consumed > 0 && net / issued > 0.5) {
      conclusions.push({ level: 'warn', text: `近 7 天积分发行 ${issued}、消耗 ${consumed}，净流入 ${net}（占发行 ${pct(net / issued)}），存量增长偏快，需警惕冷启动期超发；可按路线图推进阶段二，降低首赠/上漂奖励。` });
    } else if (consumed === 0) {
      conclusions.push({ level: 'info', text: `近 7 天积分发行 ${issued}、消耗 0，尚无积分被用于换书，建议观察换书转化。` });
    } else {
      conclusions.push({ level: 'good', text: `近 7 天积分发行 ${issued}、消耗 ${consumed}，发行与消耗较均衡，经济模型运行稳健。` });
    }
  }

  // 4. 留存
  const d1 = avg(last7, 'retentionD1');
  if (d1 > 0) {
    if (d1 < 0.2) conclusions.push({ level: 'warn', text: `次日留存 ${pct(d1)}，低于健康基准（约 25%+），建议优化新人首日上漂/挑书引导。` });
    else conclusions.push({ level: 'good', text: `次日留存 ${pct(d1)}，处于健康区间。` });
  }

  // 5. 系统质量
  const err = avg(last7, 'errorRate');
  if (err > 0.02) conclusions.push({ level: 'warn', text: `近 7 天接口错误率 ${pct(err)}，高于 2% 阈值，建议排查云函数报错日志。` });
  const risk = sum(last7, 'contentRiskHits');
  if (risk > 0) conclusions.push({ level: 'info', text: `近 7 天内容风控命中 ${risk} 次，请确认拦截策略是否误伤正常文本。` });

  if (!conclusions.length) conclusions.push({ level: 'info', text: '各项指标平稳，暂无突出异常。' });

  return ok({ generatedAt: new Date().toISOString(), conclusions });
}

/**
 * 导出最近 N 天 daily_metrics 原始数据（供 HTML 看板渲染）
 */
async function exportMetrics(openid, data = {}) {
  if (!requireAdmin(openid)) return denyInfo(openid);
  const metrics = await recentMetrics(data.days || 30);
  return ok({ metrics });
}

/**
 * 手动重算指定日 / 回填 N 天（运维用）
 */
async function rebuild(openid, data = {}) {
  if (!requireAdmin(openid)) return denyInfo(openid);
  const { aggregateDaily } = require('../lib/metricsAggregator');
  const result = await aggregateDaily({ day: data.day, days: data.days });
  return ok(result);
}

module.exports = { overview, trend, funnel, conclusion, exportMetrics, rebuild, isAdmin };
