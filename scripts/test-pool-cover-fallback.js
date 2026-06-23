const assert = require('assert');

const poolPath = require.resolve('../cloudfunctions/api/handlers/pool');
const dbPath = require.resolve('../cloudfunctions/api/lib/db');
const utilsPath = require.resolve('../cloudfunctions/api/lib/utils');
const pricingPath = require.resolve('../cloudfunctions/api/lib/pricing');
const categoryPath = require.resolve('../cloudfunctions/api/lib/bookCategory');
const policyPath = require.resolve('../cloudfunctions/api/lib/driftPolicy');
const lookupPath = require.resolve('../cloudfunctions/api/lib/bookLookup');

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
  exports: { CONDITION_LABELS: { like_new: '九成新' } },
};
require.cache[categoryPath] = {
  id: categoryPath,
  filename: categoryPath,
  loaded: true,
  exports: { normalizeBookCategory: (category) => category || '童书' },
};
require.cache[policyPath] = {
  id: policyPath,
  filename: policyPath,
  loaded: true,
  exports: { availableCoin: () => 0 },
};
require.cache[lookupPath] = {
  id: lookupPath,
  filename: lookupPath,
  loaded: true,
  exports: {
    refreshBooksCoverMetadata: async (_db, booksMap) => booksMap,
    refreshBookCoverMetadata: async (_db, book) => book,
  },
};
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    db: {},
    _: {},
    requireUser: async () => null,
    getBookById: async () => null,
    getBooksByIds: async () => ({
      'book-1': {
        _id: 'book-1',
        isbn: '9787559855022',
        title: '标准元数据封面',
        author: '作者',
        cover: 'local:9787559855022',
        coverRemote: 'https://static.tanshuapi.com/book-cover.jpg',
        category: '童书',
      },
    }),
    getUsersByIds: async () => ({ user1: { nickname: '书友', avatar: '', creditScore: 100 } }),
    getUserByOpenid: async () => null,
    safeQuery: async (collectionName) => {
      if (collectionName === 'drifts') {
        return {
          data: [{
            _id: 'drift-1',
            bookId: 'book-1',
            userId: 'user1',
            condition: 'like_new',
            conditionIssueLabels: [],
            imageMap: {},
            images: [],
            coinValue: 4,
            status: 'IN_POOL',
            createdAt: '2026-06-23T00:00:00.000Z',
          }],
        };
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
      coverRemote: book.coverRemote || '',
      category: book.category || '',
    }),
  },
};

(async () => {
  const pool = require('../cloudfunctions/api/handlers/pool');
  const result = await pool.list({}, '');
  assert.strictEqual(result.code, 0);
  assert.strictEqual(
    result.data.list[0].book.cover,
    'https://static.tanshuapi.com/book-cover.jpg',
  );

  require.cache[dbPath].exports.getBooksByIds = async () => ({
    'book-2': {
      _id: 'book-2',
      isbn: '9787559855023',
      title: '已有云存储封面',
      author: '作者',
      cover: 'cloud://env/book-covers/9787559855023.jpg',
      coverRemote: 'https://static.tanshuapi.com/old.jpg',
      category: '童书',
    },
  });
  require.cache[dbPath].exports.safeQuery = async (collectionName) => {
    if (collectionName === 'drifts') {
      return {
        data: [{
          _id: 'drift-2',
          bookId: 'book-2',
          userId: 'user1',
          condition: 'like_new',
          conditionIssueLabels: [],
          imageMap: {},
          images: [],
          coinValue: 4,
          status: 'IN_POOL',
          createdAt: '2026-06-23T00:00:00.000Z',
        }],
      };
    }
    if (collectionName === 'reports') return { data: [] };
    return { data: [] };
  };
  delete require.cache[poolPath];
  const poolWithCloud = require('../cloudfunctions/api/handlers/pool');
  const cloudCoverResult = await poolWithCloud.list({}, '');
  assert.strictEqual(
    cloudCoverResult.data.list[0].book.cover,
    'cloud://env/book-covers/9787559855023.jpg',
  );

  console.log('pool cover fallback ok');
})();
