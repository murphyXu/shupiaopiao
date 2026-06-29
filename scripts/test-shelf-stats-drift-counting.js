const assert = require('assert');

const shelfPath = require.resolve('../cloudfunctions/api/handlers/shelf');
const shelfCapacityPath = require.resolve('../cloudfunctions/api/lib/shelfCapacity');
const dbPath = require.resolve('../cloudfunctions/api/lib/db');
const utilsPath = require.resolve('../cloudfunctions/api/lib/utils');
const lookupPath = require.resolve('../cloudfunctions/api/lib/bookLookup');
const policyPath = require.resolve('../cloudfunctions/api/lib/driftPolicy');
const securityPath = require.resolve('../cloudfunctions/api/lib/contentSecurity');
const categoryPath = require.resolve('../cloudfunctions/api/lib/bookCategory');

delete require.cache[shelfPath];
delete require.cache[shelfCapacityPath];
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
require.cache[lookupPath] = {
  id: lookupPath,
  filename: lookupPath,
  loaded: true,
  exports: { resolveByIsbn: async () => null },
};
require.cache[policyPath] = {
  id: policyPath,
  filename: policyPath,
  loaded: true,
  exports: { availableCoin: () => 0 },
};
require.cache[securityPath] = {
  id: securityPath,
  filename: securityPath,
  loaded: true,
  exports: { assertSafeTextFields: async () => {} },
};
require.cache[categoryPath] = {
  id: categoryPath,
  filename: categoryPath,
  loaded: true,
  exports: {
    normalizeBookCategory: (category) => category || '图书',
    resolveShelfCategory: (book = {}) => ({ key: 'other', label: book.category || '图书' }),
  },
};

const shelfRows = [
  { _id: 'shelf-pending', userId: 'user-1', bookId: 'book-pending', createdAt: '2026-06-23T10:00:00.000Z' },
  { _id: 'shelf-pool', userId: 'user-1', bookId: 'book-pool', createdAt: '2026-06-23T10:01:00.000Z' },
  { _id: 'shelf-claimed', userId: 'user-1', bookId: 'book-claimed', createdAt: '2026-06-23T10:02:00.000Z' },
  { _id: 'shelf-completed', userId: 'user-1', bookId: 'book-completed', createdAt: '2026-06-23T10:03:00.000Z' },
  { _id: 'shelf-plain', userId: 'user-1', bookId: 'book-plain', createdAt: '2026-06-23T10:04:00.000Z' },
  { _id: 'shelf-quick', userId: 'user-1', bookId: 'book-pool', purpose: 'drift_quick', createdAt: '2026-06-23T10:05:00.000Z' },
];

const books = {
  'book-pending': { _id: 'book-pending', isbn: '9780000000001', title: '待审核书', author: '作者', listPrice: '10.00' },
  'book-pool': { _id: 'book-pool', isbn: '9780000000002', title: '待领取书', author: '作者', listPrice: '20.00' },
  'book-claimed': { _id: 'book-claimed', isbn: '9780000000003', title: '已被接漂书', author: '作者', listPrice: '30.00' },
  'book-completed': { _id: 'book-completed', isbn: '9780000000004', title: '已完成书', author: '作者', listPrice: '40.00' },
  'book-plain': { _id: 'book-plain', isbn: '9780000000005', title: '普通藏书', author: '作者', listPrice: '50.00' },
};

const driftRows = [
  { _id: 'drift-pending', userId: 'user-1', shelfBookId: 'shelf-pending', status: 'PENDING_REVIEW', createdAt: '2026-06-23T11:00:00.000Z' },
  { _id: 'drift-pool', userId: 'user-1', shelfBookId: 'shelf-pool', status: 'IN_POOL', createdAt: '2026-06-23T11:01:00.000Z' },
  { _id: 'drift-claimed', userId: 'user-1', shelfBookId: 'shelf-claimed', status: 'CLAIMED', createdAt: '2026-06-23T11:02:00.000Z' },
  { _id: 'drift-completed', userId: 'user-1', shelfBookId: 'shelf-completed', status: 'COMPLETED', createdAt: '2026-06-23T11:03:00.000Z' },
];

const command = {
  in: (value) => ({ __op: 'in', value }),
  inc: (value) => ({ __op: 'inc', value }),
  neq: (value) => ({ __op: 'neq', value }),
};

function matches(row, query = {}) {
  return Object.keys(query).every((key) => {
    const expected = query[key];
    if (expected && expected.__op === 'in') return expected.value.includes(row[key]);
    if (expected && expected.__op === 'neq') return row[key] !== expected.value;
    return row[key] === expected;
  });
}

function collection(name) {
  let query = {};
  return {
    where(nextQuery) {
      query = nextQuery || {};
      return this;
    },
    orderBy() {
      return this;
    },
    limit() {
      return this;
    },
    async count() {
      if (name === 'shelf_books') return { total: shelfRows.filter((row) => matches(row, query)).length };
      return { total: 0 };
    },
    async get() {
      if (name === 'shelf_books') return { data: shelfRows.filter((row) => matches(row, query)).map((row) => ({ ...row })) };
      if (name === 'drifts') return { data: driftRows.filter((row) => matches(row, query)).map((row) => ({ ...row })) };
      if (name === 'pricing_cache') return { data: [] };
      return { data: [] };
    },
    doc(id) {
      return {
        async get() {
          return { data: null };
        },
        async update() {},
        async set() {},
      };
    },
  };
}

require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    db: { command, collection },
    requireUser: async () => ({ _id: 'user-1', shelfLimit: 100 }),
    getBookById: async (id) => books[id] || null,
    getBooksByIds: async (ids) => Object.fromEntries(ids.filter((id) => books[id]).map((id) => [id, books[id]])),
    formatBook: (book) => ({
      id: book._id,
      isbn: book.isbn,
      title: book.title,
      author: book.author,
      listPrice: book.listPrice,
      category: book.category || '图书',
    }),
    DEFAULT_SHELF_LIMIT: 100,
    settleInviteReward: async () => false,
  },
};

(async () => {
  const shelf = require('../cloudfunctions/api/handlers/shelf');
  const result = await shelf.dashboard('openid-user-1');
  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.data.totalBooks, 4);
  assert.strictEqual(result.data.totalListPrice, 100);
  assert.strictEqual(result.data.totalValue, 100);
  assert.strictEqual(result.data.remainingCapacity, 94);
  console.log('shelf stats drift counting ok');
})();
