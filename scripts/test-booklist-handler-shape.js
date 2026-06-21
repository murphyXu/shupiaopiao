const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { buildBooklistFeed, buildGeneratedBooklistDetail } = require('../cloudfunctions/api/lib/booklistContent');
const { BOOK_CATALOG } = require('../cloudfunctions/api/lib/bookCatalog');

const handlerSource = fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/handlers/booklist.js'), 'utf8');
const routeSource = fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/index.js'), 'utf8');
assert.ok(/async function feed/.test(handlerSource), 'booklist handler should expose feed function');
assert.ok(/module\.exports\s*=\s*\{[^}]*feed/.test(handlerSource.replace(/\n/g, ' ')), 'booklist handler should export feed');
assert.ok(routeSource.includes("'booklist.feed'"), 'api routes should include booklist.feed');

const feed = buildBooklistFeed({
  page: 2,
  size: 6,
  books: BOOK_CATALOG,
  shelfBooks: [{ book: { title: '我爸爸', category: '绘本', ageRange: '3-6' } }],
  signals: { keywords: ['爸爸陪读'] },
});

assert.strictEqual(feed.page, 2);
assert.strictEqual(feed.size, 6);
assert.strictEqual(feed.list.length, 6);
assert.strictEqual(feed.source, 'shelf');
assert.ok(feed.hasMore);
assert.ok(feed.list[0].id.startsWith('gen-'));
assert.ok(feed.list[0].cardTitle);
assert.strictEqual(feed.list[0].reason, undefined);

const detail = buildGeneratedBooklistDetail(feed.list[0].id, BOOK_CATALOG);
assert.strictEqual(detail.id, feed.list[0].id);
assert.strictEqual(detail.type, 'generated');
assert.ok(detail.article.lead);
assert.ok(detail.article.sections.some((section) => section.type === 'book' && section.book));
assert.ok(detail.books.every((book) => book.title && book.isbn));
assert.ok(detail.relatedLists.every((item) => item.id.startsWith('gen-')));

console.log('booklist handler shape ok');
