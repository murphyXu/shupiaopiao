const assert = require('assert');

const indexPath = require.resolve('../cloudfunctions/api/lib/bookProviders/index');
const doubanPath = require.resolve('../cloudfunctions/api/lib/bookProviders/douban');
const tanshuPath = require.resolve('../cloudfunctions/api/lib/bookProviders/tanshu');
const openLibraryPath = require.resolve('../cloudfunctions/api/lib/bookProviders/openLibrary');
const googlePath = require.resolve('../cloudfunctions/api/lib/bookProviders/googleBooks');

function loadProviders(stubs) {
  delete require.cache[indexPath];
  delete require.cache[doubanPath];
  delete require.cache[tanshuPath];
  delete require.cache[openLibraryPath];
  delete require.cache[googlePath];
  require.cache[tanshuPath] = { id: tanshuPath, filename: tanshuPath, loaded: true, exports: stubs.tanshu };
  require.cache[googlePath] = { id: googlePath, filename: googlePath, loaded: true, exports: stubs.google };
  require.cache[openLibraryPath] = { id: openLibraryPath, filename: openLibraryPath, loaded: true, exports: stubs.openLibrary };
  require.cache[doubanPath] = { id: doubanPath, filename: doubanPath, loaded: true, exports: stubs.douban };
  return require('../cloudfunctions/api/lib/bookProviders/index');
}

(async () => {
  const providers = loadProviders({
    tanshu: {
      lookupByIsbn: async () => ({
        isbn: '9787521726473',
        title: '小狗钱钱',
        author: '博多·舍费尔',
        listPrice: '39.80',
        category: '童书',
        coverRemote: '',
        source: 'tanshu',
        lookupStatus: 'found',
      }),
    },
    google: { lookupByIsbn: async () => null },
    openLibrary: { lookupByIsbn: async () => null },
    douban: {
      lookupByIsbn: async () => null,
      lookupCoverByTitle: async () => ({
        isbn: '9787521726473',
        title: '小狗钱钱',
        author: '博多·舍费尔',
        coverRemote: 'https://img1.doubanio.com/view/subject/l/public/s33789389.jpg',
        coverSource: 'douban',
        source: 'douban',
        lookupStatus: 'found',
      }),
    },
  });

  const book = await providers.lookupByIsbn('9787521726473');
  assert.strictEqual(book.title, '小狗钱钱');
  assert.strictEqual(book.listPrice, '39.80');
  assert.ok(book.coverRemote.includes('doubanio.com'), 'lookup should merge douban cover when tanshu has no img');

  const merged = providers.mergeLookupBooks(
    { isbn: '9787521726473', title: '小狗钱钱', listPrice: '39.80', coverRemote: '' },
    { isbn: '9787521726473', coverRemote: 'https://img1.doubanio.com/a.jpg', coverSource: 'douban' },
  );
  assert.strictEqual(merged.coverRemote, 'https://img1.doubanio.com/a.jpg');

  console.log('book lookup cover merge contract ok');
})();
