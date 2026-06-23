const assert = require('assert');
const fs = require('fs');

function formatDisplayBook(book) {
  if (!book || !book._id) return {};
  const formatted = {
    id: book._id,
    isbn: book.isbn,
    title: book.title,
    author: book.author,
    cover: book.cover,
    coverRemote: book.coverRemote || '',
  };
  if (typeof formatted.cover === 'string' && formatted.cover.startsWith('cloud://')) return formatted;
  const remote = String(formatted.coverRemote || '').replace(/^http:\/\//, 'https://');
  if (/^https?:\/\//.test(remote)) return { ...formatted, cover: remote };
  const cover = String(formatted.cover || '').replace(/^http:\/\//, 'https://');
  if (/^https?:\/\//.test(cover)) return { ...formatted, cover };
  return formatted;
}

assert.strictEqual(
  formatDisplayBook({
    _id: 'book-1',
    isbn: '9787559855022',
    title: '标准元数据封面',
    author: '作者',
    cover: 'local:9787559855022',
    coverRemote: 'https://static.tanshuapi.com/book-cover.jpg',
  }).cover,
  'https://static.tanshuapi.com/book-cover.jpg',
);

assert.strictEqual(
  formatDisplayBook({
    _id: 'book-2',
    isbn: '9787559855023',
    title: '已有云存储封面',
    author: '作者',
    cover: 'cloud://env/book-covers/9787559855023.jpg',
    coverRemote: 'https://static.tanshuapi.com/old.jpg',
  }).cover,
  'cloud://env/book-covers/9787559855023.jpg',
);

const apiSource = fs.readFileSync(require.resolve('../miniprogram/utils/api.js'), 'utf8');
assert.ok(apiSource.includes('sameGiverPool.items'), 'pool cover enrichment should include same-giver books');
assert.ok(apiSource.includes('drift.orders'), 'order cover enrichment should include received list');

const driftHandler = fs.readFileSync(require.resolve('../cloudfunctions/api/handlers/drift.js'), 'utf8');
assert.ok(driftHandler.includes('formatDisplayBook'), 'drift orders should use standard display book covers');

console.log('nested cover normalization ok');
