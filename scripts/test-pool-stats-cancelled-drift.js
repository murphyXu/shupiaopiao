const assert = require('assert');

const poolPath = require.resolve('../cloudfunctions/api/handlers/pool');
const dbPath = require.resolve('../cloudfunctions/api/lib/db');
const utilsPath = require.resolve('../cloudfunctions/api/lib/utils');
const pricingPath = require.resolve('../cloudfunctions/api/lib/pricing');
const categoryPath = require.resolve('../cloudfunctions/api/lib/bookCategory');
const policyPath = require.resolve('../cloudfunctions/api/lib/driftPolicy');

delete require.cache[poolPath];
require.cache[utilsPath] = {
  id: utilsPath,
  filename: utilsPath,
  loaded: true,
  exports: {
    ok: (data) => ({ code: 0, data }),
    fail: (code, msg) => ({ code, msg }),
  },
};
require.cache[pricingPath] = {
  id: pricingPath,
  filename: pricingPath,
  loaded: true,
  exports: { CONDITION_LABELS: {} },
};
require.cache[categoryPath] = {
  id: categoryPath,
  filename: categoryPath,
  loaded: true,
  exports: { normalizeBookCategory: (category) => category || '社科' },
};
require.cache[policyPath] = {
  id: policyPath,
  filename: policyPath,
  loaded: true,
  exports: { availableCoin: () => 0 },
};

const command = {
  in: (value) => ({ __op: 'in', value }),
  neq: (value) => ({ __op: 'neq', value }),
  nin: (value) => ({ __op: 'nin', value }),
};

function createCollection(name) {
  return {
    where() {
      return this;
    },
    orderBy() {
      return this;
    },
    limit() {
      return this;
    },
    async get() {
      if (name === 'drifts') {
        return {
          data: [{
            _id: 'drift-giver-cancelled',
            userId: 'user-fuma',
            status: 'IN_POOL',
            activeOrderId: '',
          }],
        };
      }
      if (name === 'drift_orders') {
        return {
          data: [{
            _id: 'order-giver',
            driftId: 'drift-giver-cancelled',
            status: 'CANCELLED',
            cancelledBy: 'GIVER',
          }],
        };
      }
      if (name === 'drift_wants') return { data: [] };
      if (name === 'reports') return { data: [] };
      return { data: [] };
    },
    async count() {
      if (name === 'drifts') return { total: 1 };
      if (name === 'drift_orders') return { total: 0 };
      return { total: 0 };
    },
  };
}

require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    db: { command },
    _: command,
    requireUser: async () => null,
    getBookById: async () => null,
    getBooksByIds: async () => ({}),
    getUsersByIds: async () => ({}),
    getUserByOpenid: async () => ({ _id: 'user-fuma', openid: 'openid-fuma' }),
    safeQuery: async (collectionName, builder) => builder(createCollection(collectionName)),
    formatBook: (book) => book,
  },
};

(async () => {
  const pool = require('../cloudfunctions/api/handlers/pool');
  const result = await pool.stats('openid-fuma');
  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.data.givenCount, 0);
  assert.strictEqual(result.data.receivedCount, 0);
  assert.strictEqual(result.data.wantCount, 0);
  console.log('pool stats cancelled drift ok');
})();
