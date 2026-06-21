const { ok, fail } = require('../lib/utils');
const {
  db, _, requireUser, getBookById, getBooksByIds, getUsersByIds, formatBook, safeQuery, getUserByOpenid,
} = require('../lib/db');
const { CONDITION_LABELS } = require('../lib/pricing');
const { normalizeBookCategory } = require('../lib/bookCategory');
const { availableCoin } = require('../lib/driftPolicy');

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

function classifyCategory(book = {}) {
  const sourceCategory = normalizeBookCategory(book.category, book);
  const text = [sourceCategory, book.ageRange, book.title, book.summary].filter(Boolean).join(' ');
  if (/童书|绘本|儿童|亲子|0-3|3-6|6-9|9-12/.test(text)) return 'children';
  if (/文学|小说|诗|散文|名著|传记/.test(text)) return 'literature';
  if (/社科|社会|历史|心理|哲学|政治|法律|教育/.test(text)) return 'social';
  if (/经管|商业|管理|创业|金融|理财|经济/.test(text)) return 'business';
  if (/科普|科学|自然|技术|计算机|医学|工业/.test(text)) return 'science';
  if (/艺术|设计|摄影|音乐|美术/.test(text)) return 'art';
  if (/生活|旅行|美食|家居|育儿/.test(text)) return 'life';
  return 'other';
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

async function filterVisibleDrifts(drifts = []) {
  const hiddenIds = await hiddenDriftIdsByReports(drifts.map((drift) => drift._id));
  return drifts.filter((drift) => !hiddenIds.has(drift._id));
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

  const books = await getBooksByIds(activeDrifts.map((drift) => drift.bookId));
  const users = await getUsersByIds(activeDrifts.map((drift) => drift.userId));
  return activeDrifts
    .filter((drift) => books[drift.bookId])
    .map((drift) => ({ ...formatPoolItem(drift, books[drift.bookId], users[drift.userId] || {}, user._id, new Set([drift._id])), wanted: true }));
}

async function countWanted(userId) {
  const list = await formatWantedList({ _id: userId });
  return list.length;
}

async function getWantDoc(userId, driftId) {
  try {
    const { data } = await db.collection('drift_wants').doc(wantIdFor(userId, driftId)).get();
    return data || null;
  } catch (e) {
    return null;
  }
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
    canClaim: !!currentUserId && !isMine,
    wanted,
    category,
    categoryLabel: CATEGORY_LABELS[category] || CATEGORY_LABELS.other,
    book: formatBook(book),
    giver: {
      nickname: isAnonymous ? '匿名书友' : giver.nickname,
      avatar: isAnonymous ? '' : giver.avatar,
      creditScore: giver.creditScore,
    },
  };
}

async function list(data, openid) {
  const claimableOnly = !!data.claimableOnly;
  const user = openid ? await getUserByOpenid(openid) : null;
  if (claimableOnly && !user) return ok({ list: [], page: 1, size: 0 });

  const query = { status: 'IN_POOL' };
  if (claimableOnly) query.userId = _.neq(user._id);

  const { data: rawDrifts } = await safeQuery('drifts', (col) =>
    col.where(query).orderBy('createdAt', 'desc').limit(100).get());
  const drifts = await filterVisibleDrifts(rawDrifts);
  const bookIds = drifts.map((d) => d.bookId);
  const userIds = drifts.map((d) => d.userId);
  const [books, users, wantedDriftIds] = await Promise.all([
    getBooksByIds(bookIds),
    getUsersByIds(userIds),
    getWantedDriftIds(user ? user._id : '', drifts.map((d) => d._id)),
  ]);

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
    { total: givenCount },
    { total: receivedCount },
    activeWantedCount,
  ] = await Promise.all([
    safeQuery('drifts', (col) => col.where({ userId: user._id }).count()),
    safeQuery('drift_orders', (col) => col.where({ receiverId: user._id }).count()),
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
  return ok(formatPoolItem(drift, book, giver, user ? user._id : '', wantedDriftIds));
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
