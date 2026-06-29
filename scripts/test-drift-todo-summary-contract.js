const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

const driftJs = read('cloudfunctions/api/handlers/drift.js');
const indexJs = read('cloudfunctions/api/index.js');
const mineJs = read('miniprogram/pages/mine/index.js');
const apiJs = read('miniprogram/utils/api.js');
const pendingShipJs = read('miniprogram/utils/pendingShip.js');

assert.ok(driftJs.includes('async function summary('), 'drift handler should expose todo summary endpoint');
assert.ok(fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/lib/driftTodoSummary.js'), 'utf8').includes('buildDriftTodoSummary'), 'drift todo summary should live in dedicated lib');
assert.ok(driftJs.includes('summary') && indexJs.includes("'drift.summary'"), 'api router should register drift.summary');
assert.ok(apiJs.includes('getDriftSummary') && apiJs.includes("'drift.summary'"), 'miniprogram api should call drift.summary');
assert.ok(mineJs.includes('getDriftSummary'), 'mine page should load drift summary via single api call');
assert.ok(!mineJs.includes("getOrders('given', 'PENDING_SHIP')"), 'mine page should not fan out eight order queries');
assert.ok(pendingShipJs.includes('getDriftSummary'), 'pending ship badge should use drift summary');

const { buildDriftTodoSummary } = require('../cloudfunctions/api/lib/driftTodoSummary');
const sample = buildDriftTodoSummary(
  [{ status: 'PENDING_SHIP', shipDeadlineAt: new Date(Date.now() + 3600 * 1000).toISOString() }, { status: 'DISPUTED' }],
  [{ status: 'PENDING_SHIP' }, { status: 'PENDING_SHIP' }, { status: 'SHIPPED' }, { status: 'DONE' }],
);
assert.strictEqual(sample.pendingShip, 1);
assert.strictEqual(sample.expiringSoon, 1);
assert.strictEqual(sample.waitingShipReceived, 2);
assert.strictEqual(sample.toConfirm, 1);
assert.strictEqual(sample.disputingGiven, 1);
assert.strictEqual(sample.toReviewReceived, 1);

console.log('drift todo summary contract ok');
