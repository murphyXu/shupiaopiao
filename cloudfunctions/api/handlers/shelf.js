const { ok, fail, uid, nowIso } = require('../lib/utils');
const {
  db, requireUser, getBookById, getBooksByIds, formatBook, DEFAULT_SHELF_LIMIT, settleInviteReward,
} = require('../lib/db');
const { resolveByIsbn } = require('../lib/bookLookup');
const { cleanBookTitle } = require('../lib/bookLookupPolicy');
const { normalizeIsbn } = require('../lib/bookCatalog');
const { attachMedianPrices } = require('../lib/pricingCache');
const { normalizeBookCategory, resolveShelfCategory, resolveShelfBookClass } = require('../lib/bookCategory');
const { assertSafeTextFields } = require('../lib/contentSecurity');
const { availableCoin, SHELF_CAPACITY_PER_COIN } = require('../lib/driftPolicy');
const { CONDITION_LABELS } = require('../lib/pricing');
const { formatDisplayBook } = require('../lib/bookCover');
const { cacheBooksForList } = require('../lib/listCoverCache');
const { countShelfCapacityUsage } = require('../lib/shelfCapacity');
const {
  getShelfDashboardForUser,
  invalidateShelfDashboardCache,
  refreshShelfDashboardCache,
} = require('../lib/shelfDashboard');

const READING_STATUS_LABELS = {
  reading: '在读',
  read: '已读',
  want_read: '想读',
};

const BOOK_CLASS_LABELS = {
  child: '童书',
  literature: '文学',
  business: '经管',
  other: '其他',
};

const LEGACY_BOOK_CLASS_TO_PUBLIC = {
  children: 'child',
  social: 'literature',
  science: 'business',
  art: 'literature',
  life: 'other',
};

const DEFAULT_LOCATION = { key: 'shelf_1', name: '默认书架 1' };

const BOOK_CLASS_FILTER_MAP = {
  child: 'child',
  literature: 'literature',
  business: 'business',
  other: 'other',
  童书: 'child',
  文学: 'literature',
  经管: 'business',
  其他: 'other',
};

function resolveBookClassFilter(value = '') {
  const key = String(value || '').trim();
  if (!key || key === 'all') return '';
  return BOOK_CLASS_FILTER_MAP[key] || '';
}

const ACTIVE_SHELF_DRIFT_STATUSES = ['PENDING_REVIEW', 'IN_POOL', 'CLAIMED'];
const CLAIMED_SHELF_DRIFT_STATUSES = ['CLAIMED'];
const CANCELABLE_SHELF_DRIFT_STATUSES = ['PENDING_REVIEW', 'IN_POOL'];
const SHELF_DRIFT_STATUS_LABELS = {
  PENDING_REVIEW: '待审核',
  IN_POOL: '待领取',
  CLAIMED: '已被领取',
};

function getShelfLimit(user = {}) {
  return Math.max(Number(user.shelfLimit) || DEFAULT_SHELF_LIMIT, DEFAULT_SHELF_LIMIT);
}

function transactionDocData(snap) {
  const data = snap && snap.data;
  if (Array.isArray(data)) return data[0] || null;
  return data || null;
}

