const { normalizeIsbn, isValidIsbn } = require('./bookCatalog');
const { lookupBookCatalog } = require('./bookCatalogDb');
const { shouldTrustCatalogForMerge, assessCatalogRecord } = require('./catalogQuality');
const { upsertBook, needsCoverMetadata } = require('./bookLookup');

function shouldMergeFromCatalog(existing = {}, catalog = {}, force = false) {
  if (String(catalog.source || '') !== 'booklib') return false;
  if (force) return true;
  if (!existing || !existing._id) return true;
  if (String(existing.source || '') !== 'booklib') return true;
  if (!String(existing.listPrice || '').replace(/[^0-9.]/g, '')) return true;
  if (needsCoverMetadata(existing)) return true;
  if (!String(existing.publisher || '').trim()) return true;
  return false;
}

async function refreshBookFromCatalog(db, book = {}, options = {}) {
  const isbn = normalizeIsbn(book.isbn);
  if (!isValidIsbn(isbn)) return { status: 'skipped', reason: 'invalid_isbn', isbn };
  const catalog = await lookupBookCatalog(db, isbn);
  if (!catalog) return { status: 'skipped', reason: 'catalog_miss', isbn };
  if (!shouldMergeFromCatalog(book, catalog, options.force === true)) {
    return { status: 'skipped', reason: 'already_current', isbn, bookId: book._id || '' };
  }
  const trust = shouldTrustCatalogForMerge(book, catalog);
  if (!trust.ok) {
    return {
      status: 'skipped',
      reason: trust.reason,
      isbn,
      bookId: book._id || '',
      existingTitle: book.title || '',
      catalogTitle: catalog.title || '',
    };
  }
  const saved = await upsertBook(db, catalog);
  if (!saved) return { status: 'failed', reason: 'upsert_failed', isbn };
  return { status: 'updated', isbn, bookId: saved._id };
}

async function loadBooksByIds(db, bookIds = []) {
  const ids = [...new Set(bookIds.filter(Boolean))];
  if (!ids.length) return [];
  const _ = db.command;
  const { data } = await db.collection('books').where({ _id: _.in(ids) }).get();
  return data;
}

async function refreshBooksFromCatalog(db, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 200);
  const cursor = String(options.cursor || '').trim();
  const scope = options.scope === 'all' ? 'all' : 'shelf';
  const _ = db.command;

  let books = [];
  let pageCursor = '';
  let pageSize = 0;

  if (scope === 'shelf') {
    let shelfQuery = db.collection('shelf_books').orderBy('_id', 'asc').limit(limit);
    if (cursor) shelfQuery = shelfQuery.where({ _id: _.gt(cursor) });
    const { data: shelfRows } = await shelfQuery.get();
    pageSize = shelfRows.length;
    if (!shelfRows.length) {
      return { processed: 0, updated: 0, skipped: 0, failed: 0, nextCursor: '', scope };
    }
    pageCursor = shelfRows[shelfRows.length - 1]._id;
    const bookIds = [...new Set(shelfRows.map((row) => row.bookId).filter(Boolean))];
    books = await loadBooksByIds(db, bookIds);
  } else {
    let bookQuery = db.collection('books').orderBy('_id', 'asc').limit(limit);
    if (cursor) bookQuery = bookQuery.where({ _id: _.gt(cursor) });
    const { data } = await bookQuery.get();
    books = data;
    pageSize = data.length;
    pageCursor = data.length ? data[data.length - 1]._id : '';
  }

  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const seen = new Set();
  const details = [];

  for (const book of books) {
    if (!book || !book._id || seen.has(book._id)) continue;
    seen.add(book._id);
    const result = await refreshBookFromCatalog(db, book, { force: options.force === true });
    if (result.status === 'updated') updated += 1;
    else if (result.status === 'skipped') skipped += 1;
    else failed += 1;
    details.push(result);
  }

  const processed = seen.size;
  const hasMore = pageSize >= limit;

  return {
    processed,
    updated,
    skipped,
    failed,
    scope,
    nextCursor: hasMore && processed > 0 ? pageCursor : '',
    details: details.slice(0, 10),
  };
}

module.exports = {
  shouldMergeFromCatalog,
  refreshBookFromCatalog,
  refreshBooksFromCatalog,
};
