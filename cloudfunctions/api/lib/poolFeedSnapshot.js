const { uid, nowIso } = require('./utils');
const {
  db, _, safeQuery, getBooksByIds, getUsersByIds, queryRowsByIdChunks,
} = require('./db');
const { CONDITION_LABELS } = require('./pricing');
const { resolveShelfCategory } = require('./bookCategory');
const { formatDisplayBook } = require('./bookCover');
const { formatShipFromField } = require('./shipRegion');
const {
  rankPoolList, applyGiverDensityCap, promoteTopLowPointChildren, createEmptyProfile,
} = require('./poolRecommend');
const { applyOpsPinnedItems, isPinnedActive } = require('./poolOps');

const FEED_META_DOC_ID = '_feed';
const POOL_LIST_MAX = 500;
const POOL_FETCH_BATCH = 100;
const REPORT_HIDE_THRESHOLD = 3;

const CATEGORY_LABELS = {
  children: '童书',
  literature: '文学',
  business: '经管',
  other: '其他',
};

const SHELF_BOOK_CLASS_TO_POOL_CATEGORY = {
  child: 'children',
  children: 'children',
  literature: 'literature',
  social: 'literature',
  business: 'business',
  science: 'business',
  art: 'literature',
  life: 'other',
  other: 'other',
};

const VALUE_RANGES = {
  low: { min: 0, max: 5 },
  middle: { min: 6, max: 10 },
  high: { min: 11, max: 20 },
  premium: { min: 21 },
};

function poolCategoryFromShelfRow(shelfRow = null) {
  return shelfRow ? SHELF_BOOK_CLASS_TO_POOL_CATEGORY[shelfRow.bookClass] || '' : '';
}

function classifyCategory(book = {}, shelfRow = null, drift = {}) {
  if (drift.opsCategory) return drift.opsCategory;
  const shelfCategory = poolCategoryFromShelfRow(shelfRow);
  if (shelfCategory) return shelfCategory;
  const { key } = resolveShelfCategory(book);
  return key === 'child' ? 'children' : key;
}

function matchesValueKey(item, key) {
  if (!key || key === 'all') return true;
  const range = VALUE_RANGES[key];
  if (!range) return true;
  const value = Number(item.coinValue) || 0;
  if (range.min !== undefined && value < range.min) return false;
  if (range.max !== undefined && value > range.max) return false;
  return true;
}

async function fetchAllInPoolDrifts(query) {
  const { total: rawTotal } = await safeQuery('drifts', (col) => col.where(query).count());
  const total = Math.min(rawTotal || 0, POOL_LIST_MAX);
  if (!total) return [];

  const rows = [];
  for (let skip = 0; skip < total; skip += POOL_FETCH_BATCH) {
    const limit = Math.min(POOL_FETCH_BATCH, total - skip);
    const { data } = await safeQuery('drifts', (col) =>
      col.where(query).orderBy('createdAt', 'desc').skip(skip).limit(limit).get());
    rows.push(...(data || []));
    if (!data || data.length < limit) break;
  }
  return rows.slice(0, POOL_LIST_MAX);
}

async function hiddenDriftIdsByReports(driftIds = []) {
  const ids = [...new Set(driftIds.filter(Boolean))];
  if (!ids.length) return new Set();
  const counts = {};
  for (let i = 0; i < ids.length; i += POOL_FETCH_BATCH) {
    const chunk = ids.slice(i, i + POOL_FETCH_BATCH);
    const { data: reports } = await safeQuery('reports', (col) =>
      col.where({
        targetType: 'drift',
        targetId: _.in(chunk),
        status: _.neq('RESOLVED'),
      }).limit(500).get());
    (reports || []).forEach((report) => {
      counts[report.targetId] = (counts[report.targetId] || 0) + 1;
    });
  }
  return new Set(Object.keys(counts).filter((id) => counts[id] >= REPORT_HIDE_THRESHOLD));
}

async function hiddenDriftIdsByCancelledOrders(driftIds = []) {
  const ids = [...new Set(driftIds.filter(Boolean))];
  if (!ids.length) return new Set();
  const hidden = new Set();
  for (let i = 0; i < ids.length; i += POOL_FETCH_BATCH) {
    const chunk = ids.slice(i, i + POOL_FETCH_BATCH);
    const { data: rows } = await safeQuery('drift_orders', (col) =>
      col.where({
        driftId: _.in(chunk),
        status: 'CANCELLED',
        cancelledBy: 'GIVER',
      }).limit(500).get());
    rows.forEach((row) => {
      if (row.driftId) hidden.add(row.driftId);
    });
  }
  return hidden;
}

