const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

const driftPolicy = read('cloudfunctions/api/lib/driftPolicy.js');
const driftHandler = read('cloudfunctions/api/handlers/drift.js');
const shipmentBundle = read('cloudfunctions/api/lib/shipmentBundle.js');
const apiIndex = read('cloudfunctions/api/index.js');
const apiConfig = read('cloudfunctions/api/config.json');
const givenJs = read('miniprogram/pages/drift/given.js');
const givenWxml = read('miniprogram/pages/drift/given.wxml');
const receivedJs = read('miniprogram/pages/drift/received.js');
const receivedWxml = read('miniprogram/pages/drift/received.wxml');
const orderDetailJs = read('miniprogram/pages/drift/order-detail.js');
const orderDetailWxml = read('miniprogram/pages/drift/order-detail.wxml');
const shippingJs = read('miniprogram/utils/shipping.js');
const miniPolicy = read('miniprogram/utils/driftPolicy.js');
const guideWxml = read('miniprogram/pages/drift/guide.wxml');

assert.ok(driftPolicy.includes('SHIP_DEADLINE_HOURS = 72') && driftPolicy.includes('AUTO_COMPLETE_DAYS = 10'), 'drift policy should define ship and auto-complete windows');
assert.ok(driftPolicy.includes('shipDeadlineAt') && driftPolicy.includes('autoCompleteAt'), 'drift policy should expose deadline helpers');
assert.ok(driftHandler.includes('shipDeadlineAt(now)') && driftHandler.includes('autoCompleteAt(now)'), 'claim and ship should stamp fulfillment deadlines');
assert.ok(driftHandler.includes("cancelOrderById(order._id, { system: true }, 'SHIP_TIMEOUT')"), 'maintenance should auto-cancel overdue pending shipments');
assert.ok(driftHandler.includes("await settleOrder(order._id, 'AUTO')"), 'maintenance should auto-complete overdue shipped orders');
assert.ok(driftHandler.includes('partitionPendingShipMaintenance') && driftHandler.includes('enforceDuePendingShipRow'), 'maintenance should scan pending ship in memory and enforce on read');
assert.ok(driftHandler.includes('PENDING_SHIP_SCAN_LIMIT') && !driftHandler.includes('shipDeadlineAt: _.lte(now)'), 'maintenance should not rely solely on shipDeadlineAt compound query');
assert.ok(driftHandler.includes('resolveShipDeadline(row)'), 'formatted orders should expose canonical ship deadline');
assert.ok(apiIndex.includes("'system.maintainDriftOrders'"), 'system route should allow manual drift maintenance');
assert.ok(shipmentBundle.includes('autoCompleteAt(now)'), 'bundle ship should stamp auto-complete deadline');
assert.ok(apiIndex.includes('maintainDriftOrders') && apiConfig.includes('scheduledTasks'), 'api timer should run drift maintenance');
assert.ok(miniPolicy.includes('SHIP_DEADLINE_HOURS = 72') && miniPolicy.includes('AUTO_COMPLETE_DAYS = 10'), 'frontend policy mirror should stay aligned');
assert.ok(shippingJs.includes('formatAutoCompleteRemaining') && shippingJs.includes('formatDeadlineClock'), 'frontend should format fulfillment deadlines');
assert.ok(givenJs.includes('formatShipDeadlineRemaining') && givenJs.includes('超时将自动取消'), 'given list should warn about ship timeout');
assert.ok(givenWxml.includes('shipDeadlineLabel') && givenWxml.includes('自动取消'), 'given reminder should mention auto cancel');
assert.ok(receivedJs.includes('formatAutoCompleteRemaining') && receivedWxml.includes('deadlineHint'), 'received list should show auto-complete countdown');
assert.ok(orderDetailJs.includes('formatAutoCompleteRemaining') && orderDetailWxml.includes('deadlineHint'), 'order detail should explain fulfillment deadlines');
assert.ok(guideWxml.includes('72 小时内发货') && guideWxml.includes('10 天内确认收货'), 'guide should document fulfillment time limits');

console.log('drift deadline contract ok');
