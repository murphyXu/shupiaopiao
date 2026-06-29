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
const poolDetailWxml = read('miniprogram/pages/pool/detail.wxml');

assert.ok(!poolWxml.includes('bindtap="goStatTarget"'), 'pool home should not expose stat-row navigation');
assert.ok(!poolWxml.includes('pool-user-metrics'), 'pool home should not render personal drift stat metrics');
assert.ok(!poolJs.includes('goStatTarget'), 'pool home should not keep stat-row navigation handler');
assert.ok(poolDetailWxml.includes('想要接漂') || poolDetailJs.includes('/pages/pool/wants'), 'wanted drift entry should stay on detail or wants page');

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
assert.ok(
  poolDetailWxml.includes('wx:elif="{{item.isAnonymous}}"') && poolDetailWxml.includes('/assets/brand/logo.png'),
  'pool detail should use brand logo only for anonymous giver avatar placeholder',
);
assert.ok(receivedWxml.includes('giverNickname'), 'received records should display masked giver nickname from backend');

assert.ok(givenJs.includes('pendingShipCount') && givenJs.includes('progressText'), 'given page should calculate pending shipment reminders and progress');
assert.ok(givenWxml.includes('reminder-card') && givenWxml.includes('progressText'), 'given page should show claim reminder and drift progress');
assert.ok(givenWxss.includes('.reminder-card') && givenWxss.includes('.progress-box'), 'given reminder and progress should have dedicated styles');

console.log('pool navigation and anonymous contract ok');
