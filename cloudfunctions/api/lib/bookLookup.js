const { uid, nowIso } = require('./utils');
const {
  normalizeIsbn, isValidIsbn,
} = require('./bookCatalog');
const providers = require('./bookProviders');
const {
  bookMatchesKeyword,
  cleanBookTitle,
  manualNeeded,
} = require('./bookLookupPolicy');
const { normalizeBookCategory } = require('./bookCategory');

function isLegacyStub(book) {
  const isbn = normalizeIsbn(book && book.isbn);
  if (!isbn) return false;
  return (book.title || '') === `图书（${isbn.slice(-6)}）`;
}

function isGenericCategory(category) {
  return !category || ['图书', '童书', '其他', '未分类'].includes(String(category).trim());
}

function needsProviderRefresh(book) {
  const isbn = normalizeIsbn(book && book.isbn);
  if (!isValidIsbn(isbn)) return false;
  return !book.listPrice || isGenericCategory(book.category);
}

async function refreshCachedBook(db, book) {
  if (!needsProviderRefresh(book) || typeof providers.refreshByIsbn !== 'function') return book;
  const external = await providers.refreshByIsbn(book.isbn);
  if (!external) return book;
  return upsertBook(db, external) || book;
}

async function syncPricingCache(db, doc) {
  const priceValue = Number(String(doc.listPrice || '').replace(/[^0-9.]/g, ''));
  if (!priceValue) return;
  try {
    await db.collection('pricing_cache').doc(doc.isbn).set({
      data: { isbn: doc.isbn, medianPrice: priceValue, sources: [{ source: doc.source || 'default', price: priceValue }] },
    });
  } catch (e) {
    // ignore
  }
}

async function upsertBook(db, meta) {
  const isbn = normalizeIsbn(meta.isbn);
  if (!isbn) return null;

  const { data: existing } = await db.collection('books').where({ isbn }).limit(1).get();
  const bookId = existing[0] ? existing[0]._id : uid();

  const cover = (existing[0] && existing[0].cover && existing[0].cover.startsWith('cloud://'))
    ? existing[0].cover
    : (meta.cover || (meta.coverRemote ? meta.coverRemote : `local:${isbn}`));

  const title = cleanBookTitle(meta.title) || meta.title || '未知书名';
  const doc = {
    isbn,
    isbn10: meta.isbn10 || '',
    title,
    rawTitle: meta.rawTitle || (title !== meta.title ? meta.title : ''),
    author: meta.author || '未知作者',
    publisher: meta.publisher || '',
    pubDate: meta.pubDate || '',
    listPrice: meta.listPrice || meta.price || '',
    cover,
    coverRemote: meta.coverRemote || '',
    coverSource: meta.coverSource || meta.source || '',
    summary: meta.summary || '',
    category: normalizeBookCategory(meta.category || '图书', meta),
    ageRange: meta.ageRange || '',
    source: meta.source || 'catalog',
    sourceId: meta.sourceId || '',
    lookupStatus: meta.lookupStatus || 'found',
    updatedAt: nowIso(),
  };

  if (existing[0]) {
    await db.collection('books').doc(bookId).update({ data: doc });
  } else {
    await db.collection('books').doc(bookId).set({ data: doc });
  }
  await syncPricingCache(db, doc);

  const { data: saved } = await db.collection('books').doc(bookId).get();
  return saved;
}

async function resolveByIsbn(db, isbn) {
  const clean = normalizeIsbn(isbn);
  if (!isValidIsbn(clean)) return null;

  const { data } = await db.collection('books').where({ isbn: clean }).limit(1).get();
  if (data.length && !isLegacyStub(data[0])) {
    const refreshed = await refreshCachedBook(db, data[0]);
    const title = cleanBookTitle(refreshed.title);
    if (title && title !== refreshed.title) {
      await db.collection('books').doc(refreshed._id).update({
        data: { title, rawTitle: refreshed.rawTitle || refreshed.title, updatedAt: nowIso() },
      });
      return { ...refreshed, title, rawTitle: refreshed.rawTitle || refreshed.title };
    }
    return refreshed;
  }

  const external = await providers.lookupByIsbn(clean);
  if (external) return upsertBook(db, external);

  return manualNeeded(clean);
}

async function searchBooks(db, keyword, size = 20) {
  const kw = keyword.trim();
  if (!kw) return [];

  const { data: allBooks } = await db.collection('books').limit(1000).get();
  const map = new Map();

  allBooks.forEach((b) => {
    if (bookMatchesKeyword(b, kw)) {
      map.set(b.isbn, b);
    }
  });

  const externalBooks = await providers.searchByKeyword(kw, size);
  externalBooks.forEach((meta) => {
    if (!map.has(meta.isbn)) map.set(meta.isbn, meta);
  });

  const merged = [...map.values()];
  const toUpsert = merged.filter((b) => !b._id && b.lookupStatus !== 'manual_needed').slice(0, 10);
  for (const meta of toUpsert) {
    const saved = await upsertBook(db, meta);
    map.set(saved.isbn, saved);
  }

  return [...map.values()].filter((b) => bookMatchesKeyword(b, kw));
}

module.exports = {
  upsertBook,
  needsProviderRefresh,
  resolveByIsbn,
  searchBooks,
};
