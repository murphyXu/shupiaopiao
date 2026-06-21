const { ok } = require('../lib/utils');
const {
  db, _, formatBook, safeQuery, getUserByOpenid,
} = require('../lib/db');
const {
  buildBooklistFeed,
  buildGeneratedBooklistDetail,
} = require('../lib/booklistContent');

async function loadBooks(limit = 1000) {
  const { data } = await safeQuery('books', (col) => col.limit(limit).get());
  return data.map(formatBook);
}

async function loadShelfBooks(openid) {
  if (!openid) return [];
  const user = await getUserByOpenid(openid);
  if (!user) return [];
  const { data: rows } = await safeQuery('shelf_books', (col) => col.where({ userId: user._id }).limit(100).get());
  const bookIds = rows.map((row) => row.bookId).filter(Boolean);
  if (!bookIds.length) return [];
  const { data: books } = await safeQuery('books', (col) => col.where({ _id: _.in(bookIds) }).get());
  const bookMap = {};
  books.forEach((book) => { bookMap[book._id] = formatBook(book); });
  return rows.map((row) => ({
    id: row._id,
    category: row.category,
    book: bookMap[row.bookId],
  })).filter((row) => row.book);
}

async function feed(openid, data = {}) {
  const [books, shelfBooks] = await Promise.all([
    loadBooks(),
    loadShelfBooks(openid),
  ]);
  return ok(buildBooklistFeed({
    page: data.page,
    size: data.size,
    books,
    shelfBooks,
    signals: data.signals || {},
  }));
}

async function categories() {
  const { data: lists } = await safeQuery('booklists', (col) => col.get());
  const ageGroups = lists.filter((l) => l.type === 'age').map((l) => ({
    id: l._id,
    title: l.title,
    description: l.description,
    ageRange: l.ageRange,
  }));
  const themeLists = lists.filter((l) => l.type === 'theme').map((l) => ({
    id: l._id,
    title: l.title,
    description: l.description,
  }));
  return ok({ ageGroups, themeLists });
}

async function detail(data) {
  if (String(data.id || '').startsWith('gen-')) {
    const books = await loadBooks();
    return ok(buildGeneratedBooklistDetail(data.id, books));
  }

  const { data: list } = await db.collection('booklists').doc(data.id).get();
  if (!list) return ok(null);
  const { data: items } = await db.collection('booklist_items').where({ listId: list._id }).orderBy('sortOrder', 'asc').get();
  const bookIds = items.map((i) => i.bookId);
  const { data: books } = bookIds.length
    ? await db.collection('books').where({ _id: _.in(bookIds) }).get()
    : { data: [] };
  const bookMap = {};
  books.forEach((b) => { bookMap[b._id] = b; });
  const orderedBooks = items.map((i) => bookMap[i.bookId]).filter(Boolean).map(formatBook);
  return ok({
    id: list._id,
    title: list.title,
    description: list.description,
    type: list.type,
    ageRange: list.ageRange || '',
    theme: list.type === 'age' ? '年龄分级' : '主题书单',
    coverText: list.type === 'age' ? `${list.ageRange || ''}岁` : '书单',
    coverStyle: 'background: linear-gradient(135deg, #EAFBF2, #2FBE77);',
    books: orderedBooks,
  });
}

module.exports = { categories, feed, detail };
