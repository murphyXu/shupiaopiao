const cloud = require('wx-server-sdk');

const auth = require('./handlers/auth');
const books = require('./handlers/books');
const shelf = require('./handlers/shelf');
const pool = require('./handlers/pool');
const drift = require('./handlers/drift');
const pricing = require('./handlers/pricing');
const wallet = require('./handlers/wallet');
const address = require('./handlers/address');
const credit = require('./handlers/credit');
const logistics = require('./handlers/logistics');
const report = require('./handlers/report');
const analytics = require('./handlers/analytics');
const admin = require('./handlers/admin');
const { logApiCall } = require('./lib/analytics');
const { ok, fail } = require('./lib/utils');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const ROUTES = {
  'auth.login': (data, openid) => auth.login(openid, data),
  'user.profile': (_, openid) => auth.profile(openid),
  'user.updateProfile': (data, openid) => auth.updateProfile(openid, data),

  'books.isbn': (data, openid) => books.byIsbn(data, openid),
  'books.search': (data) => books.search(data),
  'books.detail': (data) => books.detail(data),
  'books.updateCover': (data) => books.updateCover(data),
  'books.cacheRemoteCover': (data) => books.cacheRemoteCover(data),
  'books.updateMetadata': (data, openid) => books.updateMetadata(openid, data),

  'shelf.list': (data, openid) => shelf.list(openid, data),
  'shelf.add': (data, openid) => shelf.add(openid, data),
  'shelf.manualAdd': (data, openid) => shelf.manualAdd(openid, data),
  'shelf.update': (data, openid) => shelf.update(openid, data),
  'shelf.delete': (data, openid) => shelf.remove(openid, data),
  'shelf.dashboard': (_, openid) => shelf.dashboard(openid),
  'shelf.redeemCapacity': (data, openid) => shelf.redeemCapacity(openid, data),
  'shelf.public': (data) => shelf.publicList(data),

  'report.create': (data, openid) => report.create(openid, data),

  'pricing.estimate': (data, openid) => pricing.estimate(openid, data),

  'drift.publish': (data, openid) => drift.publish(openid, data),
  'drift.check': (data, openid) => drift.check(openid, data),
  'drift.appeal': (data, openid) => drift.appeal(openid, data),
  'drift.claim': (data, openid) => drift.claim(openid, data),
  'drift.orders': (data, openid) => drift.orders(openid, data),
  'drift.summary': (_, openid) => drift.summary(openid),
  'drift.orderDetail': (data, openid) => drift.orderDetail(openid, data),
  'drift.bundleDetail': (data, openid) => drift.bundleDetail(openid, data),
  'drift.detail': (data, openid) => drift.orderDetail(openid, data),
  'drift.ship': (data, openid) => drift.ship(openid, data),
  'drift.cancel': (data, openid) => drift.cancel(openid, data),
  'drift.cancelOpen': (data, openid) => drift.cancelOpen(openid, data),
  'drift.updateOpen': (data, openid) => drift.updateOpen(openid, data),
  'drift.confirm': (data, openid) => drift.confirm(openid, data),
  'drift.addReceivedBook': (data, openid) => drift.addReceivedBook(openid, data),
  'drift.dispute': (data, openid) => drift.dispute(openid, data),
  'drift.disputes': (data, openid) => drift.listDisputes(openid, data),
  'drift.resolveDispute': (data, openid) => drift.resolveDispute(openid, data),
  'drift.review': (data, openid) => drift.review(openid, data),
  'drift.reportSubscribe': (data, openid) => drift.reportSubscribe(openid, data),
  'drift.subscribeDebug': (data, openid) => drift.debugSubscribe(openid, data),
  'drift.resendSubscribe': (data, openid) => drift.resendSubscribe(openid, data),

  'pool.list': (data, openid) => pool.list(data, openid),
  'pool.stats': (_, openid) => pool.stats(openid),
  'pool.detail': (data, openid) => pool.detail(data, openid),
  'pool.want': (data, openid) => pool.toggleWant(openid, data),
  'pool.wants': (_, openid) => pool.wants(openid),

  'wallet.balance': (_, openid) => wallet.balance(openid),
  'wallet.transactions': (data, openid) => wallet.transactions(openid, data),

  'credit.score': (_, openid) => credit.score(openid),

  'address.list': (_, openid) => address.list(openid),
  'address.add': (data, openid) => address.add(openid, data),
  'address.update': (data, openid) => address.update(openid, data),
  'address.delete': (data, openid) => address.remove(openid, data),

  'logistics.track': (data, openid) => logistics.track(openid, data),

  'analytics.track': (data, openid, ctx) => analytics.track(openid, data, ctx),

  'admin.overview': (data, openid) => admin.overview(openid, data),
  'admin.trend': (data, openid) => admin.trend(openid, data),
  'admin.funnel': (data, openid) => admin.funnel(openid, data),
  'admin.conclusion': (data, openid) => admin.conclusion(openid, data),
  'admin.export': (data, openid) => admin.exportMetrics(openid, data),
  'admin.rebuild': (data, openid) => admin.rebuild(openid, data),
  'admin.events': (data, openid) => admin.events(openid, data),
  'admin.ledger': (data, openid) => admin.ledger(openid, data),

  'health': () => ok({
    service: 'shupiaopiao-cloud',
    version: '1.0.0',
    bundleP1: true,
    subscribeP1: true,
    actions: ['drift.reportSubscribe', 'drift.subscribeDebug', 'drift.resendSubscribe'],
  }),
  'system.initDb': async () => {
    const { ensureCollections } = require('./lib/collections');
    const db = cloud.database();
    const result = await ensureCollections(db);
    return ok(result);
  },
  'system.migrateDriftAccounting': (data, openid) => drift.migrateLegacyAccounting(openid, data),
};

