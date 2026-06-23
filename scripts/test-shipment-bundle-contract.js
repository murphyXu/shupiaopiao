const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

const bundleLib = read('cloudfunctions/api/lib/shipmentBundle.js');
const driftPolicy = read('cloudfunctions/api/lib/driftPolicy.js');
const driftHandler = read('cloudfunctions/api/handlers/drift.js');
const poolHandler = read('cloudfunctions/api/handlers/pool.js');
const routes = read('cloudfunctions/api/index.js');
const collections = [
  read('cloudfunctions/api/lib/collections.js'),
  read('cloudfunctions/init-db/collections.js'),
  read('cloudfunctions/seed/collections.js'),
];
const givenJs = read('miniprogram/pages/drift/given.js');
const givenWxml = read('miniprogram/pages/drift/given.wxml');
const shipJs = read('miniprogram/pages/drift/ship.js');
const shipWxml = read('miniprogram/pages/drift/ship.wxml');
const claimWxml = read('miniprogram/pages/drift/claim.wxml');
const claimJs = read('miniprogram/pages/drift/claim.js');
const receivedWxml = read('miniprogram/pages/drift/received.wxml');
const orderDetailWxml = read('miniprogram/pages/drift/order-detail.wxml');
const poolDetailWxml = read('miniprogram/pages/pool/detail.wxml');
const apiUtils = read('miniprogram/utils/api.js');

assert.ok(bundleLib.includes('attachOrderToBundle') && bundleLib.includes('removeOrderFromBundle'), 'bundle core helpers missing');
assert.ok(bundleLib.includes('openBundleDocId') && !bundleLib.includes('transaction.collection(\'shipment_bundles\').where'), 'bundle attach should use deterministic doc lookup, not transaction where');
assert.ok(bundleLib.includes('computeAddressKey') && bundleLib.includes('shipBundlePendingOrders'), 'bundle ship helpers missing');
assert.ok(driftPolicy.includes('inflightLimit: 5') && driftPolicy.includes('BUNDLE_MAX_ORDERS = 5'), 'drift policy bundle constants missing');
assert.ok(driftPolicy.includes('isLightweightBook'), 'lightweight helper missing');
collections.forEach((source) => assert.ok(source.includes("'shipment_bundles'"), 'shipment_bundles collection missing'));

assert.ok(bundleLib.includes('loadBundleAttachPlan') && bundleLib.includes('applyBundleAttachPlan'), 'bundle attach should split read and write phases');
assert.ok(read('cloudfunctions/api/lib/db.js').includes('throwOnNotFound: false'), 'db should tolerate missing docs in transactions');
assert.ok(driftHandler.includes('loadBundleAttachPlan') && driftHandler.includes('applyBundleAttachPlan'), 'claim should read bundle plan before writes');
assert.ok(driftHandler.includes('async function bundleDetail') && driftHandler.includes('removeOrderFromBundle'), 'bundle detail and cancel detach missing');
assert.ok(driftHandler.includes('bundleId') && driftHandler.includes('shipBundlePendingOrders'), 'ship should support bundle batching');
assert.ok(driftHandler.includes('siblings:') && driftHandler.includes('bundleSeq'), 'order detail should expose bundle siblings');
assert.ok(poolHandler.includes('sameGiverPool') && poolHandler.includes('lightweightHint'), 'pool detail should expose bundle hints');
assert.ok(routes.includes("'drift.bundleDetail'") && routes.includes('已有 5 单未收货，请先完成在途漂流'), 'routes should expose bundle detail and 5-order limit');
assert.ok(routes.includes('bundleP1: true'), 'health route should expose bundle deployment marker');

assert.ok(givenJs.includes('buildDisplayItems') && givenJs.includes('bundleId'), 'given page should group bundles');
assert.ok(givenWxml.includes('合并 {{item.orderCount}} 本') && givenWxml.includes('data-bundle-id'), 'given list should show bundle cards');
assert.ok(shipJs.includes('getBundleDetail') && shipJs.includes('shipBundle') && shipJs.includes('options.bundleId'), 'ship page should support bundleId');
assert.ok(shipWxml.includes('合并寄出') && shipWxml.includes('<button class="btn-primary submit-btn"'), 'ship page should use button submit for bundles');
assert.ok(claimWxml.includes('同时未收货最多 5 单') && claimWxml.includes('轻量'), 'claim page should show 5-order cap and lightweight badge');
assert.ok(claimJs.includes('已与上一本合并寄出') && claimJs.includes('result.merged'), 'claim page should toast merge success');
assert.ok(receivedWxml.includes('bundleBadge') && receivedWxml.includes('bundle-badge'), 'received list should show bundle badge');
assert.ok(orderDetailWxml.includes('同包裹其他图书') && orderDetailWxml.includes('detail.bundle.siblings'), 'order detail should list siblings');
assert.ok(poolDetailWxml.includes('sameGiverPool') && poolDetailWxml.includes('same-giver-card'), 'pool detail should show same-giver hint');
assert.ok(apiUtils.includes('getBundleDetail') && apiUtils.includes('shipBundle'), 'api utils should wrap bundle actions');

const {
  computeAddressKey,
  openBundleDocId,
  pickMergeCandidate,
} = require('../cloudfunctions/api/lib/shipmentBundle');
const keyA = computeAddressKey({ name: '张三', phone: '13800000000', region: '广东省 深圳市 南山区', detail: '科技园' });
const keyB = computeAddressKey({ name: ' 张三 ', phone: '13800000000', region: '广东省 深圳市 南山区', detail: '科技园' });
assert.strictEqual(keyA, keyB, 'address key should be stable after trim');
assert.strictEqual(
  openBundleDocId('giver1', 'receiver1', keyA),
  openBundleDocId('giver1', 'receiver1', keyB),
  'open bundle doc id should be stable',
);
const now = '2026-06-23T12:00:00.000Z';
assert.ok(pickMergeCandidate([{ status: 'OPEN', orderIds: ['o1'], updatedAt: now }], now), 'recent open bundle should merge');
assert.ok(!pickMergeCandidate([{ status: 'OPEN', orderIds: ['o1', 'o2', 'o3', 'o4', 'o5'], updatedAt: now }], now), 'full bundle should not merge');

console.log('shipment bundle contract ok');
