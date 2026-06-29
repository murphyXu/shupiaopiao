const { normalizeIsbn, isValidIsbn } = require('./bookCatalog');
const { normalizeBookCategory } = require('./bookCategory');
const { assessCatalogRecord } = require('./catalogQuality');

const COLLECTION = 'book_catalog';

function httpsImage(url) {
  if (!url) return '';
  return String(url).replace(/^http:\/\//, 'https://');
}

function isBooklibCover(url) {
  return /booklibimg\.kfzimg\.com/i.test(String(url || ''));
}

function normalizeCatalogRecord(raw = {}) {
  const isbn = normalizeIsbn(raw.isbn);
  const title = String(raw.title || '').trim();
  if (!isValidIsbn(isbn) || !title) return null;

  const coverRemote = httpsImage(raw.coverRemote || raw.cover || '');
  const category = normalizeBookCategory(raw.category || '图书', {
    isbn,
    title,
    summary: raw.summary || '',
    ageRange: raw.ageRange || '',
  });

  const medianPrice = Number(raw.medianPrice);
  return {
    isbn,
    isbn10: raw.isbn10 || (isbn.length === 10 ? isbn : ''),
    title,
    author: String(raw.author || '').trim() || '未知作者',
    publisher: String(raw.publisher || '').trim(),
    pubDate: String(raw.pubDate || '').trim(),
    listPrice: String(raw.listPrice || raw.price || '').trim(),
    summary: String(raw.summary || '').trim(),
    category,
    ageRange: String(raw.ageRange || '').trim(),
    coverRemote,
    coverSource: isBooklibCover(coverRemote) ? 'booklib' : (raw.coverSource || 'booklib'),
    source: 'booklib',
    sourceId: isbn,
    lookupStatus: 'found',
    ...(Number.isFinite(medianPrice) && medianPrice > 0 ? { medianPrice } : {}),
    ...(raw.catalogQuality ? { catalogQuality: raw.catalogQuality } : {}),
    ...(Array.isArray(raw.catalogQualityReasons) ? { catalogQualityReasons: raw.catalogQualityReasons } : {}),
    ...(raw.inventoryOverride ? { inventoryOverride: true } : {}),
  };
}

function isCatalogComplete(book = {}) {
  if (String(book.source || '') !== 'booklib') return false;
  if (!String(book.title || '').trim()) return false;
  if (!String(book.listPrice || '').replace(/[^0-9.]/g, '')) return false;
  if (!String(book.coverRemote || '').trim()) return false;
  const category = String(book.category || '').trim();
  if (!category || ['图书', '童书', '其他', '未分类'].includes(category)) return false;
  if (assessCatalogRecord(book).quality === 'suspect') return false;
  return true;
}

async function lookupBookCatalog(db, isbn) {
  const clean = normalizeIsbn(isbn);
  if (!db || !isValidIsbn(clean)) return null;

  const { data } = await db.collection(COLLECTION).where({ isbn: clean }).limit(1).get();
  if (!data.length) return null;
  return normalizeCatalogRecord(data[0]);
}

async function searchBookCatalog(db, keyword, limit = 20) {
  const kw = String(keyword || '').trim();
  if (!db || !kw) return [];

  const isbn = normalizeIsbn(kw);
  if (isValidIsbn(isbn)) {
    const hit = await lookupBookCatalog(db, isbn);
    return hit ? [hit] : [];
  }

  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const reg = db.RegExp({ regexp: escaped, options: 'i' });
  const { data } = await db.collection(COLLECTION)
    .where(db.command.or([
      { title: reg },
      { author: reg },
    ]))
    .limit(Math.min(limit, 20))
    .get();

  return data
    .map((row) => normalizeCatalogRecord(row))
    .filter(Boolean);
}

module.exports = {
  COLLECTION,
  httpsImage,
  isBooklibCover,
  normalizeCatalogRecord,
  isCatalogComplete,
  lookupBookCatalog,
  searchBookCatalog,
};
