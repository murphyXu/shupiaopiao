const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

// stub wx-server-sdk，使云函数 lib 可在本地 require（与线上行为无关，仅供契约测试）
const originalResolve = Module._resolveFilename;
const fakeCloud = {
  DYNAMIC_CURRENT_ENV: 'test',
  init() {},
  database() {
    const noop = () => chain;
    const chain = {
      collection: () => chain, where: () => chain, doc: () => chain,
      orderBy: () => chain, limit: () => chain, skip: () => chain, field: () => chain,
      get: async () => ({ data: [] }), count: async () => ({ total: 0 }),
      add: async () => ({}), set: async () => ({}), update: async () => ({}),
      aggregate: () => chain, match: () => chain, group: () => chain, end: async () => ({ list: [] }),
    };
    chain.command = { inc: noop, in: noop, gte: () => ({ and: noop }), lt: noop, neq: noop, eq: noop };
    chain.command.aggregate = { sum: noop, gt: noop, cond: noop, eq: noop };
    return { ...chain, command: chain.command };
  },
  getWXContext: () => ({ OPENID: 'test' }),
};
require.cache[require.resolve ? '__wx_stub__' : '__wx_stub__'] = undefined;
Module._resolveFilename = function (request, ...args) {
  if (request === 'wx-server-sdk') return '__wx_stub__';
  return originalResolve.call(this, request, ...args);
};
require.cache['__wx_stub__'] = { id: '__wx_stub__', filename: '__wx_stub__', loaded: true, exports: fakeCloud };

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

// ---- 1. 集合定义包含 events / daily_metrics ----
const collections = read('cloudfunctions/api/lib/collections.js');
const initDbCollections = read('cloudfunctions/init-db/collections.js');
assert.ok(collections.includes("'events'"), 'collections should include events');
assert.ok(collections.includes("'daily_metrics'"), 'collections should include daily_metrics');
assert.ok(initDbCollections.includes("'events'"), 'init-db collections should include events');
assert.ok(initDbCollections.includes("'daily_metrics'"), 'init-db collections should include daily_metrics');

// ---- 2. 路由注册 analytics / admin ----
const indexJs = read('cloudfunctions/api/index.js');
assert.ok(indexJs.includes("'analytics.track'"), 'route analytics.track registered');
assert.ok(indexJs.includes("'admin.overview'"), 'route admin.overview registered');
assert.ok(indexJs.includes("'admin.conclusion'"), 'route admin.conclusion registered');
assert.ok(indexJs.includes("'admin.events'"), 'route admin.events registered');
assert.ok(indexJs.includes("'admin.ledger'"), 'route admin.ledger registered');
assert.ok(indexJs.includes('logApiCall'), 'router should wire埋点中间件');
assert.ok(indexJs.includes("TriggerName === 'scheduledTasks'"), 'scheduledTasks timer branch present');
// 中间件必须在 finally 且容错，不可影响主流程
assert.ok(indexJs.includes('finally') && indexJs.includes('.catch(() => {})'), '埋点必须容错不阻断主流程');
assert.ok(indexJs.includes("action !== 'analytics.track'"), '避免对埋点上报自身重复埋点');

// ---- 3. 定时器配置 ----
const config = JSON.parse(read('cloudfunctions/api/config.json'));
const hasScheduled = (config.triggers || []).some((t) => t.name === 'scheduledTasks' && t.type === 'timer');
assert.ok(hasScheduled, 'config.json should declare single scheduledTasks timer');
assert.strictEqual((config.triggers || []).length, 1, 'WeChat allows only one timer trigger per cloud function');

// ---- 4. analytics 纯函数逻辑 ----
const analytics = require('../cloudfunctions/api/lib/analytics');
// 匿名化：相同 openid 稳定、不同则不同、不泄露明文
const h1 = analytics.hashUid('openid-AAA');
const h2 = analytics.hashUid('openid-AAA');
const h3 = analytics.hashUid('openid-BBB');
assert.strictEqual(h1, h2, 'hashUid should be deterministic');
assert.notStrictEqual(h1, h3, 'different openid -> different hash');
assert.ok(!h1.includes('openid'), 'hash must not leak raw openid');
assert.strictEqual(h1.length, 16, 'hash truncated to 16 chars');
assert.strictEqual(analytics.hashUid(''), 'anon', 'empty openid -> anon');
// 自然日格式
assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(analytics.dayOf(new Date('2026-06-22T03:00:00Z'))), 'dayOf returns YYYY-MM-DD');
// action -> type 映射
assert.strictEqual(analytics.eventTypeForAction('drift.publish'), 'drift_publish');
assert.strictEqual(analytics.eventTypeForAction('shelf.add'), 'shelf_add');
assert.strictEqual(analytics.eventTypeForAction('unknown.x'), 'api_call');
assert.strictEqual(analytics.eventTypeForAction('pricing.estimate'), 'pricing_estimate');
assert.strictEqual(analytics.eventTypeForAction('shelf.redeemCapacity'), 'capacity_redeem');

