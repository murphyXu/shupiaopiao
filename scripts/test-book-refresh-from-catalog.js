const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  shouldMergeFromCatalog,
} = require('../cloudfunctions/api/lib/bookRefresh');

const catalog = { source: 'booklib', title: '安徒生童话', listPrice: '73.80' };

assert.strictEqual(shouldMergeFromCatalog({}, catalog, true), true);
assert.strictEqual(shouldMergeFromCatalog({ source: 'tanshu', listPrice: '50' }, catalog, false), true);
assert.strictEqual(shouldMergeFromCatalog({ _id: 'book-1', source: 'booklib', listPrice: '73.80', publisher: '人民文学出版社', coverRemote: 'https://booklibimg.kfzimg.com/x.jpg' }, catalog, false), false);

const bookLookup = fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/lib/bookLookup.js'), 'utf8');
assert.ok(bookLookup.includes('doc.medianPrice'), 'syncPricingCache should prefer explicit median price');
assert.ok(bookLookup.includes('if (data.length) return'), 'syncPricingCache should not overwrite existing pricing cache');

const apiIndex = fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/index.js'), 'utf8');
assert.ok(apiIndex.includes('system.refreshBooksFromCatalog'), 'api should expose book refresh route');

const refreshScript = fs.readFileSync(path.join(__dirname, 'refresh-user-books.js'), 'utf8');
assert.ok(refreshScript.includes('force: true'), 'refresh script should force catalog merge');

console.log('book refresh from catalog ok');
