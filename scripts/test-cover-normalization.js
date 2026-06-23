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

assert.strictEqual(
  displayCover('local:9787559855022', '9787559855022', 'https://static.tanshuapi.com/a.jpg'),
  'https://static.tanshuapi.com/a.jpg',
);

const normalized = normalizeBook({
  isbn: '9780000000002',
  title: 'External Book',
  cover: '',
  coverRemote: 'https://covers.openlibrary.org/b/id/123-M.jpg',
});
assert.strictEqual(normalized.cover, 'https://covers.openlibrary.org/b/id/123-M.jpg');

const { normalizeBooksDeep } = require('../miniprogram/utils/cover');
const nested = normalizeBooksDeep({
  book: {
    isbn: '9787559855022',
    title: 'Main',
    cover: 'local:9787559855022',
    coverRemote: 'https://static.tanshuapi.com/main.jpg',
  },
  sameGiverPool: {
    items: [{
      id: 'drift-2',
      book: {
        isbn: '9787559855023',
        title: 'Sibling',
        cover: 'local:9787559855023',
        coverRemote: 'https://static.tanshuapi.com/sibling.jpg',
      },
    }],
  },
});
assert.strictEqual(nested.book.cover, 'https://static.tanshuapi.com/main.jpg');
assert.strictEqual(nested.sameGiverPool.items[0].book.cover, 'https://static.tanshuapi.com/sibling.jpg');

(async () => {
  const calls = [];
  const originalWarn = console.warn;
  console.warn = () => {};
  global.wx = {
    cloud: {
      callFunction() {
        return Promise.resolve({ result: { code: 502, msg: 'fail' } });
      },
    },
  };
  onCoverError.call({
    data: {
      books: [{ isbn: '9787559855022', coverRemote: 'https://static.tanshuapi.com/cover.jpg' }],
    },
    setData: (patch) => calls.push(patch),
  }, {
    currentTarget: {
      dataset: { index: 0, listKey: 'books', isbn: '9787559855022' },
    },
  });
  try {
    await new Promise((resolve) => setTimeout(resolve, 20));
  } finally {
    console.warn = originalWarn;
  }
  assert.strictEqual(
    calls[0]['books[0].cover'],
    'https://static.tanshuapi.com/cover.jpg',
  );

  console.log('cover normalization ok');
})();
