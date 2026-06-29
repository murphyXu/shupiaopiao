const assert = require('assert');
const {
  resolveShipDeadline,
  isShipDeadlinePassed,
  partitionPendingShipMaintenance,
} = require('../cloudfunctions/api/lib/driftMaintenance');

const claimedAt = '2026-06-20T10:00:00.000Z';
const order = {
  _id: 'order-test-fd489373',
  status: 'PENDING_SHIP',
  claimedAt,
  shipDeadlineAt: '',
};

const deadline = resolveShipDeadline(order);
assert.ok(deadline, 'missing shipDeadlineAt should still resolve from claimedAt');
assert.ok(isShipDeadlinePassed(order, '2026-06-28T00:00:00.000Z'), 'claimedAt + 72h should be treated as expired');

const futureStored = {
  ...order,
  shipDeadlineAt: '2099-01-01T00:00:00.000Z',
};
assert.ok(
  isShipDeadlinePassed(futureStored, '2026-06-28T00:00:00.000Z'),
  'incorrect future shipDeadlineAt must not block timeout enforcement',
);

const { dueCancel, backfills } = partitionPendingShipMaintenance([futureStored], '2026-06-28T00:00:00.000Z');
assert.strictEqual(dueCancel.length, 1, 'maintenance scan should include overdue pending ship orders');
assert.ok(backfills.length >= 1, 'maintenance scan should backfill canonical shipDeadlineAt');

console.log('drift maintenance contract ok');
