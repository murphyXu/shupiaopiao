const assert = require('assert');

const httpPath = require.resolve('../cloudfunctions/api/lib/bookProviders/http');
const openLibraryPath = require.resolve('../cloudfunctions/api/lib/bookProviders/openLibrary');

delete require.cache[httpPath];
let apiBooksCalls = 0;
let searchCalls = 0;
require.cache[httpPath] = {
  id: httpPath,
  filename: httpPath,
  loaded: true,
  exports: {
    async getJson(url, timeoutMs) {
      if (url.includes('/api/books?')) {
        apiBooksCalls += 1;
        assert.strictEqual(timeoutMs, 5000);
        return {
          'ISBN:9781406300406': {
            title: 'Guess How Much I Love You',
            authors: [{ name: 'Sam McBratney' }],
          },
        };
      }
      if (url.includes('/search.json?')) {
        searchCalls += 1;
        assert.ok(url.includes('fields='));
        assert.strictEqual(timeoutMs, 5000);
        if (url.includes('title=Guess%20How%20Much%20I%20Love%20You')) {
          throw new Error('REQUEST_TIMEOUT');
        }
        assert.ok(url.includes('q=Guess%20How%20Much%20I%20Love%20You'));
        return {
          docs: [{
            isbn: ['9781406300406'],
            title: 'Guess How Much I Love You',
            author_name: ['Sam McBratney'],
          }],
        };
      }
      throw new Error(`unexpected url ${url}`);
    },
  },
};

delete require.cache[openLibraryPath];
const openLibrary = require('../cloudfunctions/api/lib/bookProviders/openLibrary');

(async () => {
  const book = await openLibrary.lookupByIsbn('9781406300406');
  assert.strictEqual(book.isbn, '9781406300406');

  const isbnResults = await openLibrary.searchByKeyword('9781406300406', 3);
  assert.strictEqual(isbnResults.length, 1);
  assert.strictEqual(isbnResults[0].isbn, '9781406300406');

  const results = await openLibrary.searchByKeyword('Guess How Much I Love You', 3);
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].isbn, '9781406300406');
  assert.strictEqual(apiBooksCalls, 2);
  assert.strictEqual(searchCalls, 2);

  console.log('open library timeouts ok');
})();
