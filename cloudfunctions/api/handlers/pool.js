const { ok, fail } = require('../lib/utils');
const {
  db, _, requireUser, getBookById, getBooksByIds, getUsersByIds, formatBook, safeQuery, getUserByOpenid,
  queryRowsByIdChunks,
} = require('../lib/db');
const { CONDITION_LABELS } = require('../lib/pricing');
const { resolveShelfCategory } = require('../lib/bookCategory');
const { availableCoin, isLightweightBook } = require('../lib/driftPolicy');
const { formatDisplayBook } = require('../lib/bookCover');
const { cacheBooksForList } = require('../lib/listCoverCache');
const { formatShipFromField } = require('../lib/shipRegion');
const { hashUid } = require('../lib/analytics');
const { loadUserInterestProfile } = require('../lib/poolRecommendProfile');
const { rankPoolList, applyGiverDensityCap, promoteTopLowPointChildren } = require('../lib/poolRecommend');
const { applyOpsPinnedItems, isPinnedActive } = require('../lib/poolOps');
const { listFromPoolFeedSnapshot, schedulePoolFeedRebuild } = require('../lib/poolFeedSnapshot');

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

const REPORT_HIDE_THRESHOLD = 3;
const INVALID_DRIFT_STATUSES = ['CANCELLED', 'REJECTED'];
const POOL_LIST_MAX = 500;
const POOL_FETCH_BATCH = 100;

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

