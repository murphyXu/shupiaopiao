const { ok, fail } = require('../lib/utils');
const { db, _ } = require('../lib/db');
const { dayStr, dayRange, computeDayMetrics } = require('../lib/metricsAggregator');

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

async function safeCountWhere(collection, where = {}) {
  try {
    const { total } = await db.collection(collection).where(where).count();
    return total || 0;
  } catch (e) {
    return 0;
  }
}

async function lifetimeCoinFlow() {
  const $ = db.command.aggregate;
  let issued = 0;
  let consumed = 0;
  try {
    const res = await db.collection('coin_transactions')
      .aggregate()
      .group({
        _id: $.gt(['$amount', 0]),
        sum: $.sum('$amount'),
      })
      .end();
    (res.list || []).forEach((r) => {
      if (r._id === true) issued += r.sum;
      else consumed += Math.abs(r.sum);
    });
  } catch (e) { /* ignore */ }
  return { issued, consumed };
}

async function realtimeCoinStock() {
  const $ = db.command.aggregate;
  try {
    const res = await db.collection('users')
      .aggregate()
      .group({ _id: null, stock: $.sum('$coinBalance') })
      .end();
    return (res.list && res.list[0] && res.list[0].stock) || 0;
  } catch (e) {
    return 0;
  }
}

const COIN_CONSUME_LABELS = {
  claim_spend: '接漂完成扣款',
  claim: '接漂扣款（旧流水）',
  claim_freeze: '接漂冻结（不计消耗）',
  claim_unfreeze: '取消接漂解冻',
  shelf_capacity_redeem: '兑换书架容量',
  publish_reward_revoke: '取消上漂退奖',
  penalty_offset: '违规待扣抵扣',
  violation_penalty: '违规扣罚',
};

// 仅冻结/解冻，不应计入「消耗」
const COIN_NON_CONSUME_TYPES = new Set(['claim_freeze', 'claim_unfreeze', 'penalty_offset_restore']);

function buildConsumeHint(breakdown, driftDone) {
  const legacyClaim = breakdown.find((r) => r.type === 'claim');
  const claimSpend = breakdown.find((r) => r.type === 'claim_spend');
  if ((legacyClaim && legacyClaim.amount > 0) && driftDone === 0 && !(claimSpend && claimSpend.amount > 0)) {
    return '「接漂扣款（旧流水）」来自历史 type=claim 记录，发生在接漂环节而非确认收货；当前版本接漂只冻结积分（claim_freeze），完成时才 claim_spend 扣款。';
  }
  if (legacyClaim && legacyClaim.amount > 0) {
    return 'type=claim 为旧版接漂扣款流水；type=claim_spend 才是确认收货后的完成扣款。';
  }
  return '';
}

/** 累计消耗按流水 type 拆分（amount < 0，排除纯冻结类） */
async function lifetimeCoinConsumeByType() {
  const $ = db.command.aggregate;
  try {
    const res = await db.collection('coin_transactions')
      .aggregate()
      .match({ amount: _.lt(0) })
      .group({ _id: '$type', total: $.sum('$amount'), count: $.sum(1) })
      .end();
    return (res.list || [])
      .map((r) => {
        const type = r._id || 'unknown';
        return {
          type,
          label: COIN_CONSUME_LABELS[type] || type,
          amount: Math.abs(Number(r.total) || 0),
          count: Number(r.count) || 0,
        };
      })
      .filter((r) => r.amount > 0 && !COIN_NON_CONSUME_TYPES.has(r.type))
      .sort((a, b) => b.amount - a.amount);
  } catch (e) {
    return [];
  }
}

