/**
 * 每日指标聚合器
 * - 读取 events + coin_transactions + credit_logs + drift_order_events + users + drifts
 * - 算出 daily_metrics 单天文档，幂等可重跑
 * - 默认聚合「昨天」(UTC+8)；可传 day 重算指定日；可传 days 批量回填
 */
const cloud = require('wx-server-sdk');

const db = cloud.database();
const _ = db.command;
const $ = db.command.aggregate;

const OFFSET_MS = 8 * 60 * 60 * 1000;

function dayStr(date) {
  return new Date(date.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

// 返回某自然日(UTC+8)的 [startIso, endIso)
function dayRange(day) {
  const start = new Date(`${day}T00:00:00.000+08:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function yesterday() {
  return dayStr(new Date(Date.now() - 24 * 60 * 60 * 1000));
}

async function safeCount(collection, where) {
  try {
    const { total } = await db.collection(collection).where(where).count();
    return total || 0;
  } catch (e) {
    return 0;
  }
}

// 唯一活跃用户数（events.day = day 的 uidHash 去重）
async function countDAU(day) {
  try {
    const res = await db.collection('events')
      .aggregate()
      .match({ day })
      .group({ _id: '$uidHash' })
      .count('dau')
      .end();
    return (res.list && res.list[0] && res.list[0].dau) || 0;
  } catch (e) {
    return 0;
  }
}

// 按 type 统计 events 数量
async function eventTypeCounts(day) {
  try {
    const res = await db.collection('events')
      .aggregate()
      .match({ day })
      .group({ _id: '$type', n: $.sum(1) })
      .end();
    const map = {};
    (res.list || []).forEach((r) => { map[r._id] = r.n; });
    return map;
  } catch (e) {
    return {};
  }
}

// 积分流水按方向汇总（amount>0 发行，<0 消耗）
async function coinFlow(startIso, endIso) {
  let issued = 0;
  let consumed = 0;
  try {
    const res = await db.collection('coin_transactions')
      .aggregate()
      .match({ createdAt: _.gte(startIso).and(_.lt(endIso)) })
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

// 积分存量：所有用户 coinBalance 之和（用聚合，全量）
async function coinStock() {
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

// 漂流漏斗：当日各状态发生量（基于 drift_order_events.type 与 drifts 状态）
async function driftFunnel(day, startIso, endIso) {
  const evtCounts = await (async () => {
    try {
      const res = await db.collection('drift_order_events')
        .aggregate()
        .match({ createdAt: _.gte(startIso).and(_.lt(endIso)) })
        .group({ _id: '$type', n: $.sum(1) })
        .end();
      const map = {};
      (res.list || []).forEach((r) => { map[r._id] = r.n; });
      return map;
    } catch (e) {
      return {};
    }
  })();

  const published = await safeCount('drifts', { createdAt: _.gte(startIso).and(_.lt(endIso)) });
  return {
    published,
    claimed: evtCounts.CLAIM || evtCounts.claim || 0,
    shipped: evtCounts.SHIP || evtCounts.ship || 0,
    done: evtCounts.CONFIRM || evtCounts.confirm || evtCounts.DONE || 0,
    cancelled: evtCounts.CANCEL || evtCounts.cancel || 0,
    disputed: evtCounts.DISPUTE || evtCounts.dispute || 0,
  };
}

// 错误率与平均时延（基于 events）
async function apiHealth(day) {
  try {
    const res = await db.collection('events')
      .aggregate()
      .match({ day })
      .group({
        _id: null,
        total: $.sum(1),
        failed: $.sum($.cond({ if: $.eq(['$success', false]), then: 1, else: 0 })),
        latencySum: $.sum('$durationMs'),
        latencyCnt: $.sum($.cond({ if: $.gt(['$durationMs', 0]), then: 1, else: 0 })),
      })
      .end();
    const row = (res.list && res.list[0]) || {};
    const total = row.total || 0;
    const failed = row.failed || 0;
    const avgLatency = row.latencyCnt ? Math.round(row.latencySum / row.latencyCnt) : 0;
    return {
      errorRate: total ? Number((failed / total).toFixed(4)) : 0,
      avgApiLatency: avgLatency,
      apiCalls: total,
    };
  } catch (e) {
    return { errorRate: 0, avgApiLatency: 0, apiCalls: 0 };
  }
}

// 新增用户（users.createdAt 落在当日）
async function newUsers(startIso, endIso) {
  return safeCount('users', { createdAt: _.gte(startIso).and(_.lt(endIso)) });
}

// 留存：当日新增用户在 day+N 是否有 events
async function retention(baseDay, n) {
  try {
    const { startIso, endIso } = dayRange(baseDay);
    const { data: newbies } = await db.collection('users')
      .where({ createdAt: _.gte(startIso).and(_.lt(endIso)) })
      .field({ openid: true })
      .limit(1000)
      .get();
    if (!newbies.length) return 0;
    const { hashUid } = require('./analytics');
    const hashes = newbies.map((u) => hashUid(u.openid));
    const targetDay = dayStr(new Date(new Date(`${baseDay}T00:00:00.000+08:00`).getTime() + n * 86400000));
    // 分批 in 查询（每批 ≤ 100）
    let active = 0;
    for (let i = 0; i < hashes.length; i += 100) {
      const batch = hashes.slice(i, i + 100);
      const res = await db.collection('events')
        .aggregate()
        .match({ day: targetDay, uidHash: _.in(batch) })
        .group({ _id: '$uidHash' })
        .count('c')
        .end();
      active += (res.list && res.list[0] && res.list[0].c) || 0;
    }
    return Number((active / newbies.length).toFixed(4));
  } catch (e) {
    return 0;
  }
}

/**
 * 聚合单天
 */
async function aggregateOneDay(day) {
  const { startIso, endIso } = dayRange(day);

  const [dau, evtTypes, flow, stock, funnel, health, nu] = await Promise.all([
    countDAU(day),
    eventTypeCounts(day),
    coinFlow(startIso, endIso),
    coinStock(),
    driftFunnel(day, startIso, endIso),
    apiHealth(day),
    newUsers(startIso, endIso),
  ]);

  // 留存只对足够久远的日期算（昨天的 D7 还没到，会是 0，属正常）
  const [retD1, retD7] = await Promise.all([retention(day, 1), retention(day, 7)]);

  const publishToClaimRate = funnel.published ? Number((funnel.claimed / funnel.published).toFixed(4)) : 0;
  const claimToDoneRate = funnel.claimed ? Number((funnel.done / funnel.claimed).toFixed(4)) : 0;

  const doc = {
    day,
    dau,
    newUsers: nu,
    launches: evtTypes.launch || 0,
    pageViews: evtTypes.page_view || 0,
    // 漂流漏斗
    driftPublished: funnel.published,
    driftClaimed: funnel.claimed,
    driftShipped: funnel.shipped,
    driftDone: funnel.done,
    driftCancelled: funnel.cancelled,
    driftDisputed: funnel.disputed,
    publishToClaimRate,
    claimToDoneRate,
    // 积分经济
    coinIssued: flow.issued,
    coinConsumed: flow.consumed,
    coinNetFlow: flow.issued - flow.consumed,
    coinStock: stock,
    // 增长
    inviteShares: evtTypes.invite_share || 0,
    shelfAdds: evtTypes.shelf_add || 0,
    bookLookups: (evtTypes.book_lookup || 0) + (evtTypes.book_search || 0),
    booklistViews: evtTypes.booklist_view || 0,
    // 健康度
    errorRate: health.errorRate,
    avgApiLatency: health.avgApiLatency,
    apiCalls: health.apiCalls,
    contentRiskHits: evtTypes.content_risk_hit || 0,
    // 留存
    retentionD1: retD1,
    retentionD7: retD7,
    generatedAt: new Date().toISOString(),
  };

  await db.collection('daily_metrics').doc(day).set({ data: doc });
  return doc;
}

/**
 * 定时入口：默认聚合昨天；支持 { day } 或 { days: N } 回填
 */
async function aggregateDaily(opts = {}) {
  const results = [];
  if (opts.day) {
    results.push(await aggregateOneDay(opts.day));
  } else if (opts.days && Number(opts.days) > 0) {
    const n = Math.min(Number(opts.days), 90);
    for (let i = 1; i <= n; i += 1) {
      const d = dayStr(new Date(Date.now() - i * 86400000));
      results.push(await aggregateOneDay(d));
    }
  } else {
    results.push(await aggregateOneDay(yesterday()));
  }
  return { ok: true, days: results.map((r) => r.day), count: results.length };
}

module.exports = { aggregateDaily, aggregateOneDay, dayStr, dayRange, yesterday };
