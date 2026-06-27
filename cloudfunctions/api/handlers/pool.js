const { ok, fail } = require('../lib/utils');
const {
  db, _, requireUser, getBookById, getBooksByIds, getUsersByIds, formatBook, safeQuery, getUserByOpenid,
} = require('../lib/db');
const { CONDITION_LABELS } = require('../lib/pricing');
const { resolveShelfCategory } = require('../lib/bookCategory');
const { availableCoin, isLightweightBook } = require('../lib/driftPolicy');
const { formatDisplayBook } = require('../lib/bookCover');
const { cacheBooksForList } = require('../lib/listCoverCache');
const { formatShipFromField } = require('../lib/shipRegion');
const { hashUid } = require('../lib/analytics');
const { loadUserInterestProfile } = require('../lib/poolRecommendProfile');
const { rankPoolList, applyGiverDensityCap } = require('../lib/poolRecommend');

const CATEGORY_LABELS = {
  children: '童书',
  literature: '文学',
  social: '社科',
  business: '经管',
  science: '科普',
  art: '艺术',
  life: '生活',
  other: '其他',
};

const REPORT_HIDE_THRESHOLD = 3;
const INVALID_DRIFT_STATUSES = ['CANCELLED', 'REJECTED'];

function classifyCategory(book = {}) {
  const { key } = resolveShelfCategory(book);
  return key === 'child' ? 'children' : key;
}

function wantIdFor(userId, driftId) {
  return `${userId}_${driftId}`;
}

function formatPoolBook(book) {
  return formatDisplayBook(book);
}

async function getWantedDriftIds(userId, driftIds = []) {
  if (!userId || !driftIds.length) return new Set();
  const { data: rows } = await safeQuery('drift_wants', (col) =>
    col.where({ userId, driftId: _.in(driftIds) }).limit(100).get());
  return new Set(rows.map((row) => row.driftId));
}

async function hiddenDriftIdsByReports(driftIds = []) {
  const ids = [...new Set(driftIds.filter(Boolean))];
  if (!ids.length) return new Set();
  const { data: reports } = await safeQuery('reports', (col) =>
    col.where({
      targetType: 'drift',
      targetId: _.in(ids),
      status: _.neq('RESOLVED'),
    }).limit(500).get());
  const counts = {};
  reports.forEach((report) => {
    counts[report.targetId] = (counts[report.targetId] || 0) + 1;
  });
  return new Set(Object.keys(counts).filter((id) => counts[id] >= REPORT_HIDE_THRESHOLD));
}

async function hiddenDriftIdsByCancelledOrders(driftIds = []) {
  const ids = [...new Set(driftIds.filter(Boolean))];
  if (!ids.length) return new Set();
  const { data: rows } = await safeQuery('drift_orders', (col) =>
    col.where({
      driftId: _.in(ids),
      status: 'CANCELLED',
      cancelledBy: _.in(['GIVER', 'SYSTEM']),
    }).limit(500).get());
  return new Set(rows.map((row) => row.driftId).filter(Boolean));
}

async function filterVisibleDrifts(drifts = []) {
  const driftIds = drifts.map((drift) => drift._id);
  const [hiddenIds, cancelledIds] = await Promise.all([
    hiddenDriftIdsByReports(driftIds),
    hiddenDriftIdsByCancelledOrders(driftIds),
  ]);
  return drifts.filter((drift) => !hiddenIds.has(drift._id) && !cancelledIds.has(drift._id));
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

  let books = await getBooksByIds(activeDrifts.map((drift) => drift.bookId));
  const users = await getUsersByIds(activeDrifts.map((drift) => drift.userId));
  return activeDrifts
    .filter((drift) => books[drift.bookId])
    .map((drift) => ({ ...formatPoolItem(drift, books[drift.bookId], users[drift.userId] || {}, user._id, new Set([drift._id])), wanted: true }));
}

async function countWanted(userId) {
  const list = await formatWantedList({ _id: userId });
  return list.length;
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
  let books = await getBooksByIds(bookIds);
  return drifts
    .filter((drift) => books[drift.bookId])
    .map((drift) => {
      const book = books[drift.bookId];
      return {
        id: drift._id,
        coinValue: drift.coinValue,
        book: formatPoolBook(book),
        lightweightHint: isLightweightBook({
          coinValue: drift.coinValue,
          listPrice: book.listPrice || drift.listPrice,
        }),
      };
    });
}

function formatPoolItem(drift, book, giver, currentUserId = '', wantedDriftIds = new Set()) {
  const category = classifyCategory(book);
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
    book: formatPoolBook(book),
    giver: {
      nickname: isAnonymous ? '匿名书友' : giver.nickname,
      avatar: isAnonymous ? '' : giver.avatar,
      creditScore: giver.creditScore,
    },
    shipFrom: formatShipFromField(drift.shipRegion),
  };
}

async function list(data, openid) {
  const user = openid ? await getUserByOpenid(openid) : null;
  const claimableOnly = user ? data.claimableOnly !== false : !!data.claimableOnly;
  if (claimableOnly && !user) return ok({ list: [], page: 1, size: 0 });

  const query = { status: 'IN_POOL' };
  if (claimableOnly) query.userId = _.neq(user._id);

  const { data: rawDrifts } = await safeQuery('drifts', (col) =>
    col.where(query).orderBy('createdAt', 'desc').limit(100).get());
  const drifts = await filterVisibleDrifts(rawDrifts);
  const bookIds = drifts.map((d) => d.bookId);
  const userIds = drifts.map((d) => d.userId);
  const [rawBooks, users, wantedDriftIds] = await Promise.all([
    getBooksByIds(bookIds),
    getUsersByIds(userIds),
    getWantedDriftIds(user ? user._id : '', drifts.map((d) => d._id)),
  ]);
  const books = await cacheBooksForList(db, rawBooks, 12);

  let list = drifts
    .filter((d) => books[d.bookId])
    .map((d) => formatPoolItem(d, books[d.bookId], users[d.userId] || {}, user ? user._id : '', wantedDriftIds));

  const keyword = (data.keyword || '').trim();
  if (keyword) {
    const kw = keyword.toLowerCase();
    list = list.filter((item) =>
      item.book.title.toLowerCase().includes(kw)
      || item.book.author.toLowerCase().includes(kw)
      || item.book.isbn.includes(kw));
  }
  if (data.category && data.category !== 'all') list = list.filter((item) => item.category === data.category);

  const keywordActive = !!keyword;
  if (!keywordActive) {
    const profile = user
      ? await loadUserInterestProfile(user._id, openid)
      : { isColdStart: true, categoryWeights: {}, authorWeights: {}, signalCount: 0 };
    list = rankPoolList(list, profile, { uidHash: hashUid(openid) });
    list = applyGiverDensityCap(list);
  }

  return ok({ list, page: 1, size: list.length });
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
    anonymous: isAnonymous,
    items: sameGiverItems,
  } : null;
  const lightweightHint = isLightweightBook({
    coinValue: drift.coinValue,
    listPrice: book ? book.listPrice : drift.listPrice,
  });
  return ok({
    ...formatPoolItem(drift, book, giver, user ? user._id : '', wantedDriftIds),
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
  list, stats, detail, toggleWant, wants,
};