/** 全站累计核心指标（实时查库，非日快照） */
async function fetchCumulativeStats() {
  const [
    totalUsers,
    driftPublished,
    driftOrders,
    driftDone,
    inPool,
    pendingShip,
    shipped,
    disputed,
    flow,
    coinStock,
    consumeBreakdown,
  ] = await Promise.all([
    safeCountWhere('users'),
    safeCountWhere('drifts'),
    safeCountWhere('drift_orders'),
    safeCountWhere('drift_orders', { status: 'DONE' }),
    safeCountWhere('drifts', { status: 'IN_POOL' }),
    safeCountWhere('drift_orders', { status: 'PENDING_SHIP' }),
    safeCountWhere('drift_orders', { status: 'SHIPPED' }),
    safeCountWhere('drift_orders', { status: 'DISPUTED' }),
    lifetimeCoinFlow(),
    realtimeCoinStock(),
    lifetimeCoinConsumeByType(),
  ]);
  const inTransit = pendingShip + shipped + disputed;
  const claimRate = driftPublished ? Number((driftOrders / driftPublished).toFixed(4)) : 0;
  const doneRate = driftOrders ? Number((driftDone / driftOrders).toFixed(4)) : 0;
  const coinConsumeBreakdown = consumeBreakdown;
  const consumeHint = buildConsumeHint(coinConsumeBreakdown, driftDone);
  return {
    totalUsers,
    driftPublished,
    driftOrders,
    driftDone,
    inPool,
    inTransit,
    coinStock,
    coinIssued: flow.issued,
    coinConsumed: flow.consumed,
    coinConsumeBreakdown,
    consumeHint,
    claimRate,
    doneRate,
  };
}

/**
 * 今日实时指标（查库，不入 daily_metrics）
 */
