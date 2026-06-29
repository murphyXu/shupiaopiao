const { ok, fail, nowIso } = require('../lib/utils');
const { db, _, formatBook, getBookById, requireUser } = require('../lib/db');
const { attachMedianPrices } = require('../lib/pricingCache');
const { normalizeIsbn, isValidIsbn } = require('../lib/bookCatalog');
const { resolveByIsbn, searchBooks } = require('../lib/bookLookup');
const { cacheRemoteBookCover } = require('../lib/coverCache');
const { assertSafeTextFields } = require('../lib/contentSecurity');
const { buildBookMetadataPatch } = require('../lib/bookMetadata');

const SCAN_LOOKUP_LIMIT = 300;

async function formatBookWithPrice(book) {
  const list = await formatBooksWithPrices([book]);
  return list[0];
}

async function formatBooksWithPrices(books = []) {
  const formatted = books.map(formatBook);
  const isbns = [...new Set(formatted.map((book) => normalizeIsbn(book.isbn)).filter(Boolean))];
  if (!isbns.length) return formatted;
  const { data: prices } = await db.collection('pricing_cache').where({ isbn: db.command.in(isbns) }).get();
  const priceMap = {};
  prices.forEach((item) => { priceMap[item.isbn] = item; });
  return attachMedianPrices(formatted, priceMap);
}

async function enforceScanLookupLimit(openid, source) {
  if (source !== 'scan') return null;
  const user = await requireUser(openid);
  if (!user) return fail(401, '请先登录后扫码录入');
  const used = Number(user.scanLookupCount) || 0;
  if (used >= SCAN_LOOKUP_LIMIT) {
    return fail(429, '扫码次数已达上限，请使用手动添加');
  }
  await db.collection('users').doc(user._id).update({
    data: {
      scanLookupCount: _.inc(1),
      scanLookupLastAt: new Date().toISOString(),
    },
  });
  return null;
}

async function byIsbn(data, openid = '') {
  const payload = typeof data === 'object' && data !== null ? data : { isbn: data };
  const clean = normalizeIsbn(payload.isbn);
  if (!isValidIsbn(clean)) return fail(400, 'ISBN 无效');
  const limitError = await enforceScanLookupLimit(openid, payload.source);
  if (limitError) return limitError;

  const book = await resolveByIsbn(db, clean);
  if (!book || book.lookupStatus === 'manual_needed') {
    return fail(404, '未识别该 ISBN，可手动补录', book || { isbn: clean, lookupStatus: 'manual_needed' });
  }
  return ok(await formatBookWithPrice(book));
}

async function search(data) {
  const keyword = (data.keyword || '').trim();
  const page = Number(data.page) || 1;
  const size = Number(data.size) || 20;
  if (!keyword) return ok({ list: [], total: 0, page, size });

  const isbnLike = normalizeIsbn(keyword);
  if (isbnLike.length >= 10 && isbnLike.length <= 13) {
    const isbnRes = await byIsbn({ isbn: isbnLike });
    if (isbnRes.code === 0) {
      return ok({ list: [isbnRes.data], total: 1, page, size });
    }
  }

  const merged = await searchBooks(db, keyword, size);
  const pageItems = merged.slice((page - 1) * size, page * size);
  const list = await formatBooksWithPrices(pageItems);
  return ok({ list, total: merged.length, page, size });
}

async function detail(data) {
  if (!data.id) return fail(400, '缺少 bookId');
  const book = await getBookById(data.id);
  if (!book) return fail(404, '图书不存在');
  return ok(await formatBookWithPrice(book));
}

async function updateCover(data) {
  const isbn = normalizeIsbn(data.isbn);
  const cover = data.cover || '';
  if (!isbn || !cover.startsWith('cloud://')) return fail(400, '参数无效');

  const { data: rows } = await db.collection('books').where({ isbn }).limit(1).get();
  if (!rows.length) return fail(404, '图书不存在');

  await db.collection('books').doc(rows[0]._id).update({ data: { cover } });
  return ok({ isbn, cover });
}

async function cacheRemoteCover(data) {
  try {
    return ok(await cacheRemoteBookCover(db, data));
  } catch (err) {
    if (err.message === 'INVALID_ISBN' || err.message === 'COVER_URL_NOT_ALLOWED') {
      return fail(400, '封面地址无效');
    }
    if (err.message === 'BOOK_NOT_FOUND') return fail(404, '图书不存在');
    console.warn('[books.cacheRemoteCover]', err.message || err);
    return fail(502, '封面缓存失败');
  }
}

async function updateMetadata(openid, data) {
  const user = await requireUser(openid);
  if (!user) return fail(401, '未登录');
  const shelfBookId = String(data.shelfBookId || '').trim();
  if (!shelfBookId) return fail(400, '缺少书架记录');

  const { data: row } = await db.collection('shelf_books').doc(shelfBookId).get();
  if (!row || row.userId !== user._id) return fail(404, '书架记录不存在');

  const book = await getBookById(row.bookId);
  if (!book) return fail(404, '图书不存在');

  const built = buildBookMetadataPatch(data);
  if (built.error) return fail(400, built.error);

  await assertSafeTextFields(openid, built.textFields);

  await db.collection('books').doc(book._id).update({
    data: { ...built.patch, updatedAt: nowIso() },
  });
  const updated = await getBookById(book._id);
  return ok(await formatBookWithPrice(updated));
}

module.exports = {
  byIsbn, search, detail, updateCover, cacheRemoteCover, updateMetadata,
};
