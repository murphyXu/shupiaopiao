const assert = require('assert');
const fs = require('fs');
const path = require('path');

const lookupPath = require.resolve('../cloudfunctions/api/lib/bookLookup');
const providersPath = require.resolve('../cloudfunctions/api/lib/bookProviders');

function loadBookLookup(providersStub) {
  delete require.cache[lookupPath];
  delete require.cache[providersPath];
  require.cache[providersPath] = {
    id: providersPath,
    filename: providersPath,
    loaded: true,
    exports: providersStub,
  };
  return require('../cloudfunctions/api/lib/bookLookup');
}

(async () => {
  const source = fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/lib/bookLookup.js'), 'utf8');
  assert.ok(source.includes('PROVIDER_REFRESH_COOLDOWN_MS'), 'book lookup should define provider refresh cooldown');
  assert.ok(source.includes('providerRefreshedAt'), 'book lookup should track providerRefreshedAt');
  assert.ok(!source.includes('if (!book.sourceClc) return true'), 'missing sourceClc alone should not trigger refresh');

  let refreshCalls = 0;
  const { needsProviderRefresh } = loadBookLookup({
    refreshByIsbn: async () => {
      refreshCalls += 1;
      return null;
    },
    lookupByIsbn: async () => null,
  });

  assert.strictEqual(needsProviderRefresh({
    isbn: '9787559677280',
    category: '社科',
    listPrice: '88.00',
    coverRemote: 'https://static.tanshuapi.com/a.jpg',
    cover: 'local:9787559677280',
  }), false, 'stable category without sourceClc should not need refresh');

  assert.strictEqual(needsProviderRefresh({
    isbn: '9787559677280',
    category: '社科',
    listPrice: '88.00',
    coverRemote: 'https://static.tanshuapi.com/a.jpg',
    providerRefreshedAt: new Date().toISOString(),
  }), false, 'recently refreshed book should stay cool');

  assert.strictEqual(needsProviderRefresh({
    isbn: '9787559677280',
    category: '图书',
    listPrice: '88.00',
    coverRemote: 'https://static.tanshuapi.com/a.jpg',
  }), true, 'generic category should still need refresh');

  assert.strictEqual(refreshCalls, 0, 'needsProviderRefresh must not call providers');
  console.log('book lookup provider refresh contract ok');
})();
