const assert = require('assert');

const {
  normalizeImportDoc,
  importBookCatalogBatch,
  MAX_BATCH_SIZE,
} = require('../cloudfunctions/api/lib/bookCatalogImport');

function createDb(initial = {}) {
  const catalog = initial.catalog || [];
  const pricing = initial.pricing || [];
  const db = {
    collection(name) {
      if (name === 'book_catalog') {
        return {
          doc(id) {
            return {
              set: async ({ data }) => {
                const index = catalog.findIndex((row) => row._id === id);
                const next = { _id: id, ...data };
                if (index >= 0) catalog[index] = next;
                else catalog.push(next);
              },
            };
          },
          count: async () => ({ total: catalog.length }),
        };
      }
      if (name === 'pricing_cache') {
        return {
          doc(id) {
            return {
              set: async ({ data }) => {
                const index = pricing.findIndex((row) => row._id === id);
                const next = { _id: id, ...data };
                if (index >= 0) pricing[index] = next;
                else pricing.push(next);
              },
            };
          },
        };
      }
      throw new Error(`unexpected collection ${name}`);
    },
    createCollection: async () => {},
    _catalog: catalog,
    _pricing: pricing,
  };
  return db;
}

(async () => {
  assert.strictEqual(MAX_BATCH_SIZE, 200);

  const doc = normalizeImportDoc({
    isbn: '9780451524935',
    title: '1984',
    author: 'George Orwell',
    publisher: 'Penguin',
    pubDate: '1961-01',
    listPrice: '73.80',
    category: '文学',
    summary: 'classic',
    coverRemote: 'https://booklibimg.kfzimg.com/data/book_lib_img_v2/isbn/1/a/a.jpg',
    medianPrice: 10.9,
  });
  assert.strictEqual(doc.source, 'booklib');

  const db = createDb();
  const result = await importBookCatalogBatch(db, { docs: [doc] });
  assert.strictEqual(result.imported, 1);
  assert.strictEqual(db._catalog.length, 1);
  assert.strictEqual(db._catalog[0].isbn, '9780451524935');
  assert.strictEqual(db._pricing[0].medianPrice, 10.9);

  console.log('book catalog import ok');
})();