async function filterVisibleDrifts(drifts = []) {
  const driftIds = drifts.map((drift) => drift._id);
  const [hiddenIds, cancelledIds] = await Promise.all([
    hiddenDriftIdsByReports(driftIds),
    hiddenDriftIdsByCancelledOrders(driftIds),
  ]);
  return drifts.filter((drift) =>
    !drift.opsHidden
    && !hiddenIds.has(drift._id)
    && !cancelledIds.has(drift._id));
}

async function getShelfRowsByIds(ids = []) {
  const shelfBookIds = [...new Set(ids.filter(Boolean))];
  if (!shelfBookIds.length) return {};
  const rows = await queryRowsByIdChunks('shelf_books', shelfBookIds);
  const map = {};
  rows.forEach((row) => { map[row._id] = row; });
  return map;
}

async function getWantedDriftIds(userId, driftIds = []) {
  if (!userId || !driftIds.length) return new Set();
  const unique = [...new Set(driftIds.filter(Boolean))];
  const wanted = new Set();
  for (let i = 0; i < unique.length; i += POOL_FETCH_BATCH) {
    const chunk = unique.slice(i, i + POOL_FETCH_BATCH);
    const { data: rows } = await safeQuery('drift_wants', (col) =>
      col.where({ userId, driftId: _.in(chunk) }).limit(chunk.length).get());
    rows.forEach((row) => wanted.add(row.driftId));
  }
  return wanted;
}

function formatSetInfo(drift = {}) {
  const setCompleteness = drift.setCompleteness || 'unknown';
  const setDescription = String(drift.setDescription || '').trim();
  if (setCompleteness === 'partial') {
    return {
      setBookRisk: !!drift.setBookRisk,
      setCompleteness,
      setDescription,
      setLabel: '非全套',
      setDisplayText: setDescription ? `非全套，${setDescription}` : '非全套',
    };
  }
  if (setCompleteness === 'complete') {
    return {
      setBookRisk: !!drift.setBookRisk,
      setCompleteness,
      setDescription: '',
      setLabel: '套装',
      setDisplayText: '完整套装',
    };
  }
  return {
    setBookRisk: !!drift.setBookRisk,
    setCompleteness,
    setDescription: '',
    setLabel: '',
    setDisplayText: '',
  };
}

function formatPoolBook(book, shelfRow = null) {
  const displayBook = formatDisplayBook(book);
  const category = classifyCategory(book, shelfRow);
  return {
    ...displayBook,
    category: CATEGORY_LABELS[category] || displayBook.category,
  };
}

function formatPoolItem(drift, book, giver, currentUserId = '', wantedDriftIds = new Set(), shelfRow = null) {
  const category = classifyCategory(book, shelfRow, drift);
  const conditionIssueLabels = drift.conditionIssueLabels || [];
  const isAnonymous = !!drift.isAnonymous;
  const isMine = !!currentUserId && drift.userId === currentUserId;
  const wanted = wantedDriftIds.has(drift._id);
  return {
    id: drift._id,
    bookId: drift.bookId,
    condition: drift.condition,
    conditionLabel: CONDITION_LABELS[drift.condition] || drift.condition,
    conditionIssues: drift.conditionIssues || [],
    conditionIssueLabels,
    conditionIssueText: conditionIssueLabels.join('、'),
    images: drift.images || [],
    imageMap: drift.imageMap || {},
    remark: drift.remark || '',
    isAnonymous,
    coinValue: drift.coinValue,
    status: drift.status,
    createdAt: drift.createdAt,
    isMine,
    giverId: drift.userId,
    canClaim: !!currentUserId && !isMine,
    wanted,
    category,
    categoryLabel: CATEGORY_LABELS[category] || CATEGORY_LABELS.other,
    ...formatSetInfo(drift),
    book: formatPoolBook(book, shelfRow),
    giver: {
      nickname: isAnonymous ? '匿名书友' : giver.nickname,
      avatar: isAnonymous ? '' : giver.avatar,
      creditScore: giver.creditScore,
    },
    shipFrom: formatShipFromField(drift.shipRegion),
    opsPinned: isPinnedActive(drift),
    opsPinRank: Number(drift.opsPinRank) || 0,
    opsPinnedUntil: drift.opsPinnedUntil || '',
  };
}

