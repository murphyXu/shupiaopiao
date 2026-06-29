const assert = require('assert');
const {
  normalizeCatalogRecord,
  isCatalogComplete,
  isBooklibCover,
  lookupBookCatalog,
} = require('../cloudfunctions/api/lib/bookCatalogDb');
const { parseCatalogRow, parsePricingRow, mergePricing } = require('./import-book-catalog');

function createCollection(rows, options = {}) {
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
          if (index >= 0) rows[index] = { ...rows[index], ...data };
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
    command: options.command || {
      or() {
        return {};
      },
    },
    RegExp: options.RegExp || (() => ({})),
  };
}

(async () => {
  const sampleLine = '9787559677280,见树又见林,9787559677280,艾伦·G.约翰逊,北京联合出版公司,2024,1,88.00,平装,32开,胶版纸,300页,,简体中文,,社科,社会学入门,,https://booklibimg.kfzimg.com/data/book_lib_img_v2/isbn/1/a/a.jpg,1,1,1,1';
  const parsed = parseCatalogRow(sampleLine);
  assert.ok(parsed, 'should parse a real catalog row');
  assert.strictEqual(parsed.isbn, '9787559677280');
  assert.ok(isBooklibCover(parsed.coverRemote), 'catalog cover should use booklibimg');

  const normalized = normalizeCatalogRecord(parsed);
  assert.strictEqual(normalized.source, 'booklib');
  assert.strictEqual(normalized.coverSource, 'booklib');
  assert.ok(isCatalogComplete(normalized), 'parsed sample should be catalog-complete');

  const pricingLine = '9780451524935,7.0,3.9,10.9,10.9,10.9,73.80,,85,88,1984,George Orwell,Penguin,1961-01,https://example.com/a.jpg';
  const pricing = parsePricingRow(pricingLine);
  assert.strictEqual(pricing.isbn, '9780451524935');
  assert.strictEqual(pricing.medianPrice, 10.9);
  assert.strictEqual(pricing.listPrice, '73.80');

  const merged = mergePricing({ isbn: '9780451524935', listPrice: '' }, new Map([[pricing.isbn, pricing]]));
  assert.strictEqual(merged.listPrice, '73.80');
  assert.strictEqual(merged.medianPrice, 10.9);

  const db = {
    collection(name) {
      assert.strictEqual(name, 'book_catalog');
      return createCollection([{
        isbn: '9780451524935',
        title: '1984',
        author: 'George Orwell',
        publisher: 'Penguin',
        pubDate: '1961-01',
        listPrice: '73.80',
        category: '文学',
        summary: 'classic',
        coverRemote: 'https://booklibimg.kfzimg.com/data/book_lib_img_v2/isbn/1/2576/257634302f1f439e769470e95f48d4fc_0_1_300_300.jpg',
        source: 'booklib',
      }]);
    },
  };
  const hit = await lookupBookCatalog(db, '9780451524935');
  assert.strictEqual(hit.title, '1984');
  assert.strictEqual(hit.source, 'booklib');

  const lookupPath = require.resolve('../cloudfunctions/api/lib/bookLookup');
  const providersPath = require.resolve('../cloudfunctions/api/lib/bookProviders');
  delete require.cache[lookupPath];
  delete require.cache[providersPath];
  require.cache[providersPath] = {
    id: providersPath,
    filename: providersPath,
    loaded: true,
    exports: {
      lookupByIsbn: async () => {
        throw new Error('tanshu should not be called when book_catalog hits');
      },
      refreshByIsbn: async () => null,
      searchByKeyword: async () => [],
    },
  };
  const { resolveByIsbn } = require('../cloudfunctions/api/lib/bookLookup');
  const bookRows = [];
  const catalogRows = [{
    isbn: '9781107694910',
    title: '剑桥雅思官方指南',
    author: 'Pauline',
    publisher: 'Cambridge University Press',
    pubDate: '2014-02',
    listPrice: '138.00',
    category: '语言',
    summary: 'IELTS guide',
    coverRemote: 'https://booklibimg.kfzimg.com/data/book_lib_img_v2/isbn/1/326d/326d35ab7f1ac8a96ee598ee7f54285a_0_1_300_300.jpg',
    source: 'booklib',
  }];
  const lookupDb = {
    collection(name) {
      if (name === 'books') return createCollection(bookRows);
      if (name === 'book_catalog') return createCollection(catalogRows);
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

  const book = await resolveByIsbn(lookupDb, '9781107694910');
  assert.strictEqual(book.source, 'booklib');
  assert.strictEqual(book.title, '剑桥雅思官方指南');

  const coverCache = require('../cloudfunctions/api/lib/coverCache');
  assert.strictEqual(
    coverCache.isAllowedCoverUrl('https://booklibimg.kfzimg.com/data/book_lib_img_v2/isbn/1/a/a.jpg'),
    true,
  );

  console.log('book catalog db ok');
})();
