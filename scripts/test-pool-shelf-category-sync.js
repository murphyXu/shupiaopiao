const assert = require('assert');

const poolPath = require.resolve('../cloudfunctions/api/handlers/pool');
const dbPath = require.resolve('../cloudfunctions/api/lib/db');
const utilsPath = require.resolve('../cloudfunctions/api/lib/utils');
const pricingPath = require.resolve('../cloudfunctions/api/lib/pricing');
const categoryPath = require.resolve('../cloudfunctions/api/lib/bookCategory');
const policyPath = require.resolve('../cloudfunctions/api/lib/driftPolicy');
const bookCoverPath = require.resolve('../cloudfunctions/api/lib/bookCover');
const listCoverCachePath = require.resolve('../cloudfunctions/api/lib/listCoverCache');
const shipRegionPath = require.resolve('../cloudfunctions/api/lib/shipRegion');
const analyticsPath = require.resolve('../cloudfunctions/api/lib/analytics');
const profilePath = require.resolve('../cloudfunctions/api/lib/poolRecommendProfile');
const recommendPath = require.resolve('../cloudfunctions/api/lib/poolRecommend');

[
  poolPath, dbPath, utilsPath, pricingPath, categoryPath, policyPath, bookCoverPath,
  listCoverCachePath, shipRegionPath, analyticsPath, profilePath, recommendPath,
].forEach((entry) => { delete require.cache[entry]; });

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
  exports: { CONDITION_LABELS: { like_new: '九成新' } },
};

require.cache[categoryPath] = {
  id: categoryPath,
  filename: categoryPath,
  loaded: true,
  exports: {
    resolveShelfCategory: (book = {}) => {
      const category = book.category || '';
      if (category === '童书') return { key: 'child', label: '童书' };
      if (category === '文学') return { key: 'literature', label: '文学' };
      return { key: 'other', label: category || '其他' };
    },
  },
};

require.cache[policyPath] = {
  id: policyPath,
  filename: policyPath,
  loaded: true,
  exports: { availableCoin: () => 0, isLightweightBook: () => false },
};
require.cache[bookCoverPath] = {
  id: bookCoverPath,
  filename: bookCoverPath,
  loaded: true,
  exports: { formatDisplayBook: (book) => book },
};
require.cache[listCoverCachePath] = {
  id: listCoverCachePath,
  filename: listCoverCachePath,
  loaded: true,
  exports: { cacheBooksForList: async () => ({}) },
};
require.cache[shipRegionPath] = {
  id: shipRegionPath,
  filename: shipRegionPath,
  loaded: true,
  exports: { formatShipFromField: () => '' },
};
require.cache[analyticsPath] = {
  id: analyticsPath,
  filename: analyticsPath,
  loaded: true,
  exports: { hashUid: () => 'anon' },
};
require.cache[profilePath] = {
  id: profilePath,
  filename: profilePath,
  loaded: true,
  exports: { loadUserInterestProfile: async () => ({ isColdStart: true }) },
};
require.cache[recommendPath] = {
  id: recommendPath,
  filename: recommendPath,
  loaded: true,
  exports: { rankPoolList: (list) => list, applyGiverDensityCap: (list) => list },
};

const command = {
  in: (value) => ({ __op: 'in', value }),
  neq: (value) => ({ __op: 'neq', value }),
};

function match(row, query = {}) {
  return Object.keys(query).every((key) => {
    const expected = query[key];
    if (expected && expected.__op === 'in') return expected.value.includes(row[key]);
    if (expected && expected.__op === 'neq') return row[key] !== expected.value;
    return row[key] === expected;
  });
}

function makeQuery(rows) {
  let current = rows;
  return {
    where(query) { current = rows.filter((row) => match(row, query)); return this; },
    orderBy() { return this; },
    limit() { return this; },
    async get() { return { data: current.map((row) => ({ ...row })) }; },
    async count() { return { total: current.length }; },
  };
}

const shelfRows = [{ _id: 'shelf-1', userId: 'giver', bookId: 'book-1', bookClass: 'child' }];
const driftRows = [{
  _id: 'drift-1',
  bookId: 'book-1',
  shelfBookId: 'shelf-1',
  userId: 'giver',
  condition: 'like_new',
  conditionIssueLabels: [],
  images: [],
  imageMap: {},
  coinValue: 3,
  status: 'IN_POOL',
  createdAt: '2026-06-28T00:00:00.000Z',
}];
const books = {
  'book-1': {
    _id: 'book-1',
    isbn: '9780000000001',
    title: '一本旧分类书',
    author: '作者',
    category: '文学',
  },
};

require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    db: { command, collection: (name) => makeQuery(name === 'shelf_books' ? shelfRows : []) },
    _: command,
    requireUser: async () => null,
    getBookById: async (id) => books[id] || null,
    getBooksByIds: async () => books,
    getUsersByIds: async () => ({ giver: { nickname: '书友', avatar: '', creditScore: 100 } }),
    getUserByOpenid: async () => null,
    safeQuery: async (collectionName, builder) => {
      if (collectionName === 'drifts') return builder(makeQuery(driftRows));
      if (collectionName === 'shelf_books') return builder(makeQuery(shelfRows));
      if (collectionName === 'reports') return { data: [] };
      if (collectionName === 'drift_orders') return { data: [] };
      return { data: [], total: 0 };
    },
  },
};

(async () => {
  const pool = require('../cloudfunctions/api/handlers/pool');
  const result = await pool.list({ category: 'children' }, '');
  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.data.list.length, 1, 'pool should filter by current shelf bookClass after shelf edit');
  assert.strictEqual(result.data.list[0].category, 'children');
  assert.strictEqual(result.data.list[0].categoryLabel, '童书');
  console.log('pool shelf category sync ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