async function todayLive(openid, data = {}) {
  if (!requireAdmin(openid)) return denyInfo(openid);
  const day = dayStr(new Date());
  const metrics = await computeDayMetrics(day, { includeRetention: false });
  return ok({
    day,
    refreshedAt: metrics.generatedAt,
    dau: metrics.dau || 0,
    newUsers: metrics.newUsers || 0,
    driftPublished: metrics.driftPublished || 0,
    driftClaimed: metrics.driftClaimed || 0,
    driftShipped: metrics.driftShipped || 0,
    driftDone: metrics.driftDone || 0,
    driftCancelled: metrics.driftCancelled || 0,
    driftDisputed: metrics.driftDisputed || 0,
    coinIssued: metrics.coinIssued || 0,
    coinConsumed: metrics.coinConsumed || 0,
    errorRate: metrics.errorRate || 0,
    apiCalls: metrics.apiCalls || 0,
  });
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

  const cumulative = await fetchCumulativeStats();

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
    cumulative,
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
    return ok({ conclusions: [{ level: 'info', category: 'growth', text: '数据积累不足（少于 2 天），暂无法生成趋势结论，请持续运营后再看。' }] });
  }
  const last7 = metrics.slice(-7);
  const prev7 = metrics.slice(-14, -7);
  const conclusions = [];

  // 1. 活跃趋势
  const dau7 = avg(last7, 'dau');
  const dauPrev = avg(prev7, 'dau');
  if (dauPrev > 0) {
    const wow = (dau7 - dauPrev) / dauPrev;
    if (wow >= 0.1) conclusions.push({ level: 'good', category: 'growth', text: `近 7 天日活均值 ${dau7.toFixed(0)}，环比上升 ${pct(wow)}，活跃增长健康。` });
    else if (wow <= -0.1) conclusions.push({ level: 'warn', category: 'growth', text: `近 7 天日活均值 ${dau7.toFixed(0)}，环比下降 ${pct(Math.abs(wow))}，需关注活跃流失，建议加强召回与内容更新。` });
    else conclusions.push({ level: 'info', category: 'growth', text: `近 7 天日活均值 ${dau7.toFixed(0)}，环比基本持平。` });
  }

  // 2. 漂流转化（产品命脉）
  const pub = sum(last7, 'driftPublished');
  const claimed = sum(last7, 'driftClaimed');
  const done = sum(last7, 'driftDone');
  if (pub > 0) {
    const p2c = claimed / pub;
    if (p2c >= 0.4) conclusions.push({ level: 'good', category: 'funnel', text: `近 7 天上漂 ${pub} 本，被接率 ${pct(p2c)}，供需匹配良好。` });
    else conclusions.push({ level: 'warn', category: 'funnel', text: `近 7 天上漂 ${pub} 本，被接率仅 ${pct(p2c)}，供给可能过剩或品类不匹配，建议引导热门品类（亲子童书/绘本）上漂并优化漂流广场曝光。` });
    if (claimed > 0) {
      const c2d = done / claimed;
      if (c2d < 0.6) conclusions.push({ level: 'warn', category: 'funnel', text: `接漂→收货完成率 ${pct(c2d)}，履约环节流失偏高，建议排查寄出时效与到付体验。` });
    }
  } else {
    conclusions.push({ level: 'warn', category: 'funnel', text: '近 7 天无上漂记录，漂流供给为 0，冷启动期建议运营账号补充书源、强化首赠 +10 积分引导。' });
  }

  // 3. 积分经济健康度
  const issued = sum(last7, 'coinIssued');
  const consumed = sum(last7, 'coinConsumed');
  const net = issued - consumed;
  if (issued > 0) {
    if (net > 0 && consumed > 0 && net / issued > 0.5) {
      conclusions.push({ level: 'warn', category: 'economy', text: `近 7 天积分发行 ${issued}、消耗 ${consumed}，净流入 ${net}（占发行 ${pct(net / issued)}），存量增长偏快，需警惕冷启动期超发；可按路线图推进阶段二，降低首赠/上漂奖励。` });
    } else if (consumed === 0) {
      conclusions.push({ level: 'info', category: 'economy', text: `近 7 天积分发行 ${issued}、消耗 0，尚无积分被用于换书，建议观察换书转化。` });
    } else {
      conclusions.push({ level: 'good', category: 'economy', text: `近 7 天积分发行 ${issued}、消耗 ${consumed}，发行与消耗较均衡，经济模型运行稳健。` });
    }
  }

  // 4. 留存
  const d1 = avg(last7, 'retentionD1');
  if (d1 > 0) {
    if (d1 < 0.2) conclusions.push({ level: 'warn', category: 'growth', text: `次日留存 ${pct(d1)}，低于健康基准（约 25%+），建议优化新人首日上漂/挑书引导。` });
    else conclusions.push({ level: 'good', category: 'growth', text: `次日留存 ${pct(d1)}，处于健康区间。` });
  }

  // 5. 系统质量
  const err = avg(last7, 'errorRate');
  if (err > 0.02) conclusions.push({ level: 'warn', category: 'quality', text: `近 7 天接口错误率 ${pct(err)}，高于 2% 阈值，建议排查云函数报错日志。` });
  const risk = sum(last7, 'contentRiskHits');
  if (risk > 0) conclusions.push({ level: 'info', category: 'quality', text: `近 7 天内容风控命中 ${risk} 次，请确认拦截策略是否误伤正常文本。` });

  // 6. 寄出时效
  const shipHours = avg(last7, 'avgShipHours');
  if (shipHours > 48) {
    conclusions.push({ level: 'warn', category: 'funnel', text: `近 7 天平均寄出耗时 ${shipHours.toFixed(1)} 小时，超过 48 小时基准，建议提醒赠书方及时寄出或优化寄出引导。` });
  } else if (shipHours > 0 && shipHours <= 24) {
    conclusions.push({ level: 'good', category: 'funnel', text: `近 7 天平均寄出耗时 ${shipHours.toFixed(1)} 小时，履约时效良好。` });
  }

  // 7. 纠纷率
  const disputed7 = sum(last7, 'driftDisputed');
  const disputedPrev = sum(prev7, 'driftDisputed');
  if (claimed > 0) {
    const disputeRate = disputed7 / claimed;
    if (disputeRate > 0.05) {
      conclusions.push({ level: 'warn', category: 'quality', text: `近 7 天纠纷率 ${pct(disputeRate)}（${disputed7}/${claimed}），高于 5% 阈值，建议排查争议原因并优化收货确认流程。` });
    }
  }
  if (disputedPrev > 0 && disputed7 > disputedPrev * 1.5) {
    conclusions.push({ level: 'warn', category: 'quality', text: `近 7 天纠纷 ${disputed7} 起，较前 7 天（${disputedPrev} 起）明显上升，需重点关注履约质量。` });
  }

  if (!conclusions.length) conclusions.push({ level: 'info', category: 'growth', text: '各项指标平稳，暂无突出异常。' });

  return ok({ generatedAt: new Date().toISOString(), conclusions });
}

