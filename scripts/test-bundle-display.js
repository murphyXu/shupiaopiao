const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  bundleBadgeLabel,
  activeBundleOrderCount,
  buildOrderDetailBundle,
} = require('../cloudfunctions/api/lib/bundleDisplay');

const driftHandler = fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/handlers/drift.js'), 'utf8');
const poolHandler = fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/handlers/pool.js'), 'utf8');
const receivedJs = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/drift/received.js'), 'utf8');

assert.strictEqual(activeBundleOrderCount({ status: 'OPEN', orderIds: ['a', 'b', 'c'] }), 3);
assert.strictEqual(activeBundleOrderCount({ status: 'DISSOLVED', orderIds: [] }), 0);

assert.strictEqual(
  bundleBadgeLabel({ status: 'PENDING_SHIP', bundleId: 'b1' }, { status: 'OPEN', orderIds: ['a', 'b'] }),
  '同包裹 · 2 本',
);
assert.strictEqual(
  bundleBadgeLabel({ status: 'CANCELLED', bundleId: 'b1' }, { status: 'DISSOLVED', orderIds: [] }),
  '',
);
assert.strictEqual(
  bundleBadgeLabel({ status: 'PENDING_SHIP', bundleId: 'b1' }, { status: 'OPEN', orderIds: ['a'] }),
  '',
);

const detailBundle = buildOrderDetailBundle(
  { _id: 'a', status: 'PENDING_SHIP', bundleId: 'b1' },
  { _id: 'b1', status: 'OPEN', orderIds: ['a', 'b'] },
  [{ id: 'b', status: 'PENDING_SHIP', bundleSeq: 2 }],
);
assert.ok(detailBundle && detailBundle.orderCount === 2, 'order detail should expose active bundle count');
assert.strictEqual(
  buildOrderDetailBundle(
    { _id: 'a', status: 'CANCELLED', bundleId: 'b1' },
    { _id: 'b1', status: 'DISSOLVED', orderIds: [] },
    [],
  ),
  null,
);

assert.ok(driftHandler.includes('enrichOrderList') && driftHandler.includes('buildOrderDetailBundle'), 'drift handler should use bundle display helpers');
assert.ok(poolHandler.includes('尚未与你同包裹'), 'pool detail should clarify same-giver books are not bundled yet');
assert.ok(!receivedJs.includes('function withBundleBadge'), 'received page should rely on server bundleBadge');

console.log('bundle display ok');
