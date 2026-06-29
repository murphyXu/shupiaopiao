const assert = require('assert');

const providersPath = require.resolve('../cloudfunctions/api/lib/bookProviders');
const lookupPath = require.resolve('../cloudfunctions/api/lib/bookLookup');

function createCollection(initialRows) {
  const rows = initialRows;
  let query = {};
  let lastDocId = '';
  return {
    where(nextQuery) {
      query = nextQuery || {};
      return this;
    },
    limit() {
      return this;
    },
    async get() {
      if (lastDocId) {
        const row = rows.find((item) => item._id === lastDocId);
        lastDocId = '';
        return { data: row ? { ...row } : null };
      }
      const list = rows.filter((item) => Object.keys(query).every((key) => item[key] === query[key]));
      return { data: list.map((item) => ({ ...item })) };
    },
    doc(id) {
      lastDocId = id;
      return {
        update: async ({ data }) => {
          const index = rows.findIndex((item) => item._id === id);
          rows[index] = { ...rows[index], ...data };
        },
        set: async ({ data }) => {
          rows.push({ _id: id, ...data });
        },
        get: async () => {
          const row = rows.find((item) => item._id === id);
          return { data: row ? { ...row } : null };
        },
      };
    },
  };
}

(async () => {
  const rows = [{
    _id: 'book-1',
    isbn: '9787559677280',
    title: '见树又见林',
    author: '艾伦·G.约翰逊',
    publisher: '北京联合出版公司',
    pubDate: '2024',
    listPrice: '',
    cover: 'cloud://env/book-covers/9787559677280.jpg',
    coverRemote: 'https://static.tanshuapi.com/isbn/cover.jpg',
    coverSource: 'tanshu',
    summary: '社会学入门。',
    category: '图书',
    ageRange: '',
    source: 'tanshu',
    sourceId: '9787559677280',
    lookupStatus: 'found',
  }];

  let refreshCalled = false;
  delete require.cache[providersPath];
  require.cache[providersPath] = {
    id: providersPath,
    filename: providersPath,
    loaded: true,
    exports: {
      refreshByIsbn: async (isbn) => {
        refreshCalled = true;
        assert.strictEqual(isbn, '9787559677280');
        return {
          isbn,
          title: '见树又见林',
          author: '艾伦·G.约翰逊',
          publisher: '北京联合出版公司',
          pubDate: '2024',
          listPrice: '88.00',
          coverRemote: 'https://static.tanshuapi.com/isbn/cover-new.jpg',
          category: 'C91',
          summary: '社会学入门。',
          source: 'tanshu',
          sourceId: isbn,
          lookupStatus: 'found',
        };
      },
      lookupByIsbn: async () => {
        throw new Error('should use refreshByIsbn for cached rows');
      },
    },
  };

  delete require.cache[lookupPath];
  const { resolveByIsbn } = require('../cloudfunctions/api/lib/bookLookup');
  const db = {
    collection(name) {
      if (name === 'books') return createCollection(rows);
      if (name === 'book_catalog') return createCollection([]);
      if (name === 'pricing_cache') {
        return {
          doc() {
            return { set: async () => {} };
          },
        };
      }
      throw new Error(`unexpected collection ${name}`);
    },
  };

  const book = await resolveByIsbn(db, '9787559677280');
  assert.strictEqual(refreshCalled, true);
  assert.strictEqual(book.listPrice, '88.00');
  assert.strictEqual(book.category, '文学');
  assert.strictEqual(book.cover, 'cloud://env/book-covers/9787559677280.jpg');
  assert.strictEqual(rows[0].listPrice, '88.00');
  assert.strictEqual(rows[0].category, '文学');

  console.log('book lookup cache refresh ok');
})();
