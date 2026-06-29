const assert = require('assert');

const { prepareGivenList } = require('../cloudfunctions/api/lib/driftOrderList');

const pending = Array.from({ length: 3 }, (_, index) => ({
  id: `pending-${index}`,
  status: 'PENDING_SHIP',
  createdAt: '2026-06-24T00:00:00.000Z',
}));

const open = Array.from({ length: 60 }, (_, index) => ({
  id: `open-${index}`,
  status: 'IN_POOL',
  createdAt: `2026-06-26T00:${String(index).padStart(2, '0')}:00.000Z`,
}));

const list = prepareGivenList([...pending, ...open], 50);

assert.strictEqual(list.length, 50);
assert.deepStrictEqual(
  list.slice(0, 3).map((item) => item.status),
  ['PENDING_SHIP', 'PENDING_SHIP', 'PENDING_SHIP'],
  'given list should keep actionable pending-ship records before newer open drifts',
);

console.log('drift given list priority contract ok');