function compactFeedEntry(item = {}, rank = 0) {
  const book = item.book || {};
  return {
    driftId: item.id,
    rank,
    category: item.category,
    coinValue: Number(item.coinValue) || 0,
    condition: item.condition || '',
    giverId: item.giverId || '',
    createdAt: item.createdAt || '',
    opsPinned: !!item.opsPinned,
    opsPinRank: Number(item.opsPinRank) || 0,
    bookTitle: String(book.title || '').toLowerCase(),
    bookAuthor: String(book.author || '').toLowerCase(),
    bookIsbn: String(book.isbn || ''),
  };
}

function applyPlatformFeedRanking(list = []) {
  const profile = createEmptyProfile();
  let ranked = rankPoolList(list, profile, { uidHash: 'platform-feed' });
  ranked = applyGiverDensityCap(ranked);
  ranked = promoteTopLowPointChildren(ranked);
  ranked = applyOpsPinnedItems(ranked);
  return ranked;
}

async function buildRankedPoolFeedItems() {
  const rawDrifts = await fetchAllInPoolDrifts({ status: 'IN_POOL' });
  const drifts = await filterVisibleDrifts(rawDrifts);
  if (!drifts.length) return [];

  const [rawBooks, users, shelfRows] = await Promise.all([
    getBooksByIds(drifts.map((d) => d.bookId)),
    getUsersByIds(drifts.map((d) => d.userId)),
    getShelfRowsByIds(drifts.map((d) => d.shelfBookId)),
  ]);

  const list = drifts
    .filter((d) => rawBooks[d.bookId])
    .map((d) => formatPoolItem(
      d,
      rawBooks[d.bookId],
      users[d.userId] || {},
      '',
      new Set(),
      shelfRows[d.shelfBookId],
    ));

  return applyPlatformFeedRanking(list);
}

async function getPoolFeedMeta() {
  try {
    const { data } = await db.collection('pool_feed_meta').doc(FEED_META_DOC_ID).get();
    return data || null;
  } catch (err) {
    return null;
  }
}

async function rebuildPoolFeedSnapshot(reason = '') {
  const ranked = await buildRankedPoolFeedItems();
  const feedVersion = Date.now();
  const items = ranked.map((item, index) => compactFeedEntry(item, index + 1));
  const payload = {
    feedVersion,
    builtAt: nowIso(),
    reason: reason || 'rebuild',
    total: items.length,
    items,
  };
  try {
    await db.collection('pool_feed_meta').doc(FEED_META_DOC_ID).set({ data: payload });
  } catch (err) {
    const { ensureCollection } = require('./collections');
    await ensureCollection(db, 'pool_feed_meta');
    await db.collection('pool_feed_meta').doc(FEED_META_DOC_ID).set({ data: payload });
  }
  return payload;
}

let rebuildInFlight = null;

function schedulePoolFeedRebuild(reason = '') {
  if (rebuildInFlight) return rebuildInFlight;
  rebuildInFlight = rebuildPoolFeedSnapshot(reason)
    .catch((err) => {
      console.warn('[pool.feed] rebuild failed', err.message || err);
      return null;
    })
    .finally(() => {
      rebuildInFlight = null;
    });
  return rebuildInFlight;
}

function filterSnapshotItems(items = [], data = {}, user = null) {
  const keyword = (data.keyword || '').trim().toLowerCase();
  const category = data.category && data.category !== 'all' ? data.category : '';
  const valueKey = String(data.valueKey || data.value || 'all').trim() || 'all';
  const conditionKey = String(data.condition || 'all').trim() || 'all';
  const claimableOnly = data.claimableOnly === true;

  return items.filter((entry) => {
    if (claimableOnly && user && entry.giverId === user._id) return false;
    if (category && entry.category !== category) return false;
    if (valueKey !== 'all' && !matchesValueKey(entry, valueKey)) return false;
    if (conditionKey !== 'all' && entry.condition !== conditionKey) return false;
    if (keyword) {
      const matched = entry.bookTitle.includes(keyword)
        || entry.bookAuthor.includes(keyword)
        || String(entry.bookIsbn || '').includes(keyword);
      if (!matched) return false;
    }
    return true;
  });
}