const metricsAggregator = require('../cloudfunctions/api/lib/metricsAggregator');
assert.ok(typeof metricsAggregator.purgeOldEvents === 'function', 'purgeOldEvents exported');
assert.ok(metricsAggregator.aggregateOneDay.toString().includes('avgShipHours'), 'aggregate includes avgShipHours');
// ---- 5. admin 鉴权逻辑（隔离 isAdmin 不依赖 db）----
process.env.ADMIN_OPENIDS = 'oABC123, oDEF456';
const admin = require('../cloudfunctions/api/handlers/admin');
assert.strictEqual(admin.isAdmin('oABC123'), true, 'whitelisted openid is admin');
assert.strictEqual(admin.isAdmin('oDEF456'), true, 'trimmed whitelist entry is admin');
assert.strictEqual(admin.isAdmin('oXXX'), false, 'non-whitelisted openid denied');
assert.strictEqual(admin.isAdmin(''), false, 'empty openid denied');

// ---- 6. 前端埋点封装存在且核心页接入 ----
const track = read('miniprogram/utils/track.js');
assert.ok(track.includes('analytics.track') && track.includes('flush'), 'track util batches and flushes');
assert.ok(track.includes('showError: false'), 'track must not disturb user on failure');
['pool', 'shelf', 'mine'].forEach((p) => {
  const js = read(`miniprogram/pages/${p}/index.js`);
  assert.ok(js.includes("require('../../utils/track')"), `${p} page imports track`);
  assert.ok(js.includes('trackPageView'), `${p} page emits page_view`);
});
[
  'miniprogram/pages/drift/publish.js',
  'miniprogram/pages/drift/claim.js',
  'miniprogram/pages/drift/ship.js',
  'miniprogram/pages/pool/detail.js',
  'miniprogram/pages/shelf/scan.js',
  'miniprogram/pages/auth/login.js',
].forEach((file) => {
  const js = read(file);
  assert.ok(js.includes('trackPageView') || js.includes("require('../../utils/track')"), `${file} should import track`);
});
const appJs = read('miniprogram/app.js');
assert.ok(appJs.includes("track.track('launch'") && appJs.includes('onHide'), 'app埋 launch 并在 onHide flush');
assert.ok(read('miniprogram/pages/mine/index.js').includes("track('invite_share'"), 'mine share emits invite_share');
assert.ok(read('miniprogram/pages/mine/index.wxml').includes('数据看板'), 'mine admin menu includes dashboard link');
assert.ok(read('miniprogram/pages/mine/index.js').includes("url: '/pages/admin/dashboard'"), 'mine goDashboard routes to admin dashboard');

// ---- 7. admin 看板页已注册 ----
const appJson = JSON.parse(read('miniprogram/app.json'));
assert.ok(appJson.pages.includes('pages/admin/dashboard'), 'admin dashboard page registered');
assert.ok(appJson.pages.includes('pages/admin/logs'), 'admin logs page registered');

const adminJs = read('cloudfunctions/api/handlers/admin.js');
assert.ok(adminJs.includes('async function events'), 'admin.events handler present');
assert.ok(adminJs.includes('async function ledger'), 'admin.ledger handler present');
assert.ok(adminJs.includes('fetchCumulativeStats'), 'cumulative stats helper present');
assert.ok(adminJs.includes('driftPublished'), 'cumulative includes driftPublished');
assert.ok(adminJs.includes('coinConsumeBreakdown'), 'cumulative includes consume breakdown');
assert.ok(adminJs.includes('lifetimeCoinConsumeByType'), 'consume breakdown aggregator present');
assert.ok(adminJs.includes('接漂扣款（旧流水）'), 'consume label for legacy claim type');
assert.ok(adminJs.includes('buildConsumeHint'), 'consume hint helper present');
assert.ok(adminJs.includes('avgShipHours'), 'conclusion references avgShipHours');
assert.ok(adminJs.includes('纠纷率'), 'conclusion includes dispute rate rule');

const dashboardWxml = read('miniprogram/pages/admin/dashboard.wxml');
assert.ok(dashboardWxml.includes('累计概览'), 'dashboard shows cumulative section');
assert.ok(dashboardWxml.includes('消耗构成'), 'dashboard shows consume breakdown');
const logsPage = read('miniprogram/pages/admin/logs.js');
assert.ok(logsPage.includes('admin.events') && logsPage.includes('admin.ledger'), 'logs page calls admin APIs');

console.log('analytics & admin contract ok');