exports.main = async (event) => {
  // 微信每个云函数 config.json 仅支持 1 个定时触发器；合并为 scheduledTasks（每小时 :30 执行）
  if (event.Type === 'Timer' && event.TriggerName === 'scheduledTasks') {
    const maintenance = await drift.maintainDriftOrders();
    const offsetMs = 8 * 60 * 60 * 1000;
    const hour = new Date(Date.now() + offsetMs).getUTCHours();
    if (hour === 0) {
      const { aggregateDaily } = require('./lib/metricsAggregator');
      const metrics = await aggregateDaily();
      return { maintenance, metrics };
    }
    return maintenance;
  }
  // 兼容旧触发器名称（若控制台曾手动创建过）
  if (event.Type === 'Timer' && event.TriggerName === 'driftMaintenance') {
    return drift.maintainDriftOrders();
  }
  if (event.Type === 'Timer' && event.TriggerName === 'dailyMetrics') {
    const { aggregateDaily } = require('./lib/metricsAggregator');
    return aggregateDaily();
  }
  const { action, data = {}, ctx = {} } = event;
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!action) return fail(400, '缺少 action');

  const handler = ROUTES[action];
  if (!handler) return fail(404, `未知 action: ${action}`);

  const startedAt = Date.now();
  let result;
  try {
    result = await handler(data, openid, ctx);
    return result;
  } catch (err) {
    console.error(`[api] ${action}`, err);
    if (err.message === 'INSUFFICIENT_COINS') return (result = fail(400, '可用公益积分不足'));
    if (err.message === 'INFLIGHT_LIMIT') return (result = fail(400, '已有 5 单未收货，请先完成在途漂流'));
    if (err.message === 'ALREADY_CLAIMED') return (result = fail(409, '该书已被其他书友接漂'));
    if (err.message === 'SELF_CLAIM') return (result = fail(400, '不能接漂自己赠送的书'));
    if (err.message === 'ADDRESS_NOT_FOUND') return (result = fail(404, '收货地址不存在'));
    if (err.message === 'ORDER_NOT_FOUND') return (result = fail(404, '漂流记录不存在'));
    if (err.message === 'FORBIDDEN') return (result = fail(403, '无权执行此操作'));
    if (err.message === 'INVALID_STATUS') return (result = fail(409, '当前状态不允许执行此操作'));
    if (err.message === 'SHIP_DEADLINE_EXPIRED') return (result = fail(409, '寄出期限已到，请刷新记录状态'));
    if (err.message === 'DISPUTE_RESTRICTED') return (result = fail(403, '申诉功能暂时受限，请先完成当前漂流记录'));
    if (err.message === 'ACCOUNTING_VERSION_UNSUPPORTED') return (result = fail(409, '旧记录账务待迁移，请联系管理员'));
    if (err.errCode === -501007 || err.errCode === 501007) return (result = fail(400, '数据库参数错误，请稍后重试'));
    if (err.errCode === -604101 || err.errCode === 604101) return (result = fail(500, '内容安全服务未就绪，请稍后重试'));
    if (err.code === 'CONTENT_RISK' || err.code === 'CONTENT_CHECK_FAILED') return (result = fail(400, err.message));
    return (result = fail(500, err.message || '服务器错误'));
  } finally {
    // 埋点中间件：自动记录每次调用，失败静默，绝不阻断主流程
    // analytics.track 自身已落库，避免重复记 api_call
    if (action !== 'analytics.track' && !action.startsWith('admin.')) {
      logApiCall({
        action,
        openid,
        result,
        durationMs: Date.now() - startedAt,
        platform: ctx.platform,
        scene: ctx.scene,
      }).catch(() => {});
    }
  }
};
