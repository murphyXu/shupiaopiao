const assert = require('assert');
const { ensureAccountingV2 } = require('../cloudfunctions/api/lib/driftMigration');

function memoryTransaction(seed) {
  const state = JSON.parse(JSON.stringify(seed));
  return {
    state,
    collection(name) {
      return {
        doc(id) {
          return {
            async get() { return { data: state[name] && state[name][id] }; },
            async set({ data }) {
              state[name] = state[name] || {};
              state[name][id] = { ...(state[name][id] || {}), ...data };
            },
            async update({ data }) {
              state[name] = state[name] || {};
              const row = state[name][id] || {};
              Object.entries(data).forEach(([key, value]) => {
                if (value && value.__inc !== undefined) row[key] = (Number(row[key]) || 0) + value.__inc;
                else row[key] = value;
              });
              state[name][id] = row;
            },
          };
        },
      };
    },
  };
}

(async () => {
  const tx = memoryTransaction({
    users: { receiver: { coinBalance: 6, coinFrozen: 0, activeClaimCount: 0 } },
    drifts: { drift1: { _id: 'drift1', coinValue: 4 } },
    drift_orders: { order1: { _id: 'order1', driftId: 'drift1', receiverId: 'receiver', status: 'SHIPPED' } },
    drift_order_events: {},
  });
  const command = { inc: (value) => ({ __inc: value }) };
  const first = await ensureAccountingV2(tx, tx.state.drift_orders.order1, command);
  const second = await ensureAccountingV2(tx, tx.state.drift_orders.order1, command);
  assert.strictEqual(first.migrated, true);
  assert.strictEqual(second.migrated, false);
  assert.deepStrictEqual(tx.state.users.receiver, { coinBalance: 10, coinFrozen: 4, activeClaimCount: 1 });
  assert.strictEqual(tx.state.drift_orders.order1.accountingVersion, 2);
  assert.strictEqual(tx.state.drift_orders.order1.activeCounted, true);
  assert.strictEqual(Object.keys(tx.state.drift_order_events).length, 1);
  await assert.rejects(() => ensureAccountingV2(tx, { ...tx.state.drift_orders.order1, accountingVersion: 99 }, command), /ACCOUNTING_VERSION_UNSUPPORTED/);
  console.log('drift migration ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
