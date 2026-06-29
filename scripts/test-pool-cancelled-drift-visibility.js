const assert = require('assert');
const fs = require('fs');

const poolPath = require.resolve('../cloudfunctions/api/handlers/pool');
const dbPath = require.resolve('../cloudfunctions/api/lib/db');
const utilsPath = require.resolve('../cloudfunctions/api/lib/utils');
const pricingPath = require.resolve('../cloudfunctions/api/lib/pricing');
const categoryPath = require.resolve('../cloudfunctions/api/lib/bookCategory');
const policyPath = require.resolve('../cloudfunctions/api/lib/driftPolicy');
const coverPath = require.resolve('../cloudfunctions/api/lib/bookCover');
const listCoverCachePath = require.resolve('../cloudfunctions/api/lib/listCoverCache');
const shipRegionPath = require.resolve('../cloudfunctions/api/lib/shipRegion');
const analyticsPath = require.resolve('../cloudfunctions/api/lib/analytics');
const poolRecommendProfilePath = require.resolve('../cloudfunctions/api/lib/poolRecommendProfile');
const poolRecommendPath = require.resolve('../cloudfunctions/api/lib/poolRecommend');

function stubModule(resolvedPath, exports) {
  require.cache[resolvedPath] = {
    id: resolvedPath,
    filename: resolvedPath,
    loaded: true,
    exports,
  };
}

const drifts = [
  {
    _id: 'drift-giver-cancelled',
    bookId: 'book-giver',
    userId: 'giver',
    condition: 'like_new',
    conditionIssueLabels: [],
    images: [],
    imageMap: {},
    coinValue: 5,
    status: 'IN_POOL',
    activeOrderId: '',
    createdAt: '2026-06-23T12:00:00.000Z',
  },
  {
    _id: 'drift-receiver-cancelled',
    bookId: 'book-receiver',
    userId: 'giver',
    condition: 'like_new',
    conditionIssueLabels: [],
    images: [],
    imageMap: {},
    coinValue: 4,
    status: 'IN_POOL',
    activeOrderId: '',
    createdAt: '2026-06-23T11:00:00.000Z',
  },
  {
    _id: 'drift-system-cancelled',
    bookId: 'book-system',
    userId: 'giver',
    condition: 'like_new',
    conditionIssueLabels: [],
    images: [],
    imageMap: {},
    coinValue: 3,
    status: 'IN_POOL',
    activeOrderId: '',
    createdAt: '2026-06-23T10:00:00.000Z',
  },
];

const books = {
  'book-giver': {
    _id: 'book-giver',
    isbn: '9787559677280',
    title: '赠书方取消后隐藏',
    author: '作者A',
    cover: 'cloud://env/book-covers/9787559677280.jpg',
    category: '社科',
  },
  'book-receiver': {
    _id: 'book-receiver',
    isbn: '9787559677281',
    title: '接漂方取消后仍展示',
    author: '作者B',
    cover: 'cloud://env/book-covers/9787559677281.jpg',
    category: '社科',
  },
  'book-system': {
    _id: 'book-system',
    isbn: '9787559677282',
    title: '系统超时取消后仍展示',
    author: '作者C',
    cover: 'cloud://env/book-covers/9787559677282.jpg',
    category: '社科',
  },
};

delete require.cache[poolPath];
stubModule(utilsPath, {
  ok: (data) => ({ code: 0, data }),
  fail: (code, msg) => ({ code, msg }),
});
stubModule(pricingPath, { CONDITION_LABELS: { like_new: '九成新' } });
stubModule(categoryPath, {
  normalizeBookCategory: (category) => category || '社科',
  resolveShelfCategory: (book = {}) => ({ key: 'social', label: book.category || '社科' }),
});
stubModule(policyPath, { availableCoin: () => 0, isLightweightBook: () => false });
stubModule(coverPath, { formatDisplayBook: (book) => book });
stubModule(listCoverCachePath, { cacheBooksForList: async () => {} });
stubModule(shipRegionPath, { formatShipFromField: () => '' });
stubModule(analyticsPath, { hashUid: () => 'anon' });
stubModule(poolRecommendProfilePath, { loadUserInterestProfile: async () => ({ isColdStart: true }) });
stubModule(poolRecommendPath, {
  rankPoolList: (list) => list,
  applyGiverDensityCap: (list) => list,
  promoteTopLowPointChildren: (list) => list,
});

const command = {
  in: (value) => ({ __op: 'in', value }),
  neq: (value) => ({ __op: 'neq', value }),
};

stubModule(dbPath, {
  db: { command, collection: () => ({}) },
  _: command,
  requireUser: async () => null,
  getBookById: async () => null,
  getBooksByIds: async () => books,
  getUsersByIds: async () => ({ giver: { nickname: '付马', avatar: '', creditScore: 100 } }),
  getUserByOpenid: async () => null,
  queryRowsByIdChunks: async () => [],
  safeQuery: async (collectionName, builder) => {
    if (collectionName === 'drifts' && typeof builder === 'function') {
      const state = { skip: 0, limit: drifts.length };
      const col = {
        where() { return col; },
        orderBy() { return col; },
        skip(value) { state.skip = value; return col; },
        limit(value) { state.limit = value; return col; },
        count: async () => ({ total: drifts.length }),
        get: async () => ({ data: drifts.slice(state.skip, state.skip + state.limit) }),
      };
      return builder(col);
    }
    if (collectionName === 'drift_orders' && typeof builder === 'function') {
      const col = {
        where(query = {}) {
          col.query = query;
          return col;
        },
        limit() { return col; },
        get: async () => {
          const all = [
            {
              _id: 'order-giver',
              driftId: 'drift-giver-cancelled',
              status: 'CANCELLED',
              cancelledBy: 'GIVER',
            },
            {
              _id: 'order-receiver',
              driftId: 'drift-receiver-cancelled',
              status: 'CANCELLED',
              cancelledBy: 'RECEIVER',
            },
            {
              _id: 'order-system',
              driftId: 'drift-system-cancelled',
              status: 'CANCELLED',
              cancelledBy: 'SYSTEM',
            },
          ];
          const cancelledBy = col.query && col.query.cancelledBy;
          const driftIds = col.query && col.query.driftId && col.query.driftId.value;
          return {
            data: all.filter((row) => {
              if (cancelledBy && row.cancelledBy !== cancelledBy) return false;
              if (driftIds && !driftIds.includes(row.driftId)) return false;
              return true;
            }),
          };
        },
      };
      return builder(col);
    }
    if (collectionName === 'reports') return { data: [] };
    return { data: [] };
  },
  formatBook: (book) => ({
    id: book._id,
    isbn: book.isbn,
    title: book.title,
    author: book.author,
    cover: book.cover,
    category: book.category,
  }),
});

(async () => {
  const poolSource = fs.readFileSync(require.resolve('../cloudfunctions/api/handlers/pool.js'), 'utf8');
  assert.ok(poolSource.includes("cancelledBy: 'GIVER'"), 'pool should only hide drifts cancelled by giver');
  assert.ok(!poolSource.includes("cancelledBy: _.in(['GIVER', 'SYSTEM'])"), 'pool should not hide system-timeout cancellations');

  const pool = require('../cloudfunctions/api/handlers/pool');
  const result = await pool.list({}, '');
  assert.strictEqual(result.code, 0);
  assert.deepStrictEqual(
    result.data.list.map((item) => item.id).sort(),
    ['drift-receiver-cancelled', 'drift-system-cancelled'].sort(),
  );
  console.log('pool cancelled drift visibility ok');
})();
