/**
 * 数据埋点底座
 * - 匿名化：openid 经 SHA256 取前 16 位，不存明文、不碰 PII
 * - 容错：所有写入 try/catch 静默，绝不阻断主业务流程
 * - 复用：与 coin_transactions / credit_logs / drift_order_events 共同构成数据底座
 */
const crypto = require('crypto');

let _db = null;
function database() {
  if (_db) return _db;
  const cloud = require('wx-server-sdk');
  _db = cloud.database();
  return _db;
}

const EVENTS_COLLECTION = 'events';

// 服务端自动埋点的 action 白名单分类（用于 type 归一）
const ACTION_EVENT_MAP = {
  'auth.login': 'login',
  'drift.publish': 'drift_publish',
  'drift.claim': 'drift_claim',
  'drift.ship': 'drift_ship',
  'drift.confirm': 'drift_confirm',
  'drift.cancel': 'drift_cancel',
  'drift.cancelOpen': 'drift_cancel',
  'drift.dispute': 'drift_dispute',
  'shelf.add': 'shelf_add',
  'shelf.manualAdd': 'shelf_add',
  'books.isbn': 'book_lookup',
  'books.search': 'book_search',
  'pool.want': 'drift_want',
};

function hashUid(openid) {
  if (!openid) return 'anon';
  try {
    return crypto.createHash('sha256').update(String(openid)).digest('hex').slice(0, 16);
  } catch (e) {
    return 'anon';
  }
}

function dayOf(date = new Date()) {
  // 以 UTC+8 计算自然日，匹配国内运营口径
  const offsetMs = 8 * 60 * 60 * 1000;
  return new Date(date.getTime() + offsetMs).toISOString().slice(0, 10);
}

function eventTypeForAction(action) {
  return ACTION_EVENT_MAP[action] || 'api_call';
}

/**
 * 写入一条埋点事件（异步、容错、不抛错）
 */
async function logEvent(evt = {}) {
  try {
    const db = database();
    const now = new Date();
    const doc = {
      type: evt.type || 'api_call',
      uidHash: evt.uidHash || hashUid(evt.openid),
      action: evt.action || '',
      props: evt.props || {},
      success: evt.success !== false,
      errorCode: evt.errorCode || 0,
      durationMs: Number(evt.durationMs) || 0,
      platform: evt.platform || '',
      scene: evt.scene || '',
      ts: now.toISOString(),
      day: dayOf(now),
    };
    await db.collection(EVENTS_COLLECTION).add({ data: doc });
  } catch (e) {
    // 埋点失败必须静默，绝不影响主流程
    console.warn('[analytics] logEvent skipped:', e && e.message);
  }
}

/**
 * 服务端路由中间件埋点：根据 API 调用结果自动落库
 */
async function logApiCall({ action, openid, result, durationMs, platform, scene }) {
  const success = !result || result.code === 0;
  await logEvent({
    type: eventTypeForAction(action),
    openid,
    action,
    success,
    errorCode: success ? 0 : (result && result.code) || 500,
    durationMs,
    platform: platform || '',
    scene: scene || '',
  });
}

/**
 * 前端批量上报：一次写入多条事件
 */
async function logBatch(openid, events = [], ctx = {}) {
  const list = Array.isArray(events) ? events.slice(0, 50) : [];
  if (!list.length) return 0;
  let written = 0;
  for (const e of list) {
    await logEvent({
      type: e.type || 'client_event',
      openid,
      action: e.action || '',
      props: e.props || {},
      success: e.success !== false,
      platform: ctx.platform || e.platform || '',
      scene: ctx.scene || e.scene || '',
      durationMs: Number(e.durationMs) || 0,
    });
    written += 1;
  }
  return written;
}

module.exports = {
  EVENTS_COLLECTION,
  hashUid,
  dayOf,
  eventTypeForAction,
  logEvent,
  logApiCall,
  logBatch,
};
