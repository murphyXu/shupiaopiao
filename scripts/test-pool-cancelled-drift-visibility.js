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
  exports: { CONDITION_LABELS: { like_new: '九成新' } },
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
};

require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    db: { command },
    _: command,
    requireUser: async () => null,
    getBookById: async () => null,
    getBooksByIds: async () => ({
      'book-giver': {
        _id: 'book-giver',
        isbn: '9787559677280',
        title: '见树又见林',
        author: '艾伦·G.约翰逊',
        cover: 'cloud://env/book-covers/9787559677280.jpg',
        category: '社科',
      },
      'book-receiver': {
        _id: 'book-receiver',
        isbn: '9787559677281',
        title: '可重新接漂的书',
        author: '作者',
        cover: 'cloud://env/book-covers/9787559677281.jpg',
        category: '社科',
      },
    }),
    getUsersByIds: async () => ({ giver: { nickname: '付马', avatar: '', creditScore: 100 } }),
    getUserByOpenid: async () => null,
    safeQuery: async (collectionName) => {
      if (collectionName === 'drifts') {
        return {
          data: [
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
          ],
        };
      }
      if (collectionName === 'drift_orders') {
        return {
          data: [
            {
              _id: 'order-giver',
              driftId: 'drift-giver-cancelled',
              status: 'CANCELLED',
              cancelledBy: 'GIVER',
            },
          ],
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
      category: book.category,
    }),
  },
};

(async () => {
  const pool = require('../cloudfunctions/api/handlers/pool');
  const result = await pool.list({}, '');
  assert.strictEqual(result.code, 0);
  assert.deepStrictEqual(result.data.list.map((item) => item.id), ['drift-receiver-cancelled']);
  console.log('pool cancelled drift visibility ok');
})();
