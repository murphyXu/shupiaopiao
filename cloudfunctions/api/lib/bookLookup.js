const { uid, nowIso } = require('./utils');
const {
  normalizeIsbn, isValidIsbn,
} = require('./bookCatalog');
const providers = require('./bookProviders');
const {
  lookupBookCatalog,
  searchBookCatalog,
  isCatalogComplete,
} = require('./bookCatalogDb');
const {
  bookMatchesKeyword,
  cleanBookTitle,
  manualNeeded,
} = require('./bookLookupPolicy');
const { normalizeBookCategory, resolveShelfCategory, resolveShelfBookClass, extractSourceClc } = require('./bookCategory');

const PROVIDER_REFRESH_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

function isLegacyStub(book) {
  const isbn = normalizeIsbn(book && book.isbn);
  if (!isbn) return false;
  return (book.title || '') === `图书（${isbn.slice(-6)}）`;
}

function isGenericCategory(category) {
  return !category || ['图书', '童书', '其他', '未分类'].includes(String(category).trim());
}

function needsCoverMetadata(book) {
  const cover = String((book && book.cover) || '').trim();
  if (cover.startsWith('cloud://')) return false;
  if (String((book && book.coverRemote) || '').trim()) return false;
  if (/^https?:\/\//.test(cover)) return false;
  const isbn = normalizeIsbn(book && book.isbn);
  return isValidIsbn(isbn);
}

function isProviderRefreshCoolingDown(book) {
  const refreshedAt = Date.parse(book && book.providerRefreshedAt);
  if (!Number.isFinite(refreshedAt)) return false;
  return Date.now() - refreshedAt < PROVIDER_REFRESH_COOLDOWN_MS;
}

function needsProviderRefresh(book) {
  const isbn = normalizeIsbn(book && book.isbn);
  if (!isValidIsbn(isbn)) return false;
  if (isProviderRefreshCoolingDown(book)) return false;
  if (needsCoverMetadata(book)) return true;
  if (!book.listPrice) return true;
  if (!book.sourceClc && isGenericCategory(book.category)) return true;
  if (isGenericCategory(book.category)) return true;
  return false;
}

async function refreshBookCoverMetadata(db, book) {
  if (!needsCoverMetadata(book)) return book;
  const external = await providers.refreshByIsbn(book.isbn, 1200, db);
  if (!external) return book;
  return upsertBook(db, external) || book;
}

async function refreshBooksCoverMetadata(db, booksMap = {}, limit = 6) {
  const targets = Object.values(booksMap).filter(needsCoverMetadata).slice(0, limit);
  if (!targets.length) return booksMap;
  const next = { ...booksMap };
  for (const book of targets) {
    const updated = await refreshBookCoverMetadata(db, book);
    if (updated && updated._id) next[updated._id] = updated;
  }
  return next;
}

async function refreshCachedBook(db, book) {
  if (!needsProviderRefresh(book)) return book;
  const catalogHit = await lookupBookCatalog(db, book.isbn);
  if (catalogHit && isCatalogComplete(catalogHit)) return upsertBook(db, catalogHit) || book;
  if (typeof providers.refreshByIsbn !== 'function') return book;
  const external = await providers.refreshByIsbn(book.isbn, 1200, db);
  if (!external) return book;
  return upsertBook(db, external) || book;
}

async function syncPricingCache(db, doc) {
  const isbn = normalizeIsbn(doc.isbn);
  if (!isValidIsbn(isbn)) return;
  const median = Number(doc.medianPrice);
  try {
    if (Number.isFinite(median) && median > 0) {
      await db.collection('pricing_cache').doc(isbn).set({
        data: {
          isbn,
          medianPrice: median,
          sources: [{ source: doc.source || 'booklib', price: median }],
        },
      });
      return;
    }
    const { data } = await db.collection('pricing_cache').where({ isbn }).limit(1).get();
    if (data.length) return;
    const priceValue = Number(String(doc.listPrice || '').replace(/[^0-9.]/g, ''));
    if (!priceValue) return;
    await db.collection('pricing_cache').doc(isbn).set({
      data: {
        isbn,
        medianPrice: priceValue,
        sources: [{ source: doc.source || 'default', price: priceValue }],
      },
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
  const sourceClc = extractSourceClc({
    sourceClc: meta.sourceClc,
    category: meta.category,
  }) || (existing[0] && existing[0].sourceClc) || '';
  const bookMeta = {
    ...meta,
    title,
    publisher: meta.publisher || '',
    sourceClc,
  };
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
    coverRemote: meta.coverRemote || (existing[0] && existing[0].coverRemote) || '',
    coverSource: meta.coverSource || meta.source || '',
    summary: meta.summary || '',
    sourceClc,
    category: normalizeBookCategory(meta.category || '图书', bookMeta),
    ageRange: meta.ageRange || '',
    source: meta.source || 'catalog',
    sourceId: meta.sourceId || '',
    lookupStatus: meta.lookupStatus || 'found',
    providerRefreshedAt: meta.providerRefreshedAt
      || ((meta.source && !['catalog', 'manual'].includes(meta.source)) ? nowIso() : ''),
    updatedAt: nowIso(),
  };

  if (!doc.providerRefreshedAt && existing[0] && existing[0].providerRefreshedAt) {
    doc.providerRefreshedAt = existing[0].providerRefreshedAt;
  }

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

  const catalogHit = await lookupBookCatalog(db, clean);
  if (catalogHit) return upsertBook(db, catalogHit);

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

  const catalogBooks = await searchBookCatalog(db, kw, size);
  catalogBooks.forEach((meta) => {
    if (!map.has(meta.isbn)) map.set(meta.isbn, meta);
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
  isProviderRefreshCoolingDown,
  needsCoverMetadata,
  refreshBookCoverMetadata,
  refreshBooksCoverMetadata,
  resolveByIsbn,
  searchBooks,
  PROVIDER_REFRESH_COOLDOWN_MS,
};
