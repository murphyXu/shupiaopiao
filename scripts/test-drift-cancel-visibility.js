const assert = require('assert');

const driftPath = require.resolve('../cloudfunctions/api/handlers/drift');
const dbPath = require.resolve('../cloudfunctions/api/lib/db');
const utilsPath = require.resolve('../cloudfunctions/api/lib/utils');
const pricingPath = require.resolve('../cloudfunctions/api/lib/pricing');
const contentSecurityPath = require.resolve('../cloudfunctions/api/lib/contentSecurity');
const accountingPath = require.resolve('../cloudfunctions/api/lib/driftAccounting');
const migrationPath = require.resolve('../cloudfunctions/api/lib/driftMigration');
const policyPath = require.resolve('../cloudfunctions/api/lib/driftPolicy');

function installDriftHandler(state, currentUserId) {
  delete require.cache[driftPath];
  require.cache[utilsPath] = {
    id: utilsPath,
    filename: utilsPath,
    loaded: true,
    exports: {
      ok: (data) => ({ code: 0, data }),
      fail: (code, msg) => ({ code, msg }),
      uid: () => 'id',
      nowIso: () => '2026-06-23T12:00:00.000Z',
    },
  };
  require.cache[pricingPath] = {
    id: pricingPath,
    filename: pricingPath,
    loaded: true,
    exports: {
      runAutoCheck: () => ({ passed: true, reasons: [], checks: [] }),
      CONDITION_LABELS: {},
      CONDITION_ISSUE_LABELS: {},
    },
  };
  require.cache[contentSecurityPath] = {
    id: contentSecurityPath,
    filename: contentSecurityPath,
    loaded: true,
    exports: {
      assertSafeTextFields: async () => {},
      assertSafeMediaFiles: async () => {},
    },
  };
  require.cache[accountingPath] = {
    id: accountingPath,
    filename: accountingPath,
    loaded: true,
    exports: {
      writeCoinEvent: async () => {},
      writeCreditEvent: async () => {},
      writeOrderEvent: async () => {},
    },
  };
  require.cache[migrationPath] = {
    id: migrationPath,
    filename: migrationPath,
    loaded: true,
    exports: {
      ensureAccountingV2: async (transaction, order) => ({ order }),
    },
  };
  require.cache[policyPath] = {
    id: policyPath,
    filename: policyPath,
    loaded: true,
    exports: {
      policyForStage: () => ({ publishReward: 0, publishRewardCap: 0, inflightLimit: 2 }),
      calculateCoinValue: () => 1,
      availableCoin: () => 10,
      addHours: (iso) => iso,
      addDays: (iso) => iso,
      cancelCreditChange: (role) => {
        if (role === 'RECEIVER') return { target: 'receiver', delta: -2 };
        if (role === 'GIVER') return { target: 'giver', delta: -5 };
        if (role === 'SYSTEM') return { target: 'giver', delta: -10 };
        return null;
      },
      applyPendingPenalty: () => ({ credited: 0, offset: 0 }),
      splitViolationPenalty: () => ({ deducted: 0, pending: 0 }),
    },
  };

  const command = {
    inc: (value) => ({ __op: 'inc', value }),
    in: (value) => ({ __op: 'in', value }),
    lte: (value) => ({ __op: 'lte', value }),
  };

  function docRef(collectionName, id) {
    return {
      async get() {
        const row = state[collectionName] && state[collectionName][id];
        return { data: row ? { ...row } : null };
      },
      async update({ data }) {
        state[collectionName][id] = { ...state[collectionName][id], ...data };
      },
      async set({ data }) {
        state[collectionName][id] = { _id: id, ...data };
      },
    };
  }

  const transaction = {
    collection(collectionName) {
      return {
        doc: (id) => docRef(collectionName, id),
      };
    },
  };

  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      db: {
        command,
        runTransaction: async (callback) => callback(transaction),
      },
      _: command,
      requireUser: async () => state.users[currentUserId],
      getBookById: async () => null,
      getBooksByIds: async () => ({}),
      getUsersByIds: async () => ({}),
      formatBook: (book) => book,
      settleInviteReward: async () => false,
      DEFAULT_SHELF_LIMIT: 100,
    },
  };

  return require('../cloudfunctions/api/handlers/drift');
}

function baseState() {
  return {
    users: {
      giver: { _id: 'giver' },
      receiver: { _id: 'receiver' },
    },
    drift_orders: {
      order1: {
        _id: 'order1',
        driftId: 'drift1',
        giverId: 'giver',
        receiverId: 'receiver',
        status: 'PENDING_SHIP',
        coinValue: 5,
        activeCounted: true,
      },
    },
    drifts: {
      drift1: {
        _id: 'drift1',
        userId: 'giver',
        status: 'CLAIMED',
        activeOrderId: 'order1',
        publishRewardGranted: false,
      },
    },
  };
}

(async () => {
  const giverState = baseState();
  const giverDrift = installDriftHandler(giverState, 'giver');
  const giverResult = await giverDrift.cancel('openid-giver', { orderId: 'order1', reason: '取消漂流' });
  assert.strictEqual(giverResult.code, 0);
  assert.strictEqual(giverState.drift_orders.order1.status, 'CANCELLED');
  assert.strictEqual(giverState.drift_orders.order1.cancelledBy, 'GIVER');
  assert.strictEqual(giverState.drifts.drift1.status, 'CANCELLED');
  assert.strictEqual(giverState.drifts.drift1.activeOrderId, '');

  const receiverState = baseState();
  const receiverDrift = installDriftHandler(receiverState, 'receiver');
  const receiverResult = await receiverDrift.cancel('openid-receiver', { orderId: 'order1', reason: '取消接漂' });
  assert.strictEqual(receiverResult.code, 0);
  assert.strictEqual(receiverState.drift_orders.order1.status, 'CANCELLED');
  assert.strictEqual(receiverState.drift_orders.order1.cancelledBy, 'RECEIVER');
  assert.strictEqual(receiverState.drifts.drift1.status, 'IN_POOL');
  assert.strictEqual(receiverState.drifts.drift1.activeOrderId, '');

  console.log('drift cancel visibility ok');
})();
