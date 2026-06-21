const assert = require('assert');
const {
  displayCover,
  normalizeBook,
  onCoverError,
} = require('../miniprogram/utils/cover');

assert.strictEqual(
  displayCover('', '9780000000002', 'https://books.google.com/books/content?id=x&img=1'),
  'https://books.google.com/books/content?id=x&img=1',
);

const normalized = normalizeBook({
  isbn: '9780000000002',
  title: 'External Book',
  cover: '',
  coverRemote: 'https://covers.openlibrary.org/b/id/123-M.jpg',
});
assert.strictEqual(normalized.cover, 'https://covers.openlibrary.org/b/id/123-M.jpg');

const calls = [];
onCoverError.call({
  data: {
    books: [{ isbn: '9787533256739', coverRemote: 'https://bad.example/cover.jpg' }],
  },
  setData: (patch) => calls.push(patch),
}, {
  currentTarget: {
    dataset: { index: 0, listKey: 'books', isbn: '9787533256739' },
  },
});
assert.strictEqual(calls[0]['books[0].cover'], '/assets/covers/9787533256739.png');

console.log('cover normalization ok');
