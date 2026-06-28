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
const { rankPoolList, applyGiverDensityCap, promoteTopLowPointChildren } = require('../lib/poolRecommend');

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

function poolCategoryFromShelfRow(shelfRow = null) {
  return shelfRow ? SHELF_BOOK_CLASS_TO_POOL_CATEGORY[shelfRow.bookClass] || '' : '';
}

function classifyCategory(book = {}, shelfRow = null) {
  const shelfCategory = poolCategoryFromShelfRow(shelfRow);
  if (shelfCategory) return shelfCategory;
  const { key } = resolveShelfCategory(book);
  return key === 'child' ? 'children' : key;
}

function wantIdFor(userId, driftId) {
  return `${userId}_${driftId}`;
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
  const { data: rows } = await safeQuery('shelf_books', (col) =>
    col.where({ _id: _.in(shelfBookIds) }).limit(500).get());
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
  const category = classifyCategory(book, shelfRow);
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
  };
}

async function list(data, openid) {
  const user = openid ? await getUserByOpenid(openid) : null;
  const claimableOnly = user ? data.claimableOnly !== false : !!data.claimableOnly;
  if (claimableOnly && !user) return ok({ list: [], page: 1, size: 0 });
  const page = Math.max(Number(data.page) || 1, 1);
  const size = Math.min(Number(data.size) || 30, 50);
  const fetchSize = Math.min(size * 2, 100);

  const query = { status: 'IN_POOL' };
  if (claimableOnly) query.userId = _.neq(user._id);

  const { data: rawDrifts } = await safeQuery('drifts', (col) =>
    col.where(query).orderBy('createdAt', 'desc').limit(fetchSize).get());
  const drifts = await filterVisibleDrifts(rawDrifts);
  const bookIds = drifts.map((d) => d.bookId);
  const userIds = drifts.map((d) => d.userId);
  const [rawBooks, users, wantedDriftIds] = await Promise.all([
    getBooksByIds(bookIds),
    getUsersByIds(userIds),
    getWantedDriftIds(user ? user._id : '', drifts.map((d) => d._id)),
  ]);
  const shelfRows = await getShelfRowsByIds(drifts.map((d) => d.shelfBookId));
  cacheBooksForList(db, rawBooks, 12).catch((err) => console.warn('[pool.list] cover cache skipped', err.message || err));
  const books = rawBooks;

  let list = drifts
    .filter((d) => books[d.bookId])
    .map((d) => formatPoolItem(
      d,
      books[d.bookId],
      users[d.userId] || {},
      user ? user._id : '',
      wantedDriftIds,
      shelfRows[d.shelfBookId],
    ));

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
  const isRecommendFeed = !data.category || data.category === 'all';
  if (!keywordActive) {
    const profile = user
      ? await loadUserInterestProfile(user._id, openid)
      : { isColdStart: true, categoryWeights: {}, authorWeights: {}, signalCount: 0 };
    list = rankPoolList(list, profile, { uidHash: hashUid(openid) });
    list = applyGiverDensityCap(list);
    if (isRecommendFeed) list = promoteTopLowPointChildren(list);
  }

  const paged = list.slice((page - 1) * size, page * size);
  return ok({ list: paged, page, size, total: list.length });
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
  list, stats, detail, toggleWant, wants,
};