/**
 * 行为事件明细（按自然日分页）
 */
async function events(openid, data = {}) {
  if (!requireAdmin(openid)) return denyInfo(openid);
  const day = data.day || dayStr(new Date());
  const limit = Math.min(Math.max(Number(data.limit) || 20, 1), 50);
  const offset = Math.max(Number(data.offset) || 0, 0);
  const where = { day };
  if (data.type) where.type = String(data.type);
  if (data.success === false) where.success = false;
  else if (data.success === true) where.success = true;

  try {
    const { data: list } = await db.collection('events')
      .where(where)
      .orderBy('ts', 'desc')
      .skip(offset)
      .limit(limit)
      .get();
    const { total } = await db.collection('events').where(where).count();
    return ok({
      day,
      list: (list || []).map((row) => ({
        id: row._id,
        type: row.type,
        action: row.action || '',
        uidHash: row.uidHash || '',
        props: row.props || {},
        success: row.success !== false,
        errorCode: row.errorCode || 0,
        durationMs: row.durationMs || 0,
        platform: row.platform || '',
        ts: row.ts || '',
      })),
      total: total || 0,
      limit,
      offset,
      hasMore: offset + (list || []).length < (total || 0),
    });
  } catch (e) {
    return ok({ day, list: [], total: 0, limit, offset, hasMore: false });
  }
}

/**
 * 业务流水明细：coin / credit / order
 */
async function ledger(openid, data = {}) {
  if (!requireAdmin(openid)) return denyInfo(openid);
  const kind = ['coin', 'credit', 'order'].includes(data.kind) ? data.kind : 'coin';
  const day = data.day || dayStr(new Date());
  const { startIso, endIso } = dayRange(day);
  const limit = Math.min(Math.max(Number(data.limit) || 20, 1), 50);
  const offset = Math.max(Number(data.offset) || 0, 0);
  const timeWhere = { createdAt: _.gte(startIso).and(_.lt(endIso)) };

  const collectionMap = {
    coin: 'coin_transactions',
    credit: 'credit_logs',
    order: 'drift_order_events',
  };
  const collection = collectionMap[kind];

  try {
    const { data: list } = await db.collection(collection)
      .where(timeWhere)
      .orderBy('createdAt', 'desc')
      .skip(offset)
      .limit(limit)
      .get();
    const { total } = await db.collection(collection).where(timeWhere).count();
    const mapped = (list || []).map((row) => {
      if (kind === 'coin') {
        return {
          id: row._id,
          amount: row.amount,
          type: row.type || '',
          description: row.description || '',
          userId: row.userId ? `${String(row.userId).slice(0, 6)}…` : '',
          refId: row.refId || '',
          createdAt: row.createdAt || '',
        };
      }
      if (kind === 'credit') {
        return {
          id: row._id,
          delta: row.delta,
          reason: row.reason || row.reasonCode || '',
          userId: row.userId ? `${String(row.userId).slice(0, 6)}…` : '',
          refId: row.refId || '',
          createdAt: row.createdAt || '',
        };
      }
      return {
        id: row._id,
        type: row.type || '',
        orderId: row.orderId || '',
        userId: row.userId ? `${String(row.userId).slice(0, 6)}…` : '',
        createdAt: row.createdAt || '',
      };
    });
    return ok({ kind, day, list: mapped, total: total || 0, limit, offset, hasMore: offset + mapped.length < (total || 0) });
  } catch (e) {
    return ok({ kind, day, list: [], total: 0, limit, offset, hasMore: false });
  }
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

module.exports = {
  overview, todayLive, trend, funnel, conclusion, exportMetrics, rebuild, events, ledger, isAdmin, requireAdmin,
};