function parseListPrice(value) {
  const match = String(value || '').replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

function formatPriceTotal(value) {
  const rounded = Math.round(Number(value || 0) * 100) / 100;
  return Number.isInteger(rounded) ? rounded : Number(rounded.toFixed(2));
}

async function getShelfUsage(userId) {
  return countShelfCapacityUsage(db, userId);
}

async function ensureShelfCapacity(user) {
  const used = await getShelfUsage(user._id);
  const shelfLimit = getShelfLimit(user);
  if (used >= shelfLimit) {
    return fail(400, '书架容量已满，可用公益积分兑换更多额度');
  }
  return null;
}

function normalizeReadingStatus(value, legacyCategory) {
  const key = value || legacyCategory;
  return READING_STATUS_LABELS[key] ? key : 'want_read';
}

function inferBookClass(book = {}, legacyCategory = '') {
  if (legacyCategory === 'child') return 'child';
  return resolveShelfBookClass(book);
}

function normalizeBookClass(value, fallback = 'other') {
  const key = LEGACY_BOOK_CLASS_TO_PUBLIC[value] || value || fallback;
  return BOOK_CLASS_LABELS[key] ? key : fallback;
}

function normalizeShelfMeta(row = {}, book = {}, data = {}) {
  const readingStatus = normalizeReadingStatus(data.readingStatus || row.readingStatus, data.category || row.category);
  const resolvedBookClass = resolveShelfBookClass(book);
  const bookClass = normalizeBookClass(data.bookClass || row.bookClass, resolvedBookClass || 'other');
  const shelfLocationKey = data.shelfLocationKey || row.shelfLocationKey || DEFAULT_LOCATION.key;
  const shelfLocationName = String(data.shelfLocationName || row.shelfLocationName || DEFAULT_LOCATION.name).trim() || DEFAULT_LOCATION.name;
  return {
    readingStatus,
    readingStatusLabel: READING_STATUS_LABELS[readingStatus] || READING_STATUS_LABELS.want_read,
    bookClass,
    bookClassLabel: BOOK_CLASS_LABELS[bookClass] || BOOK_CLASS_LABELS.other,
    shelfLocationKey,
    shelfLocationName,
  };
}

function formatActiveDrift(drift) {
  if (!drift) return null;
  const canEdit = ['PENDING_REVIEW', 'IN_POOL'].includes(drift.status);
  return {
    id: drift._id,
    status: drift.status,
    statusLabel: SHELF_DRIFT_STATUS_LABELS[drift.status] || drift.status,
    canCancel: CANCELABLE_SHELF_DRIFT_STATUSES.includes(drift.status),
    canEdit,
    condition: drift.condition || 'like_new',
    conditionLabel: CONDITION_LABELS[drift.condition] || drift.condition || '9成新',
    conditionIssues: drift.conditionIssues || [],
    conditionIssueLabels: drift.conditionIssueLabels || [],
    conditionIssueText: (drift.conditionIssueLabels || []).join('、'),
    coinValue: Number(drift.coinValue) || 0,
    systemCoinValue: Number(drift.systemCoinValue) || 0,
    listPrice: Number(drift.listPrice) || 0,
  };
}

function formatShelfBook(row, book, activeDrift = null, driftedOut = false) {
  const resolvedCategory = resolveShelfCategory(book);
  const meta = normalizeShelfMeta(row, book);
  const sourceCategory = resolvedCategory.label || meta.bookClassLabel || '未分类';
  const displayCategory = meta.bookClassLabel || sourceCategory || '未分类';
  const formattedBook = {
    ...formatDisplayBook(book),
    category: displayCategory,
  };
  return {
    id: row._id,
    bookId: row.bookId,
    category: meta.readingStatus,
    readingStatus: meta.readingStatus,
    readingStatusLabel: meta.readingStatusLabel,
    bookClass: meta.bookClass,
    bookClassLabel: meta.bookClassLabel,
    sourceCategory,
    displayCategory,
    shelfLocationKey: meta.shelfLocationKey,
    shelfLocationName: meta.shelfLocationName,
    status: row.status,
    rating: row.rating,
    note: row.note,
    noteUpdatedAt: row.noteUpdatedAt || row.createdAt,
    createdAt: row.createdAt,
    activeDrift: formatActiveDrift(activeDrift),
    canPublishDrift: !activeDrift,
    driftedOut: !!driftedOut,
    book: formattedBook,
  };
}

async function activeDriftsByShelfBook(userId, shelfBookIds = []) {
  const ids = shelfBookIds.filter(Boolean);
  if (!ids.length) return {};
  const { data: drifts } = await db.collection('drifts').where({
    userId,
    shelfBookId: db.command.in(ids),
    status: db.command.in(ACTIVE_SHELF_DRIFT_STATUSES),
  }).limit(500).get();
  const sorted = drifts.slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const map = {};
  sorted.forEach((drift) => {
    if (!map[drift.shelfBookId]) map[drift.shelfBookId] = drift;
  });
  return map;
}

async function shelfDriftContext(userId, shelfBookIds = []) {
  const ids = shelfBookIds.filter(Boolean);
  if (!ids.length) return { activeDrifts: {}, completedIds: new Set() };
  const [activeDrifts, completedIds] = await Promise.all([
    activeDriftsByShelfBook(userId, ids),
    completedDriftShelfIds(userId, ids),
  ]);
  return { activeDrifts, completedIds };
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

async function claimedDriftShelfIds(userId, shelfBookIds = []) {
  const ids = shelfBookIds.filter(Boolean);
  if (!ids.length) return new Set();
  const { data: drifts } = await db.collection('drifts').where({
    userId,
    shelfBookId: db.command.in(ids),
    status: db.command.in(CLAIMED_SHELF_DRIFT_STATUSES),
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

async function enrichBookPrices(bookList = []) {
  const isbns = [...new Set(bookList.map((book) => normalizeIsbn(book.isbn)).filter(Boolean))];
  if (!isbns.length) return bookList;
  const { data: prices } = await db.collection('pricing_cache').where({ isbn: db.command.in(isbns) }).get();
  const priceMap = {};
  prices.forEach((item) => { priceMap[item.isbn] = item; });
  return attachMedianPrices(bookList, priceMap);
}

async function booksByIdsWithPrices(bookIds = []) {
  const ids = [...new Set(bookIds.filter(Boolean))];
  if (!ids.length) return {};
  const books = await getBooksByIds(ids);
  const enriched = await enrichBookPrices(Object.values(books));
  const map = {};
  enriched.forEach((book) => { map[book._id] = book; });
  return map;
}

function listPriceForBook(book = {}) {
  return parseListPrice(book.listPrice);
}

async function buildCollectionStats(userId, allShelfRows = []) {
  const books = await booksByIdsWithPrices(allShelfRows.map((row) => row.bookId));
  const validRows = allShelfRows.filter((row) => books[row.bookId]);
  const countableRows = await filterCountableShelfRows(userId, validRows);
  let totalListPrice = 0;
  countableRows.forEach((row) => {
    const price = listPriceForBook(books[row.bookId] || {});
    if (price > 0) totalListPrice += price;
  });
  return {
    totalBooks: countableRows.length,
    totalValue: formatPriceTotal(totalListPrice),
    totalListPrice: formatPriceTotal(totalListPrice),
    occupiedSlots: validRows.length,
  };
}

async function dashboardSummaryFromRows(user, allShelfRows = []) {
  const stats = await buildCollectionStats(user._id, allShelfRows);
  const shelfLimit = getShelfLimit(user);
  const capacityUsed = await getShelfUsage(user._id);
  return {
    totalBooks: stats.totalBooks,
    totalValue: stats.totalValue,
    totalListPrice: stats.totalListPrice,
    shelfLimit,
    remainingCapacity: Math.max(shelfLimit - capacityUsed, 0),
  };
}

async function healStaleBookClassification(rows = [], books = {}) {
  const shelfPatches = [];
  const bookPatches = [];
  rows.forEach((row) => {
    const book = books[row.bookId];
    if (!book) return;
    const resolved = resolveShelfCategory(book);
    const normalizedRowClass = normalizeBookClass(row.bookClass, '');
    const hasShelfClass = !!(normalizedRowClass && BOOK_CLASS_LABELS[normalizedRowClass]);
    if (!row.bookClassManual) {
      if (!hasShelfClass && row.bookClass !== resolved.key) {
        shelfPatches.push({ id: row._id, bookClass: resolved.key });
        row.bookClass = resolved.key;
      } else if (!hasShelfClass) {
        row.bookClass = resolved.key;
      } else if (row.bookClass !== normalizedRowClass) {
        shelfPatches.push({ id: row._id, bookClass: normalizedRowClass });
        row.bookClass = normalizedRowClass;
      }
    }
    const targetLabel = (row.bookClassManual || hasShelfClass)
      ? (BOOK_CLASS_LABELS[normalizeBookClass(row.bookClass, resolved.key)] || resolved.label)
      : resolved.label;
    if (book._id && book.category !== targetLabel) {
      bookPatches.push({ id: book._id, category: targetLabel });
      book.category = targetLabel;
    }
  });
  const limit = 15;
  await Promise.all([
    ...shelfPatches.slice(0, limit).map((patch) => db.collection('shelf_books').doc(patch.id).update({
      data: { bookClass: patch.bookClass },
    })),
    ...bookPatches.slice(0, limit).map((patch) => db.collection('books').doc(patch.id).update({
      data: { category: patch.category, updatedAt: nowIso() },
    })),
  ]);
}

async function list(openid, data) {
  const user = await requireUser(openid);
  if (!user) return fail(401, '未登录');
  const includeDashboard = data.includeDashboard === true;
  const page = Math.max(Number(data.page) || 1, 1);
  const size = Math.min(Number(data.size) || 30, 100);
  const readingStatus = data.readingStatus || data.category;
  const bookClass = resolveBookClassFilter(data.bookClass || data.bookClassChip);
  const shelfLocationName = String(data.shelfLocationName || '').trim();
  const keyword = String(data.searchKeyword || '').trim().toLowerCase();

  const where = { userId: user._id };
  if (readingStatus && readingStatus !== 'all') {
    where.readingStatus = normalizeReadingStatus(readingStatus);
  }
  if (bookClass) where.bookClass = bookClass;
  if (shelfLocationName && shelfLocationName !== 'all') where.shelfLocationName = shelfLocationName;

  let rows = [];
  let total = 0;
  if (keyword) {
    const { data: allRows } = await db.collection('shelf_books').where(where).orderBy('createdAt', 'desc').limit(500).get();
    const books = allRows.length
      ? await booksByIdsWithPrices(allRows.map((row) => row.bookId))
      : {};
    rows = allRows.filter((row) => {
      const book = books[row.bookId];
      if (!book) return false;
      const text = [
        book.title,
        book.rawTitle,
        book.author,
        book.isbn,
        book.publisher,
        row.shelfLocationName,
      ].filter(Boolean).join(' ').toLowerCase();
      return text.includes(keyword);
    });
    total = rows.length;
    rows = rows.slice((page - 1) * size, page * size);
  } else {
    const { total: rowTotal } = await db.collection('shelf_books').where(where).count();
    total = rowTotal || 0;
    const { data: pageRows } = await db.collection('shelf_books').where(where)
      .orderBy('createdAt', 'desc')
      .skip((page - 1) * size)
      .limit(size)
      .get();
    rows = pageRows || [];
  }

  const pageRows = rows;
  const bookIds = pageRows.map((r) => r.bookId);
  const books = {};
  if (bookIds.length) {
    const { data: bookList } = await db.collection('books').where({ _id: db.command.in(bookIds) }).get();
    const pricedBooks = await enrichBookPrices(bookList);
    const rawMap = {};
    pricedBooks.forEach((b) => { rawMap[b._id] = b; });
    cacheBooksForList(db, rawMap, 12).catch((err) => console.warn('[shelf.list] cover cache skipped', err.message || err));
    Object.keys(rawMap).forEach((id) => { books[id] = rawMap[id]; });
  }
  const shelfBookIds = pageRows.map((row) => row._id);
  const { activeDrifts, completedIds } = await shelfDriftContext(user._id, shelfBookIds);
  const payload = {
    list: pageRows.filter((r) => books[r.bookId]).map((r) => formatShelfBook(
      r,
      books[r.bookId],
      activeDrifts[r._id],
      completedIds.has(r._id),
    )),
    total,
    page,
    size,
    hasMore: page * size < total,
  };
  if (includeDashboard) payload.dashboard = await getShelfDashboardForUser(user);
  return ok(payload);
}

async function detail(openid, data) {
  const user = await requireUser(openid);
  if (!user) return fail(401, '未登录');
  const id = String(data.id || '').trim();
  if (!id) return fail(400, '缺少书架记录');
  const { data: row } = await db.collection('shelf_books').doc(id).get();
  if (!row || row.userId !== user._id) return fail(404, '书架记录不存在');
  const books = await booksByIdsWithPrices([row.bookId]);
  const book = books[row.bookId];
  if (!book) return fail(404, '图书不存在');
  const { activeDrifts, completedIds } = await shelfDriftContext(user._id, [id]);
  return ok(formatShelfBook(row, book, activeDrifts[id], completedIds.has(id)));
}

async function publishCandidates(openid, data) {
  const user = await requireUser(openid);
  if (!user) return fail(401, '未登录');
  const page = Math.max(Number(data.page) || 1, 1);
  const size = Math.min(Number(data.size) || 50, 100);
  const { total: rowTotal } = await db.collection('shelf_books').where({ userId: user._id }).count();
  const { data: pageRows } = await db.collection('shelf_books').where({ userId: user._id })
    .orderBy('createdAt', 'desc')
    .skip((page - 1) * size)
    .limit(size)
    .get();
  const bookIds = pageRows.map((row) => row.bookId).filter(Boolean);
  const books = bookIds.length ? await booksByIdsWithPrices(bookIds) : {};
  const shelfBookIds = pageRows.map((row) => row._id);
  const { activeDrifts } = await shelfDriftContext(user._id, shelfBookIds);
  const list = pageRows
    .filter((row) => books[row.bookId] && !activeDrifts[row._id])
    .map((row) => formatShelfBook(row, books[row.bookId], null, false));
  return ok({
    list,
    total: rowTotal || 0,
    page,
    size,
    hasMore: page * size < (rowTotal || 0),
  });
}

async function findShelfRowByBookId(userId, bookId) {
  const { data: rows } = await db.collection('shelf_books').where({ userId, bookId }).limit(1).get();
  return rows[0] || null;
}

async function add(openid, data) {
  const user = await requireUser(openid);
  if (!user) return fail(401, '未登录');
  await assertSafeTextFields(openid, {
    shelfLocationName: data.shelfLocationName,
  });
  let bookId = data.bookId;
  if (!bookId && data.isbn) {
    const book = await resolveByIsbn(db, data.isbn);
    if (!book) return fail(404, '图书不存在');
    bookId = book._id;
  }
  if (!bookId) return fail(400, '缺少 bookId 或 isbn');

  const existingRow = await findShelfRowByBookId(user._id, bookId);
  if (existingRow) {
    if (data.fromScanPublish) {
      const book = await getBookById(bookId);
      return ok(formatShelfBook(existingRow, book));
    }
    return fail(400, '该书已在书架中');
  }

  const capacityError = await ensureShelfCapacity(user);
  if (capacityError) return capacityError;

  const book = await getBookById(bookId);
  const scanPublishDefaults = data.fromScanPublish
    ? {
      readingStatus: 'read',
      category: 'read',
      shelfLocationKey: DEFAULT_LOCATION.key,
      shelfLocationName: DEFAULT_LOCATION.name,
    }
    : {};
  const meta = normalizeShelfMeta({}, book, { ...scanPublishDefaults, ...data });
  const id = uid();
  await db.collection('shelf_books').doc(id).set({
    data: {
      userId: user._id,
      bookId,
      purpose: 'normal',
      category: meta.readingStatus,
      readingStatus: meta.readingStatus,
      bookClass: meta.bookClass,
      shelfLocationKey: meta.shelfLocationKey,
      shelfLocationName: meta.shelfLocationName,
      status: 'unread',
      rating: 0,
      note: '',
      createdAt: nowIso(),
    },
  });
  await settleInviteReward(user, 'shelf_add');
  invalidateShelfDashboardCache(user._id);
  const { data: row } = await db.collection('shelf_books').doc(id).get();
  return ok(formatShelfBook(row, book));
}

async function findOrCreateManualBook(data) {
  const rawTitle = String(data.title || '').trim();
  const title = cleanBookTitle(rawTitle) || rawTitle;
  if (!title) return null;
  const author = String(data.author || '').trim();
  if (!author) return null;

  const isbn = normalizeIsbn(data.isbn);
  if (isbn) {
    const { data: rows } = await db.collection('books').where({ isbn }).limit(1).get();
    if (rows.length) return rows[0];
  }

  const query = isbn
    ? { isbn }
    : { title, author, source: 'manual' };
  const { data: existing } = await db.collection('books').where(query).limit(1).get();
  if (existing.length) return existing[0];

  const id = uid();
  const bookClass = normalizeBookClass(data.bookClass, 'other');
  const doc = {
    isbn: isbn || `manual-${id.slice(0, 8)}`,
    isbn10: '',
    title,
    rawTitle: title !== rawTitle ? rawTitle : '',
    author,
    publisher: String(data.publisher || '').trim(),
    pubDate: String(data.pubDate || '').trim(),
    listPrice: String(data.listPrice || '').trim(),
    cover: '',
    coverRemote: '',
    coverSource: '',
    summary: '',
    category: BOOK_CLASS_LABELS[bookClass] || '图书',
    ageRange: '',
    source: 'manual',
    sourceId: '',
    lookupStatus: 'found',
    updatedAt: nowIso(),
  };
  await db.collection('books').doc(id).set({ data: doc });
  return { _id: id, ...doc };
}

async function manualAdd(openid, data) {
  const user = await requireUser(openid);
  if (!user) return fail(401, '未登录');
  if (!String(data.title || '').trim()) return fail(400, '请填写书名');
  if (!String(data.author || '').trim()) return fail(400, '请填写作者');
  await assertSafeTextFields(openid, {
    title: data.title,
    author: data.author,
    publisher: data.publisher,
    shelfLocationName: data.shelfLocationName,
  });
  const capacityError = await ensureShelfCapacity(user);
  if (capacityError) return capacityError;
  const book = await findOrCreateManualBook(data);
  if (!book) return fail(400, '请填写书名');

  const { total } = await db.collection('shelf_books').where({ userId: user._id, bookId: book._id }).count();
  if (total > 0) return fail(400, '该书已在书架中');

  const meta = normalizeShelfMeta({}, book, data);
  const id = uid();
  await db.collection('shelf_books').doc(id).set({
    data: {
      userId: user._id,
      bookId: book._id,
      category: meta.readingStatus,
      readingStatus: meta.readingStatus,
      bookClass: meta.bookClass,
      shelfLocationKey: meta.shelfLocationKey,
      shelfLocationName: meta.shelfLocationName,
      status: 'unread',
      rating: 0,
      note: '',
      createdAt: nowIso(),
    },
  });
  await settleInviteReward(user, 'shelf_manual_add');
  invalidateShelfDashboardCache(user._id);
  const { data: row } = await db.collection('shelf_books').doc(id).get();
  return ok(formatShelfBook(row, book));
}

async function update(openid, data) {
  const user = await requireUser(openid);
  if (!user) return fail(401, '未登录');
  const { data: row } = await db.collection('shelf_books').doc(data.id).get();
  if (!row || row.userId !== user._id) return fail(404, '书架记录不存在');
  const patch = {};
  if (data.status !== undefined) patch.status = data.status;
  if (data.rating !== undefined) patch.rating = data.rating;
  // 读书笔记 note 模块已下线（规避社交-笔记类目），不再接收与检测 note 字段。
  let book = await getBookById(row.bookId);
  const nextMeta = normalizeShelfMeta(row, book, data);
  if (data.category !== undefined || data.readingStatus !== undefined) {
    patch.category = nextMeta.readingStatus;
    patch.readingStatus = nextMeta.readingStatus;
  }
  if (data.bookClass !== undefined) {
    patch.bookClass = nextMeta.bookClass;
    patch.bookClassManual = true;
    const categoryLabel = BOOK_CLASS_LABELS[nextMeta.bookClass] || BOOK_CLASS_LABELS.other;
    if (book && book._id) {
      await db.collection('books').doc(book._id).update({
        data: { category: categoryLabel, updatedAt: nowIso() },
      });
      book = { ...book, category: categoryLabel };
    }
  }
  if (data.shelfLocationKey !== undefined) patch.shelfLocationKey = nextMeta.shelfLocationKey;
  if (data.shelfLocationName !== undefined) {
    await assertSafeTextFields(openid, { shelfLocationName: nextMeta.shelfLocationName });
    patch.shelfLocationName = nextMeta.shelfLocationName;
  }
  if (!Object.keys(patch).length) return fail(400, '没有可更新的书架信息');
  await db.collection('shelf_books').doc(data.id).update({ data: patch });
  const { data: updated } = await db.collection('shelf_books').doc(data.id).get();
  const { activeDrifts, completedIds } = await shelfDriftContext(user._id, [data.id]);
  return ok(formatShelfBook(updated, book, activeDrifts[data.id], completedIds.has(data.id)));
}

async function remove(openid, data) {
  const user = await requireUser(openid);
  if (!user) return fail(401, '未登录');
  const { data: row } = await db.collection('shelf_books').doc(data.id).get();
  if (!row || row.userId !== user._id) return fail(404, '书架记录不存在');
  await db.collection('shelf_books').doc(data.id).remove();
  invalidateShelfDashboardCache(user._id);
  return ok(null);
}

async function dashboard(openid) {
  const user = await requireUser(openid);
  if (!user) return fail(401, '未登录');
  const summary = await getShelfDashboardForUser(user);
  return ok(summary || await refreshShelfDashboardCache(user._id));
}

async function redeemCapacity(openid, data) {
  const user = await requireUser(openid);
  if (!user) return fail(401, '未登录');
  const capacity = Math.min(Math.max(Math.floor(Number(data.count) || SHELF_CAPACITY_PER_COIN), SHELF_CAPACITY_PER_COIN), 100);
  if (capacity % SHELF_CAPACITY_PER_COIN !== 0) {
    return fail(400, `兑换数量须为 ${SHELF_CAPACITY_PER_COIN} 本的整数倍`);
  }
  const coinCost = capacity / SHELF_CAPACITY_PER_COIN;
  let result = null;
  try {
    await db.runTransaction(async (transaction) => {
      const userSnap = await transaction.collection('users').doc(user._id).get();
      const freshUser = transactionDocData(userSnap);
      if (!freshUser || !freshUser._id) throw new Error('USER_NOT_FOUND');
      if (availableCoin(freshUser) < coinCost) throw new Error('INSUFFICIENT_COINS');
      const nextLimit = getShelfLimit(freshUser) + capacity;
      const nextBalance = (Number(freshUser.coinBalance) || 0) - coinCost;
      await transaction.collection('users').doc(freshUser._id).update({
        data: {
          coinBalance: db.command.inc(-coinCost),
          shelfLimit: nextLimit,
        },
      });
      await transaction.collection('coin_transactions').doc(uid()).set({
        data: {
          userId: freshUser._id,
          amount: -coinCost,
          balanceDelta: -coinCost,
          frozenDelta: 0,
          type: 'shelf_capacity_redeem',
          refId: '',
          description: `兑换书架容量 +${capacity} 本`,
          createdAt: nowIso(),
        },
      });
      result = {
        balance: nextBalance,
        shelfLimit: nextLimit,
      };
    });
  } catch (err) {
    if (err.message === 'INSUFFICIENT_COINS') return fail(400, '可用公益积分不足');
    if (err.message === 'USER_NOT_FOUND') return fail(404, '用户不存在，请重新登录');
    throw err;
  }
  if (!result) return fail(500, '兑换失败，请稍后重试');
  invalidateShelfDashboardCache(user._id);
  const used = await getShelfUsage(user._id);
  return ok({
    balance: result.balance,
    shelfLimit: result.shelfLimit,
    remainingCapacity: Math.max(result.shelfLimit - used, 0),
    pointEffects: { coinSpent: coinCost },
  });
}

async function publicList(data) {
  const userId = data.userId;
  if (!userId) return fail(400, '缺少分享用户');
  const { data: user } = await db.collection('users').doc(userId).get();
  if (!user) return fail(404, '分享书架不存在');
  const { data: rows } = await db.collection('shelf_books').where({ userId }).orderBy('createdAt', 'desc').limit(200).get();
  const bookIds = rows.map((row) => row.bookId).filter(Boolean);
  const books = {};
  if (bookIds.length) {
    const { data: bookList } = await db.collection('books').where({ _id: db.command.in(bookIds) }).get();
    const pricedBooks = await enrichBookPrices(bookList);
    const rawMap = {};
    pricedBooks.forEach((book) => { rawMap[book._id] = book; });
    cacheBooksForList(db, rawMap, 12).catch((err) => console.warn('[shelf.public] cover cache skipped', err.message || err));
    const cachedMap = rawMap;
    Object.keys(cachedMap).forEach((id) => { books[id] = cachedMap[id]; });
  }
  const shelfBookIds = rows.map((row) => row._id);
  const { activeDrifts, completedIds } = await shelfDriftContext(userId, shelfBookIds);
  const list = rows.filter((row) => books[row.bookId]).map((row) => formatShelfBook(
    row,
    books[row.bookId],
    activeDrifts[row._id],
    completedIds.has(row._id),
  ));
  const pricedBooks = await enrichBookPrices(Object.values(books));
  const pricedMap = {};
  pricedBooks.forEach((book) => { pricedMap[book._id] = book; });
  let totalListPrice = 0;
  list.forEach((row) => {
    const price = listPriceForBook(pricedMap[row.bookId] || row.book || {});
    if (price > 0) totalListPrice += price;
  });
  return ok({
    owner: {
      id: user._id,
      nickname: user.nickname || '书友',
      avatar: user.avatar || '',
      shelfName: user.shelfName || 'TA的书架',
    },
    list,
    dashboard: {
      totalBooks: list.length,
      totalValue: formatPriceTotal(totalListPrice),
      totalListPrice: formatPriceTotal(totalListPrice),
      shelfLimit: list.length,
      remainingCapacity: 0,
    },
  });
}

module.exports = {
  list, detail, publishCandidates, add, manualAdd, update, remove, dashboard, redeemCapacity, publicList,
};
