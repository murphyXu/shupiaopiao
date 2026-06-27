const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const shelfPath = path.join(__dirname, '../cloudfunctions/api/handlers/shelf.js');
const source = fs.readFileSync(shelfPath, 'utf8');
const updateBlock = source.slice(source.indexOf('async function update'), source.indexOf('async function remove'));

assert.ok(/let book = await getBookById/.test(updateBlock), 'shelf.update must use let book before category sync');

const shelfRow = {
  _id: 'shelf-1',
  userId: 'user-1',
  bookId: 'book-1',
  bookClass: 'literature',
  readingStatus: 'want_read',
  category: 'want_read',
  shelfLocationKey: 'shelf_1',
  shelfLocationName: '默认书架 1',
};
const shelfState = { ...shelfRow };

const sandbox = {
  module: { exports: {} },
  exports: {},
  require(mod) {
    const map = {
      '../lib/utils': {
        ok: (data) => ({ ok: true, data }),
        fail: (code, message) => ({ ok: false, code, message }),
        uid: () => 'id',
        nowIso: () => '2026-06-25T00:00:00.000Z',
      },
      '../lib/db': {
        db: {
          collection(name) {
            return {
              doc(id) {
                return {
                  async get() {
                    if (name === 'shelf_books') return { data: { ...shelfState, _id: id } };
                    return { data: { _id: 'book-1', category: '文学', title: '萝卜回来了' } };
                  },
                  async update({ data }) {
                    if (name === 'shelf_books') Object.assign(shelfState, data);
                    return {};
                  },
                };
              },
            };
          },
        },
        requireUser: async () => ({ _id: 'user-1' }),
        getBookById: async () => ({ _id: 'book-1', category: '文学', title: '萝卜回来了' }),
        getBooksByIds: async () => ({}),
        formatBook: (book) => book,
        DEFAULT_SHELF_LIMIT: 100,
        settleInviteReward: async () => {},
      },
      '../lib/bookLookup': { resolveByIsbn: async () => null },
      '../lib/bookLookupPolicy': { cleanBookTitle: (title) => title },
      '../lib/bookCatalog': { normalizeIsbn: (value) => value },
      '../lib/bookCategory': {
        normalizeBookCategory: () => '童书',
        resolveShelfCategory: () => ({ key: 'child', label: '童书' }),
        resolveShelfBookClass: () => 'child',
      },
      '../lib/contentSecurity': { assertSafeTextFields: async () => {} },
      '../lib/driftPolicy': { availableCoin: () => 0, SHELF_CAPACITY_PER_COIN: 1 },
      '../lib/pricing': { CONDITION_LABELS: { like_new: '9成新' } },
      '../lib/bookCover': { formatDisplayBook: (book) => book },
      '../lib/listCoverCache': { cacheBooksForList: async (books) => books },
    };
    if (!map[mod]) throw new Error(`unexpected require: ${mod}`);
    return map[mod];
  },
  console,
  Promise,
  Set,
  Math,
  Number,
  String,
  Date,
  Array,
  Object,
};

vm.runInNewContext(source, sandbox, { filename: 'shelf.js' });

(async () => {
  const result = await sandbox.module.exports.update('openid-1', {
    id: 'shelf-1',
    bookClass: 'child',
  });
  assert.strictEqual(result.ok, true, `expected shelf.update success, got ${JSON.stringify(result)}`);
  assert.strictEqual(result.data.bookClass, 'child');
  assert.strictEqual(result.data.bookClassLabel, '童书');
  console.log('shelf update bookClass contract ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
