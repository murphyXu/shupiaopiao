const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(__dirname, '..', relativePath));
}

const appJson = JSON.parse(read('miniprogram/app.json'));
const apiIndex = read('cloudfunctions/api/index.js');
const apiUtils = read('miniprogram/utils/api.js');
const apiCollections = read('cloudfunctions/api/lib/collections.js');
const initCollections = read('cloudfunctions/init-db/collections.js');
const seedCollections = read('cloudfunctions/seed/collections.js');
const poolHandler = read('cloudfunctions/api/handlers/pool.js');
const poolIndexJs = read('miniprogram/pages/pool/index.js');
const poolIndexWxml = read('miniprogram/pages/pool/index.wxml');
const poolDetailJs = read('miniprogram/pages/pool/detail.js');
const poolDetailWxml = read('miniprogram/pages/pool/detail.wxml');
const shelfWxml = read('miniprogram/pages/shelf/index.wxml');
const shelfWxss = read('miniprogram/pages/shelf/index.wxss');
const commonWxss = read('miniprogram/styles/common.wxss');

assert.ok(apiCollections.includes("'drift_wants'"), 'api collection list should include drift_wants');
assert.ok(initCollections.includes("'drift_wants'"), 'init-db collection list should include drift_wants');
assert.ok(seedCollections.includes("'drift_wants'"), 'seed collection list should include drift_wants');

assert.ok(apiIndex.includes("'pool.want'") && apiIndex.includes("'pool.wants'"), 'api should expose want toggle and wants list routes');
assert.ok(apiUtils.includes('togglePoolWant') && apiUtils.includes('getPoolWants'), 'frontend api should wrap want toggle and wants list');
assert.ok(poolHandler.includes('async function toggleWant') && poolHandler.includes("db.collection('drift_wants')"), 'pool handler should persist want records');
assert.ok(poolHandler.includes('async function wants') && poolHandler.includes('formatWantedList'), 'pool handler should return current user wanted list');
assert.ok(poolHandler.includes('countWanted') && poolHandler.includes('wantCount: activeWantedCount'), 'pool stats should count current user wanted drift records');
assert.ok(poolHandler.includes('getWantedDriftIds') && poolHandler.includes('wanted:'), 'pool list/detail should expose whether current user wanted each book');

assert.ok(poolIndexWxml.includes('catchtap="goApply"') && poolIndexWxml.includes('apply-action') && poolIndexWxml.includes('申请接漂'), 'pool list card should expose apply-to-claim entry');
assert.ok(!poolIndexWxml.includes("{{item.wanted ? '已想要' : '想要接漂'}}"), 'pool list card should not use want-to-claim copy as the primary entry');
assert.ok(poolIndexJs.includes('goApply') && !poolIndexJs.includes('async toggleWant'), 'pool index card should navigate toward application instead of toggling want state');
assert.ok(poolIndexJs.includes('/pages/pool/wants'), 'want stat should navigate to dedicated wants list page');
assert.ok(appJson.pages.includes('pages/pool/wants'), 'app pages should register pool wants page');
assert.ok(exists('miniprogram/pages/pool/wants.js') && exists('miniprogram/pages/pool/wants.wxml') && exists('miniprogram/pages/pool/wants.wxss') && exists('miniprogram/pages/pool/wants.json'), 'pool wants page files should exist');

const wantsJs = exists('miniprogram/pages/pool/wants.js') ? read('miniprogram/pages/pool/wants.js') : '';
const wantsWxml = exists('miniprogram/pages/pool/wants.wxml') ? read('miniprogram/pages/pool/wants.wxml') : '';
assert.ok(wantsJs.includes('api.getPoolWants') && wantsJs.includes('goDetail'), 'wants page should load current user wants and open detail');
assert.ok(wantsWxml.includes('想要接漂') && wantsWxml.includes('wx:for="{{list}}"'), 'wants page should render wanted books');

assert.ok(poolDetailWxml.includes('want-btn') && poolDetailWxml.includes('bindtap="toggleWant"'), 'pool detail should expose want-to-claim action');
assert.ok(poolDetailJs.includes('toggleWant') && poolDetailJs.includes('api.togglePoolWant'), 'pool detail should toggle want state');

const poolModuleOrder = [
  poolIndexWxml.indexOf('pool-search-box'),
  poolIndexWxml.indexOf('primary-tabs'),
  poolIndexWxml.indexOf('filter-scroll'),
  poolIndexWxml.indexOf('id="pool-list"'),
];
assert.ok(poolModuleOrder.every((position) => position >= 0), 'pool home modules should all exist');
assert.deepStrictEqual(
  poolModuleOrder,
  [...poolModuleOrder].sort((left, right) => left - right),
  'pool home should order search, primary filters, secondary filters, then list',
);
assert.ok(!poolIndexWxml.includes('stat-row') && !poolIndexWxml.includes('stat-card'), 'pool home should not render the top stats row');
assert.ok(shelfWxml.includes('shelf-search') && !shelfWxml.includes('shelf-stat-row'), 'shelf home should keep search without the top stats row');
assert.ok(shelfWxss.includes('.shelf-search') && commonWxss.includes('.stat-card'), 'shelf/common styles should define the shared target layout');

console.log('pool want contract ok');
