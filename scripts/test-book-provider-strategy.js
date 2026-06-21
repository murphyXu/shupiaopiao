const assert = require('assert');

function clearProviderIndex() {
  delete require.cache[require.resolve('../cloudfunctions/api/lib/bookProviders/index')];
}

(async () => {
  clearProviderIndex();
  const { createProviderLookup, shouldUseExternalKeywordSearch } = require('../cloudfunctions/api/lib/bookProviders/index');

  assert.strictEqual(typeof createProviderLookup, 'function');
  assert.strictEqual(shouldUseExternalKeywordSearch('三国演义'), true);
  assert.strictEqual(shouldUseExternalKeywordSearch('Guess How Much I Love You'), true);

  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));

  const lookup = createProviderLookup([
    {
      name: 'fast_tanshu',
      adapter: {
        async lookupByIsbn() {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return { isbn: '9781406300406', title: 'Guess How Much I Love You', source: 'tanshu' };
        },
      },
    },
    {
      name: 'slow_google',
      adapter: {
        async searchByKeyword() {
          await new Promise((resolve) => setTimeout(resolve, 80));
          throw new Error('HTTP_429');
        },
        async lookupByIsbn() {
          await new Promise((resolve) => setTimeout(resolve, 80));
          throw new Error('HTTP_429');
        },
      },
    },
    {
      name: 'open_library',
      adapter: {
        searchKeywords: [],
        async searchByKeyword(keyword) {
          this.searchKeywords.push(keyword);
          await new Promise((resolve) => setTimeout(resolve, 90));
          return [{ isbn: '9781406300406', title: 'Guess How Much I Love You', author: 'Sam McBratney' }];
        },
        async lookupByIsbn() {
          await new Promise((resolve) => setTimeout(resolve, 90));
          return { isbn: '9781406300406', title: 'Guess How Much I Love You', author: 'Sam McBratney' };
        },
      },
    },
  ]);

  const searchStartedAt = Date.now();
  const searchResults = await lookup.searchByKeyword('Guess How Much I Love You', 10);
  assert.strictEqual(searchResults.length, 1);
  assert.strictEqual(searchResults[0].isbn, '9781406300406');
  assert.ok(Date.now() - searchStartedAt < 150, 'search providers should run concurrently');

  const rewriteAdapter = {
    keywords: [],
    async searchByKeyword(keyword) {
      this.keywords.push(keyword);
      return [];
    },
  };
  const rewrittenLookup = createProviderLookup([{
    name: 'douban',
    adapter: rewriteAdapter,
  }]);
  await rewrittenLookup.searchByKeyword('见树又见林:社会学作为生活、实践与承诺=Theforestandthetrees', 10);
  assert.deepStrictEqual(rewriteAdapter.keywords, [
    '见树又见林:社会学作为生活、实践与承诺=Theforestandthetrees',
    '见树又见林',
  ]);

  const chineseProbe = {
    keywords: [],
    async searchByKeyword(keyword) {
      this.keywords.push(keyword);
      return [{ isbn: '9787020008728', title: '三国演义', source: 'douban' }];
    },
  };
  const skippedProbe = {
    keywords: [],
    async searchByKeyword(keyword) {
      this.keywords.push(keyword);
      return [{ isbn: '9780000000000', title: keyword, source: 'open_library' }];
    },
  };
  const chineseLookup = createProviderLookup([
    { name: 'douban', adapter: chineseProbe },
    { name: 'open_library', adapter: skippedProbe },
  ]);
  const chineseResults = await chineseLookup.searchByKeyword('三国演义', 10);
  assert.strictEqual(chineseResults.length, 1);
  assert.strictEqual(chineseResults[0].isbn, '9787020008728');
  assert.deepStrictEqual(chineseProbe.keywords, ['三国演义']);
  assert.deepStrictEqual(skippedProbe.keywords, []);

  const isbnSearchStartedAt = Date.now();
  const isbnSearchResults = await lookup.searchByKeyword('9781406300406', 10);
  assert.strictEqual(isbnSearchResults.length, 1);
  assert.strictEqual(isbnSearchResults[0].source, 'tanshu');
  assert.ok(Date.now() - isbnSearchStartedAt < 70, 'ISBN keyword search should reuse ISBN lookup short-circuit');

  const lookupStartedAt = Date.now();
  const isbnResult = await lookup.lookupByIsbn('9781406300406');
  assert.strictEqual(isbnResult.isbn, '9781406300406');
  assert.strictEqual(isbnResult.source, 'tanshu');
  assert.ok(Date.now() - lookupStartedAt < 70, 'ISBN lookup should short-circuit on first hit');
  assert.strictEqual(warnings.filter((item) => item.includes('fast_tanshu')).length, 0);
  assert.strictEqual(warnings.filter((item) => item.includes('slow_google')).length, 1);

  console.warn = originalWarn;

  console.log('book provider strategy ok');
})();