async function hydratePoolListItems(entries = [], user = null) {
  if (!entries.length) return [];
  const driftIds = entries.map((entry) => entry.driftId).filter(Boolean);
  const driftRows = await queryRowsByIdChunks('drifts', driftIds);
  const driftMap = {};
  driftRows.forEach((row) => { driftMap[row._id] = row; });
  const drifts = driftIds.map((id) => driftMap[id]).filter(Boolean);
  const [rawBooks, users, shelfRows, wantedDriftIds] = await Promise.all([
    getBooksByIds(drifts.map((d) => d.bookId)),
    getUsersByIds(drifts.map((d) => d.userId)),
    getShelfRowsByIds(drifts.map((d) => d.shelfBookId)),
    getWantedDriftIds(user ? user._id : '', driftIds),
  ]);
  const { cacheBooksForList } = require('./listCoverCache');
  cacheBooksForList(db, rawBooks, 12).catch((err) => console.warn('[pool.list] cover cache skipped', err.message || err));

  return entries
    .map((entry) => {
      const drift = driftMap[entry.driftId];
      if (!drift || drift.status !== 'IN_POOL') return null;
      const book = rawBooks[drift.bookId];
      if (!book) return null;
      return formatPoolItem(
        drift,
        book,
        users[drift.userId] || {},
        user ? user._id : '',
        wantedDriftIds,
        shelfRows[drift.shelfBookId],
      );
    })
    .filter(Boolean);
}

async function listFromPoolFeedSnapshot(data = {}, user = null) {
  let meta = await ensurePoolFeedMeta();
  let items = meta.items || [];
  let result = await listFromRankedEntries(items, data, user);

  if (result.total === 0) {
    const inPoolCount = await countInPoolDrifts();
    if (inPoolCount > 0) {
      console.warn('[pool.feed] snapshot empty while drifts in pool, using live feed', {
        inPoolCount,
        snapshotTotal: meta.total || 0,
      });
      items = await rankedEntriesFromLivePool();
      result = await listFromRankedEntries(items, data, user);
      if (items.length) schedulePoolFeedRebuild('list_backfill');
    }
  }

  return {
    ...result,
    feedVersion: meta.feedVersion || 0,
  };
}

async function countInPoolDrifts() {
  const { total } = await safeQuery('drifts', (col) => col.where({ status: 'IN_POOL' }).count());
  return total || 0;
}

async function ensurePoolFeedMeta() {
  let meta = await getPoolFeedMeta();
  const inPoolCount = await countInPoolDrifts();
  const itemsMissing = !meta || !Array.isArray(meta.items);
  const itemsStaleEmpty = !!(meta && meta.items.length === 0 && inPoolCount > 0);
  if (itemsMissing || itemsStaleEmpty) {
    meta = await rebuildPoolFeedSnapshot(itemsStaleEmpty ? 'empty_stale' : 'list_miss');
  }
  return meta || { items: [], feedVersion: 0, total: 0 };
}

async function rankedEntriesFromLivePool() {
  const ranked = await buildRankedPoolFeedItems();
  return ranked.map((item, index) => compactFeedEntry(item, index + 1));
}

async function listFromRankedEntries(items = [], data = {}, user = null) {
  const page = Math.max(Number(data.page) || 1, 1);
  const size = Math.min(Number(data.size) || 30, 50);
  const filtered = filterSnapshotItems(items, data, user);
  const total = filtered.length;
  const slice = filtered.slice((page - 1) * size, page * size);
  const list = await hydratePoolListItems(slice, user);
  return {
    list,
    page,
    size,
    total,
    hasMore: page * size < total,
  };
}

module.exports = {
  FEED_META_DOC_ID,
  formatPoolItem,
  filterVisibleDrifts,
  getWantedDriftIds,
  getShelfRowsByIds,
  matchesValueKey,
  rebuildPoolFeedSnapshot,
  schedulePoolFeedRebuild,
  getPoolFeedMeta,
  ensurePoolFeedMeta,
  countInPoolDrifts,
  listFromPoolFeedSnapshot,
  applyPlatformFeedRanking,
};