function wantIdFor(userId, driftId) {
  return `${userId}_${driftId}`;
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

async function formatWantedList(user) {
  if (!user) return [];
  const { data: wantRows } = await safeQuery('drift_wants', (col) =>
    col.where({ userId: user._id }).orderBy('createdAt', 'desc').limit(100).get());
  const driftIds = wantRows.map((row) => row.driftId);
  if (!driftIds.length) return [];

  const { data: drifts } = await safeQuery('drifts', (col) =>
    col.where({ _id: _.in(driftIds), status: 'IN_POOL' }).get());
  const driftMap = {};
  drifts.forEach((drift) => { driftMap[drift._id] = drift; });
  const activeDrifts = await filterVisibleDrifts(wantRows.map((row) => driftMap[row.driftId]).filter(Boolean));
  if (!activeDrifts.length) return [];

  const [books, users, shelfRows] = await Promise.all([
    getBooksByIds(activeDrifts.map((drift) => drift.bookId)),
    getUsersByIds(activeDrifts.map((drift) => drift.userId)),
    getShelfRowsByIds(activeDrifts.map((drift) => drift.shelfBookId)),
  ]);
  return activeDrifts
    .filter((drift) => books[drift.bookId])
    .map((drift) => ({
      ...formatPoolItem(
        drift,
        books[drift.bookId],
        users[drift.userId] || {},
        user._id,
        new Set([drift._id]),
        shelfRows[drift.shelfBookId],
      ),
      wanted: true,
    }));
}

async function countWanted(userId) {
  if (!userId) return 0;
  const { total } = await safeQuery('drift_wants', (col) => {
    const query = col.where({ userId });
    if (typeof query.count === 'function') return query.count();
    return query.limit(100).get().then(({ data }) => ({ total: (data || []).length }));
  });
  return total || 0;
}

async function countGivenDrifts(userId) {
  if (!userId) return 0;
  const { data: rows } = await safeQuery('drifts', (col) => col.where({
    userId,
    status: _.nin(INVALID_DRIFT_STATUSES),
  }).limit(500).get());
  const cancelledIds = await hiddenDriftIdsByCancelledOrders(rows.map((row) => row._id));
  return rows.filter((row) => !cancelledIds.has(row._id)).length;
}

async function getShelfRowsByIds(ids = []) {
  const shelfBookIds = [...new Set(ids.filter(Boolean))];
  if (!shelfBookIds.length) return {};
  const rows = await queryRowsByIdChunks('shelf_books', shelfBookIds);
  const map = {};
  rows.forEach((row) => { map[row._id] = row; });
  return map;
}

async function getWantDoc(userId, driftId) {
  try {
    const { data } = await db.collection('drift_wants').doc(wantIdFor(userId, driftId)).get();
    return data || null;
  } catch (e) {
    return null;
  }
}

async function formatSameGiverPoolItems(drifts = [], user = null) {
  if (!drifts.length) return [];
  const bookIds = drifts.map((drift) => drift.bookId);
  const [books, shelfRows] = await Promise.all([
    getBooksByIds(bookIds),
    getShelfRowsByIds(drifts.map((drift) => drift.shelfBookId)),
  ]);
  return drifts
    .filter((drift) => books[drift.bookId])
    .map((drift) => {
      const book = books[drift.bookId];
      const shelfRow = shelfRows[drift.shelfBookId];
      return {
        id: drift._id,
        coinValue: drift.coinValue,
        book: formatPoolBook(book, shelfRow),
        lightweightHint: isLightweightBook({
          coinValue: drift.coinValue,
          listPrice: book.listPrice || drift.listPrice,
        }),
      };
    });
}

function formatPoolBook(book, shelfRow = null) {
  const displayBook = formatDisplayBook(book);
  const category = classifyCategory(book, shelfRow);
  return {
    ...displayBook,
    category: CATEGORY_LABELS[category] || displayBook.category,
  };
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

async function list(data, openid) {
  const user = openid ? await getUserByOpenid(openid) : null;
  const claimableOnly = data.claimableOnly === true;
  if (claimableOnly && !user) {
    return ok({
      list: [], page: 1, size: 0, total: 0, hasMore: false, feedVersion: 0,
    });
  }
  try {
    const result = await listFromPoolFeedSnapshot(data, user);
    return ok(result);
  } catch (err) {
    console.error('[pool.list] failed', err);
    return fail(500, '漂流列表加载失败，请稍后重试');
  }
}

async function stats(openid) {
  if (!openid) return ok({
    givenCount: 0, receivedCount: 0, wantCount: 0, availableCoin: 0,
  });
  const user = await getUserByOpenid(openid);
  if (!user) return ok({
    givenCount: 0, receivedCount: 0, wantCount: 0, availableCoin: 0,
  });
  const [
    givenCount,
    { total: receivedCount },
    activeWantedCount,
  ] = await Promise.all([
    countGivenDrifts(user._id),
    safeQuery('drift_orders', (col) => col.where({
      receiverId: user._id,
      status: _.neq('CANCELLED'),
    }).count()),
    countWanted(user._id),
  ]);
  return ok({
    givenCount,
    receivedCount,
    wantCount: activeWantedCount,
    availableCoin: availableCoin(user),
  });
}

async function detail(data, openid) {
  const { data: drift } = await db.collection('drifts').doc(data.id).get();
  if (!drift) return fail(404, '漂流书不存在');
  const visibleDrifts = await filterVisibleDrifts([drift]);
  if (!visibleDrifts.length) return fail(404, '漂流书不存在');
  const book = await getBookById(drift.bookId);
  const shelfRows = await getShelfRowsByIds([drift.shelfBookId]);
  const { data: giverList } = await db.collection('users').where({ _id: drift.userId }).get();
  const giver = giverList[0] || { nickname: '书友', avatar: '', creditScore: 100 };
  const user = openid ? await getUserByOpenid(openid) : null;
  const wantedDriftIds = await getWantedDriftIds(user ? user._id : '', [drift._id]);
  const { data: sameGiverDrifts } = await safeQuery('drifts', (col) =>
    col.where({ userId: drift.userId, status: 'IN_POOL', _id: _.neq(drift._id) }).limit(20).get());
  const visibleSameGiver = await filterVisibleDrifts(sameGiverDrifts);
  const sameGiverCount = visibleSameGiver.length;
  const isAnonymous = !!drift.isAnonymous;
  const sameGiverItems = await formatSameGiverPoolItems(visibleSameGiver, user);
  const sameGiverPool = sameGiverCount ? {
    count: sameGiverCount,
    label: isAnonymous ? `同一书友还有 ${sameGiverCount} 本可接` : `还有 ${sameGiverCount} 本在漂`,
    hint: '这些书尚未与你同包裹；分别申请接漂，地址相同且 48 小时内会自动合并寄出',
    anonymous: isAnonymous,
    items: sameGiverItems,
  } : null;
  const lightweightHint = isLightweightBook({
    coinValue: drift.coinValue,
    listPrice: book ? book.listPrice : drift.listPrice,
  });
  return ok({
    ...formatPoolItem(drift, book, giver, user ? user._id : '', wantedDriftIds, shelfRows[drift.shelfBookId]),
    sameGiverPool,
    lightweightHint,
  });
}

async function toggleWant(openid, data) {
  const user = await requireUser(openid);
  if (!user) return fail(401, '未登录');
  const driftId = data.driftId || data.id || '';
  if (!driftId) return fail(400, '缺少 driftId');
  const { data: drift } = await db.collection('drifts').doc(driftId).get();
  if (!drift || drift.status !== 'IN_POOL') return fail(404, '该书已被领取或不存在');
  const visibleDrifts = await filterVisibleDrifts([drift]);
  if (!visibleDrifts.length) return fail(404, '该书已被领取或不存在');
  if (drift.userId === user._id) return fail(400, '不能想要接漂自己赠送的书');

  const existing = await getWantDoc(user._id, driftId);
  if (existing) {
    await db.collection('drift_wants').doc(wantIdFor(user._id, driftId)).remove();
    return ok({ driftId, wanted: false, wantCount: await countWanted(user._id) });
  }

  await db.collection('drift_wants').doc(wantIdFor(user._id, driftId)).set({
    data: {
      userId: user._id,
      driftId,
      bookId: drift.bookId,
      createdAt: new Date().toISOString(),
    },
  });
  return ok({ driftId, wanted: true, wantCount: await countWanted(user._id) });
}

async function wants(openid) {
  const user = await requireUser(openid);
  if (!user) return fail(401, '未登录');
  const list = await formatWantedList(user);
  return ok({ list, page: 1, size: list.length });
}

module.exports = {
  list, stats, detail, toggleWant, wants, schedulePoolFeedRebuild,
};
