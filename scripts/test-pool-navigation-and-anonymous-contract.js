const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const poolJs = read('miniprogram/pages/pool/index.js');
const poolWxml = read('miniprogram/pages/pool/index.wxml');
const poolWxss = read('miniprogram/pages/pool/index.wxss');
const utilJs = read('miniprogram/utils/util.js');
const apiIndex = read('cloudfunctions/api/index.js');
const pricingJs = read('cloudfunctions/api/lib/pricing.js');
const publishJs = read('miniprogram/pages/drift/publish.js');
const publishWxml = read('miniprogram/pages/drift/publish.wxml');
const driftHandler = read('cloudfunctions/api/handlers/drift.js');
const poolHandler = read('cloudfunctions/api/handlers/pool.js');
const givenJs = read('miniprogram/pages/drift/given.js');
const givenWxml = read('miniprogram/pages/drift/given.wxml');
const givenWxss = read('miniprogram/pages/drift/given.wxss');
const receivedWxml = read('miniprogram/pages/drift/received.wxml');

assert.ok(poolWxml.includes('bindtap="goStatTarget"') && poolJs.includes('goStatTarget'), 'pool stats should be clickable and route to related list pages');
assert.ok(poolJs.includes('/pages/drift/given') && poolJs.includes('/pages/drift/received'), 'pool stats should navigate to given and received list pages');
assert.ok(poolJs.includes('/pages/pool/wants'), 'want-to-claim stat should navigate to wanted books page');
assert.ok(poolWxml.includes('hover-class="pool-stat-card-hover"') && poolWxss.includes('.pool-stat-card-hover'), 'pool stats should expose visible tap feedback');
assert.ok(apiIndex.includes("'pool.list': (data, openid) => pool.list(data, openid)"), 'pool list route should pass openid for user-specific wanted state');
assert.ok(poolHandler.includes("db.collection('drift_wants')") && poolHandler.includes('countWanted'), 'pool stats should count current-user wanted items, not the global pool count');
assert.ok(poolHandler.includes('wantCount: 0') && !poolHandler.includes('const { total: wantCount }'), 'anonymous or unknown users should not receive a global want count');
assert.ok(poolJs.includes("requireLogin('登录后可查看想要接漂的书')") && poolJs.includes('/pages/pool/wants'), 'want stat click should require login and open current-user wanted list');

assert.ok(
  poolWxml.includes('class="pool-search-box"')
    && !poolWxml.includes('shelf-search')
    && poolWxss.includes('.pool-search-box'),
  'pool search box should use its dedicated aligned layout',
);

assert.ok(poolJs.includes('filterModes') && poolJs.includes('按品类') && poolJs.includes('按价值') && poolJs.includes('按品相'), 'pool should define first-level filter modes');
assert.ok(poolJs.includes('valueTabs') && poolJs.includes('conditionTabs'), 'pool should define value and condition secondary filters');
assert.ok(poolWxml.includes('primary-tabs') && poolWxml.includes('secondaryTabs'), 'pool should render two-level filters');
assert.ok(poolJs.includes('filterList') && poolJs.includes('activeValue') && poolJs.includes('activeCondition'), 'pool should filter list by active value or condition');
assert.ok(utilJs.includes("{ key: 'good', label: '8成新' }") && !utilJs.includes("{ key: 'good', label: '八成新' }"), 'pool condition filter should label good condition as 8成新');
assert.ok(pricingJs.includes("good: '8成新'") && !pricingJs.includes("good: '八成新'"), 'pool item condition labels should use 8成新');

assert.ok(publishJs.includes('isAnonymous') && publishJs.includes('toggleAnonymous'), 'publish page should support anonymous drift toggle');
assert.ok(publishWxml.includes('匿名漂流') && publishWxml.includes('toggleAnonymous'), 'publish page should render anonymous drift option');
assert.ok(driftHandler.includes('isAnonymous') && driftHandler.includes('匿名书友'), 'drift publish/order formatting should persist and mask anonymous giver');
assert.ok(poolHandler.includes('isAnonymous') && poolHandler.includes('匿名书友'), 'pool list/detail should mask anonymous giver nickname');
assert.ok(receivedWxml.includes('giverNickname'), 'received records should display masked giver nickname from backend');

assert.ok(givenJs.includes('pendingShipCount') && givenJs.includes('progressText'), 'given page should calculate pending shipment reminders and progress');
assert.ok(givenWxml.includes('reminder-card') && givenWxml.includes('progressText'), 'given page should show claim reminder and drift progress');
assert.ok(givenWxss.includes('.reminder-card') && givenWxss.includes('.progress-box'), 'given reminder and progress should have dedicated styles');

console.log('pool navigation and anonymous contract ok');
