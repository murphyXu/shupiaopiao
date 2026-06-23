const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

function readOptional(file) {
  const fullPath = path.join(__dirname, '..', file);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
}

const dbLib = read('cloudfunctions/api/lib/db.js');
const wallet = read('cloudfunctions/api/handlers/wallet.js');
const shelf = read('cloudfunctions/api/handlers/shelf.js');
const drift = read('cloudfunctions/api/handlers/drift.js');
const routes = read('cloudfunctions/api/index.js');
const appJson = read('miniprogram/app.json');
const walletWxml = read('miniprogram/pages/mine/wallet.wxml');
const givenJs = read('miniprogram/pages/drift/given.js');
const claimWxml = read('miniprogram/pages/drift/claim.wxml');
const collections = [
  read('cloudfunctions/api/lib/collections.js'),
  read('cloudfunctions/init-db/collections.js'),
  read('cloudfunctions/seed/collections.js'),
];

assert.ok(dbLib.includes('coinFrozen: 0') && dbLib.includes('SIGNUP_BONUS = 0'), 'users should have dual point fields');
assert.ok(dbLib.includes('INVITE_REWARD = 2'), 'invite reward should be two');
assert.ok(wallet.includes('available') && wallet.includes('frozen'), 'wallet should expose available and frozen');
assert.ok(walletWxml.includes('可用公益积分') && walletWxml.includes('占用中'), 'wallet should display occupied points');
assert.ok(shelf.includes('availableCoin(user)'), 'shelf redemption should use available points');
collections.forEach((source) => assert.ok(source.includes("'drift_disputes'") && source.includes("'drift_order_events'"), 'collections missing'));

const migration = readOptional('cloudfunctions/api/lib/driftMigration.js');
assert.ok(migration.includes('ensureAccountingV2') && migration.includes('legacy_accounting_migration'), 'legacy migration guard missing');
assert.ok(routes.includes("'system.migrateDriftAccounting'"), 'migration route missing');

assert.ok(drift.includes('shelfBookId') && drift.includes('calculateCoinValue'), 'publish must use exact shelf record and system pricing');
assert.ok(drift.includes('runTransaction') && drift.includes('coinFrozen') && drift.includes('shipDeadlineAt'), 'claim must lock and freeze');
assert.ok(claimWxml.includes('可用公益积分') && claimWxml.includes('占用'), 'claim occupation copy missing');
assert.ok(drift.includes('policy().inflightLimit') && drift.includes('INFLIGHT_LIMIT'), 'claim should enforce current in-flight limit');
assert.ok(routes.includes('已有 2 单未收货，请先完成在途漂流') && claimWxml.includes('同时未收货最多 2 单'), 'claim limit copy should explain the two-order in-flight cap');

assert.ok(routes.includes("'drift.orderDetail'") && routes.includes("'drift.cancel'"), 'fulfillment routes missing');
assert.ok(appJson.includes('pages/drift/order-detail') && appJson.includes('pages/drift/ship'), 'fulfillment pages missing');
assert.ok(!givenJs.includes('showActionSheet') && givenJs.includes('/pages/drift/ship?orderId='), 'ship must use dedicated page');
const shipWxml = readOptional('miniprogram/pages/drift/ship.wxml');
assert.ok(shipWxml.includes('<picker') && shipWxml.includes('运单号') && shipWxml.includes('到付'), 'ship page should use a picker and explicit COD copy');
assert.ok(shipWxml.includes('收件信息') && shipWxml.includes('去寄快递'), 'ship page should expose address and express jump actions');
assert.ok(drift.includes('claim_unfreeze') && drift.includes('settleOrder'), 'cancel or settlement missing');
assert.ok(drift.includes('function normalizeOrderRecord') && drift.includes('normalizeOrderRecord(orderSnap.data, orderId)'), 'doc lookup should hydrate order id before cancel updates');
assert.ok(drift.includes('resolveOrderCoinValue') && drift.includes('buildRevokePublishRewardEffects'), 'cancel should resolve coin value and merge giver reward rollback');
assert.ok(drift.includes('maintainDriftOrders') && drift.includes('autoCompleteAt'), 'maintenance missing');

assert.ok(routes.includes("'drift.dispute'") && routes.includes("'drift.resolveDispute'"), 'dispute routes missing');
assert.ok(drift.includes('DISPUTE_RESTRICTED') && drift.includes('user.disputeRestricted'), 'restricted dispute users should be blocked by backend');
assert.ok(drift.includes('!user.disputeRestricted') && drift.includes('canDispute'), 'restricted dispute users should not see dispute action');
assert.ok(drift.includes("normalizedOrder.status !== 'DONE'") && drift.includes('`${normalizedOrder._id}-${user._id}`'), 'one review per participant missing');

console.log('drift fulfillment contract ok');
