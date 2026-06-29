const { db, DEFAULT_SHELF_LIMIT } = require('./db');
const { nowIso } = require('./utils');
const { countShelfCapacityUsage } = require('./shelfCapacity');

const DASHBOARD_STALE_MS = 5 * 60 * 1000;

function getShelfLimit(user = {}) {
  return Math.max(Number(user.shelfLimit) || DEFAULT_SHELF_LIMIT, DEFAULT_SHELF_LIMIT);
}

function parseListPrice(value) {
  const match = String(value || '').replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

function formatPriceTotal(value) {
  const rounded = Math.round(Number(value || 0) * 100) / 100;
  return Number.isInteger(rounded) ? rounded : Number(rounded.toFixed(2));
}

async function claimedDriftShelfIds(userId, shelfBookIds = []) {
  const ids = shelfBookIds.filter(Boolean);
  if (!ids.length) return new Set();
  const { data: drifts } = await db.collection('drifts').where({
    userId,
    shelfBookId: db.command.in(ids),
    status: db.command.in(['CLAIMED']),
  }).limit(500).get();
  return new Set(drifts.map((drift) => drift.shelfBookId).filter(Boolean));
}

async function completedDriftShelfIds(userId, shelfBookIds = []) {
  const ids = shelfBookIds.filter(Boolean);
  if (!ids.length) return new Set();
  const { data: drifts } = await db.collection('drifts').where({
    userId,
    shelfBookId: db.command.in(ids),
    status: 'COMPLETED',
  }).limit(500).get();
  return new Set(drifts.map((drift) => drift.shelfBookId).filter(Boolean));
}

async function filterCountableShelfRows(userId, rows = []) {
  if (!rows.length) return [];
  const shelfBookIds = rows.map((row) => row._id);
  const [claimedIds, completedIds] = await Promise.all([
    claimedDriftShelfIds(userId, shelfBookIds),
    completedDriftShelfIds(userId, shelfBookIds),
  ]);
  return rows.filter((row) => !claimedIds.has(row._id) && !completedIds.has(row._id));
}

function isDashboardFresh(cache = {}) {
  if (!cache || !cache.updatedAt) return false;
  return Date.now() - new Date(cache.updatedAt).getTime() < DASHBOARD_STALE_MS;
}

async function computeDashboardSummary(userId, userDoc = {}) {
  const { getBooksByIds } = require('./db');
  const { attachMedianPrices } = require('./pricingCache');
  const { normalizeIsbn } = require('./bookCatalog');

  const { data: allRows } = await db.collection('shelf_books').where({ userId }).limit(500).get();
  const bookIds = [...new Set(allRows.map((row) => row.bookId).filter(Boolean))];
  const books = bookIds.length ? await getBooksByIds(bookIds) : {};
  const isbns = [...new Set(Object.values(books).map((book) => normalizeIsbn(book.isbn)).filter(Boolean))];
  let priceMap = {};
  if (isbns.length) {
    const { data: prices } = await db.collection('pricing_cache').where({ isbn: db.command.in(isbns) }).get();
    prices.forEach((item) => { priceMap[item.isbn] = item; });
  }
  const pricedBooks = {};
  Object.keys(books).forEach((id) => {
    const [priced] = attachMedianPrices([books[id]], priceMap);
    pricedBooks[id] = priced;
  });

  const validRows = allRows.filter((row) => pricedBooks[row.bookId]);
  const countableRows = await filterCountableShelfRows(userId, validRows);
  let totalListPrice = 0;
  countableRows.forEach((row) => {
    const price = parseListPrice((pricedBooks[row.bookId] || {}).listPrice);
    if (price > 0) totalListPrice += price;
  });

  const shelfLimit = getShelfLimit(userDoc);
  const capacityUsed = await countShelfCapacityUsage(db, userId);
  return {
    totalBooks: countableRows.length,
    totalValue: formatPriceTotal(totalListPrice),
    totalListPrice: formatPriceTotal(totalListPrice),
    shelfLimit,
    remainingCapacity: Math.max(shelfLimit - capacityUsed, 0),
    updatedAt: nowIso(),
  };
}

async function refreshShelfDashboardCache(userId) {
  const { data: user } = await db.collection('users').doc(userId).get();
  if (!user) return null;
  const summary = await computeDashboardSummary(userId, user);
  await db.collection('users').doc(userId).update({
    data: { shelfDashboardCache: summary },
  });
  return summary;
}

async function getShelfDashboardForUser(user) {
  if (!user || !user._id) return null;
  if (isDashboardFresh(user.shelfDashboardCache)) return user.shelfDashboardCache;
  return refreshShelfDashboardCache(user._id);
}

function invalidateShelfDashboardCache(userId) {
  if (!userId) return;
  db.collection('users').doc(userId).update({
    data: { shelfDashboardCache: db.command.remove() },
  }).catch((err) => console.warn('[shelf.dashboard] cache invalidate skipped', err.message || err));
}

module.exports = {
  DASHBOARD_STALE_MS,
  isDashboardFresh,
  computeDashboardSummary,
  refreshShelfDashboardCache,
  getShelfDashboardForUser,
  invalidateShelfDashboardCache,
};
