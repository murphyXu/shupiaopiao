const assert = require('assert');
const {
  dedupeBooks,
  cleanBookTitle,
  normalizeSearchText,
  bookMatchesKeyword,
  mergeBookMeta,
  manualNeeded,
} = require('../cloudfunctions/api/lib/bookLookupPolicy');

const duplicateResults = dedupeBooks([
  { isbn: '9781406300406', title: 'Guess How Much I Love You', author: 'Sam McBratney', source: 'google_books' },
  { isbn: '9781406300406', title: 'Guess How Much I Love You', author: 'Sam McBratney', source: 'open_library' },
  { isbn: '', title: 'Guess How Much I Love You', author: 'Sam McBratney', source: 'manual' },
]);
assert.strictEqual(duplicateResults.length, 1);
assert.strictEqual(duplicateResults[0].source, 'google_books');

const merged = mergeBookMeta(
  {
    isbn: '9781406300406', title: 'Old', author: 'Old Author', cover: 'cloud://abc', source: 'cache',
  },
  {
    isbn: '9781406300406', title: 'New', author: 'New Author', coverRemote: 'https://books.google.com/cover.jpg', source: 'google_books',
  },
);
assert.strictEqual(merged.title, 'Old');
assert.strictEqual(merged.cover, 'cloud://abc');
assert.strictEqual(merged.coverRemote, 'https://books.google.com/cover.jpg');

const manual = manualNeeded('9780000000002');
assert.strictEqual(manual.lookupStatus, 'manual_needed');
assert.strictEqual(manual.isbn, '9780000000002');
assert.strictEqual(manual.title, '');

assert.strictEqual(
  cleanBookTitle('见树又见林:社会学作为生活、实践与承诺=Theforestandthetrees:sociologyaslife,practice,andpromise'),
  '见树又见林',
);
assert.strictEqual(cleanBookTitle('郭论'), '郭论');
assert.strictEqual(normalizeSearchText('见树又见林 The Forest'), '见树又见林theforest');
assert.strictEqual(bookMatchesKeyword({
  title: '见树又见林',
  rawTitle: '见树又见林:社会学作为生活、实践与承诺=Theforestandthetrees:sociologyaslife,practice,andpromise',
  author: '(美)艾伦·G.约翰逊著;左安浦译',
  publisher: '北京联合出版公司',
  isbn: '9787559677280',
}, '见树 社会学'), true);
assert.strictEqual(bookMatchesKeyword({
  title: '见树又见林',
  author: '(美)艾伦·G.约翰逊著;左安浦译',
  publisher: '北京联合出版公司',
  isbn: '9787559677280',
}, '左安浦'), true);
assert.strictEqual(bookMatchesKeyword({
  title: '见树又见林',
  author: '(美)艾伦·G.约翰逊著;左安浦译',
  publisher: '北京联合出版公司',
  isbn: '9787559677280',
}, '不存在'), false);

console.log('book lookup policy ok');
