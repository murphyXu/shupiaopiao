const { ok, fail, nowIso } = require('../../lib/utils');
const {
  db, _, getBookById, getBooksByIds, getUsersByIds, safeQuery, queryRowsByIdChunks,
} = require('../../lib/db');
const { requireAdminContext } = require('../../lib/adminAuth');
const {
  MAX_OPS_PINNED,
  normalizeOpsCategory,
  countActivePinned,
  isPinnedActive,
} = require('../../lib/poolOps');
const { CONDITION_LABELS } = require('../../lib/pricing');
const { resolveShelfCategory } = require('../../lib/bookCategory');
const { schedulePoolFeedRebuild } = require('../../lib/poolFeedSnapshot');

function bumpPoolFeed(reason) {
  schedulePoolFeedRebuild(reason);
}

const CATEGORY_LABELS = {
  children: '童书',
  literature: '文学',
  business: '经管',
  other: '其他',
};

const DRIFT_STATUS_LABELS = {
  PENDING_REVIEW: '待审核',
  IN_POOL: '在池',
  REJECTED: '已拒绝',
  CANCELLED: '已取消',
  CLAIMED: '已接漂',
  COMPLETED: '已完成',
};

const ADMIN_STATUS_TARGETS = {
  PENDING_REVIEW: ['IN_POOL', 'REJECTED', 'CANCELLED'],
  IN_POOL: ['PENDING_REVIEW', 'REJECTED', 'CANCELLED'],
  REJECTED: ['IN_POOL', 'PENDING_REVIEW', 'CANCELLED'],
  CANCELLED: ['IN_POOL', 'PENDING_REVIEW'],
};

const ADMIN_DRIFT_LIST_MAX = 1000;
const ADMIN_FETCH_BATCH = 100;

const VALUE_RANGES = {
  low: { min: 0, max: 5 },
  middle: { min: 6, max: 10 },
  high: { min: 11, max: 20 },
  premium: { min: 21 },
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

function guard(openid, headers) {
  return requireAdminContext(openid, headers);
}

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

async function getShelfRowsByIds(ids = []) {
  if (!ids.length) return {};
  const rows = await queryRowsByIdChunks('shelf_books', ids);
  const map = {};
  rows.forEach((row) => { map[row._id] = row; });
  return map;
}

function formatDriftRow(drift, book, giver, shelfRow) {
  const category = classifyCategory(book || {}, shelfRow, drift);
  return {
    id: drift._id,
    status: drift.status,
    statusLabel: DRIFT_STATUS_LABELS[drift.status] || drift.status,
    bookId: drift.bookId,
    bookTitle: book ? book.title : '',
    bookAuthor: book ? book.author : '',
    bookIsbn: book ? (book.isbn || '') : '',
    coinValue: Number(drift.coinValue) || 0,
    systemCoinValue: Number(drift.systemCoinValue) || Number(drift.coinValue) || 0,
    category,
    categoryLabel: CATEGORY_LABELS[category] || CATEGORY_LABELS.other,
    opsCategory: drift.opsCategory || '',
    opsPinned: !!drift.opsPinned,
    opsPinRank: Number(drift.opsPinRank) || 0,
    opsPinnedUntil: drift.opsPinnedUntil || '',
    opsHidden: !!drift.opsHidden,
    opsNote: drift.opsNote || '',
    appealStatus: drift.appealStatus || '',
    appealReason: drift.appealReason || '',
    appealAt: drift.appealAt || '',
    condition: drift.condition,
    conditionLabel: CONDITION_LABELS[drift.condition] || drift.condition,
    giver: giver ? { id: giver._id, nickname: giver.nickname } : null,
    createdAt: drift.createdAt || '',
  };
}

function matchesValueKey(coinValue, key) {
  if (!key || key === 'all') return true;
  const range = VALUE_RANGES[key];
  if (!range) return true;
  const value = Number(coinValue) || 0;
  if (range.min !== undefined && value < range.min) return false;
  if (range.max !== undefined && value > range.max) return false;
  return true;
}

function matchesPinnedFilter(row, pinnedFilter) {
  if (!pinnedFilter || pinnedFilter === 'all') return true;
  if (pinnedFilter === 'pinned') return !!row.opsPinned;
  if (pinnedFilter === 'unpinned') return !row.opsPinned;
  return true;
}

async function fetchAllDrifts(where = {}) {
  const { total: rawTotal } = await safeQuery('drifts', (col) => col.where(where).count());
  const total = Math.min(rawTotal || 0, ADMIN_DRIFT_LIST_MAX);
  if (!total) return { rows: [], rawTotal: rawTotal || 0, truncated: false };

  const rows = [];
  for (let skip = 0; skip < total; skip += ADMIN_FETCH_BATCH) {
    const limit = Math.min(ADMIN_FETCH_BATCH, total - skip);
    const { data } = await safeQuery('drifts', (col) =>
      col.where(where).orderBy('createdAt', 'desc').skip(skip).limit(limit).get());
    rows.push(...(data || []));
    if (!data || data.length < limit) break;
  }
  return {
    rows: rows.slice(0, ADMIN_DRIFT_LIST_MAX),
    rawTotal: rawTotal || 0,
    truncated: (rawTotal || 0) > ADMIN_DRIFT_LIST_MAX,
  };
}

function sortDriftRows(list = []) {
  return [...list].sort((a, b) => {
    const pinDiff = (b.opsPinned ? 1 : 0) - (a.opsPinned ? 1 : 0);
    if (pinDiff) return pinDiff;
    if (a.opsPinned && b.opsPinned) {
      const rankDiff = (Number(a.opsPinRank) || 999) - (Number(b.opsPinRank) || 999);
      if (rankDiff) return rankDiff;
    }
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });
}

async function list(data, openid, _ctx, _adminCtx, headers) {
  const auth = guard(openid, headers);
  if (auth.error) return auth.error;

  const page = Math.max(Number(data.page) || 1, 1);
  const size = Math.min(Math.max(Number(data.size) || 20, 1), 100);
  const status = String(data.status || 'IN_POOL').trim();
  const keyword = String(data.keyword || '').trim().toLowerCase();
  const category = normalizeOpsCategory(data.category) || String(data.category || '').trim();
  const categoryFilter = category === 'all' ? '' : category;
  const valueKey = String(data.valueKey || data.coinRange || 'all').trim() || 'all';
  const pinnedFilter = String(data.pinnedFilter || (data.pinnedOnly ? 'pinned' : 'all')).trim() || 'all';

  const where = status === 'all' ? {} : { status };
  const { rows, rawTotal, truncated } = await fetchAllDrifts(where);

  const shelfRows = await getShelfRowsByIds(rows.map((row) => row.shelfBookId));
  const books = await getBooksByIds(rows.map((row) => row.bookId));
  const users = await getUsersByIds(rows.map((row) => row.userId));

  let listRows = rows
    .map((row) => formatDriftRow(row, books[row.bookId], users[row.userId], shelfRows[row.shelfBookId]))
    .filter((row) => {
      if (categoryFilter && row.category !== categoryFilter) return false;
      if (!matchesValueKey(row.coinValue, valueKey)) return false;
      if (!matchesPinnedFilter(row, pinnedFilter)) return false;
      if (!keyword) return true;
      return row.bookTitle.toLowerCase().includes(keyword)
        || row.bookAuthor.toLowerCase().includes(keyword)
        || row.bookIsbn.includes(keyword)
        || row.id.toLowerCase().includes(keyword)
        || (row.giver?.nickname || '').toLowerCase().includes(keyword);
    });

  listRows = sortDriftRows(listRows);
  const total = listRows.length;
  const paged = listRows.slice((page - 1) * size, page * size);

  return ok({
    list: paged,
    page,
    size,
    total,
    rawTotal,
    truncated,
    hasMore: page * size < total,
  });
}

async function detail(data, openid, _ctx, _adminCtx, headers) {
  const auth = guard(openid, headers);
  if (auth.error) return auth.error;
  const driftId = String(data.driftId || data.id || '').trim();
  if (!driftId) return fail(400, '缺少漂流 ID');

  const { data: drift } = await db.collection('drifts').doc(driftId).get();
  if (!drift) return fail(404, '漂流记录不存在');

  const book = await getBookById(drift.bookId);
  const shelfMap = await getShelfRowsByIds([drift.shelfBookId]);
  const users = await getUsersByIds([drift.userId]);
  const giver = users[drift.userId];

  return ok({
    drift: formatDriftRow(drift, book, giver, shelfMap[drift.shelfBookId]),
    rejectReason: drift.rejectReason || [],
    remark: drift.remark || '',
    images: drift.images || [],
  });
}

async function loadDriftOrFail(driftId) {
  const { data: drift } = await db.collection('drifts').doc(driftId).get();
  if (!drift) return { error: fail(404, '漂流记录不存在') };
  return { drift };
}

async function updateCoin(data, openid, _ctx, _adminCtx, headers) {
  const auth = guard(openid, headers);
  if (auth.error) return auth.error;
  const driftId = String(data.driftId || '').trim();
  const coinValue = Math.max(Math.floor(Number(data.coinValue)), 0);
  const reason = String(data.reason || '').trim();
  if (!driftId) return fail(400, '缺少漂流 ID');
  if (!reason) return fail(400, '请填写调整原因');

  const loaded = await loadDriftOrFail(driftId);
  if (loaded.error) return loaded.error;
  const { drift } = loaded;
  if (!['IN_POOL', 'PENDING_REVIEW'].includes(drift.status)) {
    return fail(409, '当前状态不可修改积分');
  }

  await db.collection('drifts').doc(driftId).update({
    data: {
      coinValue,
      opsCoinValue: coinValue,
      coinValueOpsOverride: true,
      opsNote: reason,
      updatedAt: nowIso(),
    },
  });
  return ok({ driftId, coinValue });
}

async function updateCategory(data, openid, _ctx, _adminCtx, headers) {
  const auth = guard(openid, headers);
  if (auth.error) return auth.error;
  const driftId = String(data.driftId || '').trim();
  const opsCategory = normalizeOpsCategory(data.opsCategory);
  const reason = String(data.reason || '').trim();
  if (!driftId) return fail(400, '缺少漂流 ID');
  if (!opsCategory) return fail(400, '分类无效');
  if (!reason) return fail(400, '请填写调整原因');

  const loaded = await loadDriftOrFail(driftId);
  if (loaded.error) return loaded.error;

  await db.collection('drifts').doc(driftId).update({
    data: { opsCategory, opsNote: reason, updatedAt: nowIso() },
  });
  bumpPoolFeed('admin_update_category');
  return ok({ driftId, opsCategory });
}

async function countPinnedInPool(excludeId = '') {
  const { data: rows } = await db.collection('drifts').where({ status: 'IN_POOL', opsPinned: true }).limit(100).get();
  return countActivePinned(rows.filter((row) => row._id !== excludeId));
}

async function pin(data, openid, _ctx, adminCtx, headers) {
  const auth = guard(openid, headers);
  if (auth.error) return auth.error;
  const driftId = String(data.driftId || '').trim();
  if (!driftId) return fail(400, '缺少漂流 ID');

  const loaded = await loadDriftOrFail(driftId);
  if (loaded.error) return loaded.error;
  const { drift } = loaded;
  if (drift.status !== 'IN_POOL') return fail(409, '仅在池书籍可置顶');
  if (drift.opsHidden) return fail(409, '已下架书籍不可置顶');

  const alreadyPinned = isPinnedActive(drift);
  if (!alreadyPinned) {
    const pinnedCount = await countPinnedInPool(driftId);
    if (pinnedCount >= MAX_OPS_PINNED) return fail(409, `最多置顶 ${MAX_OPS_PINNED} 本`);
  }

  const opsPinRank = Math.max(Number(data.opsPinRank) || 1, 1);
  const patch = {
    opsPinned: true,
    opsPinRank,
    opsPinnedAt: nowIso(),
    opsPinnedBy: adminCtx.username || 'admin',
    updatedAt: nowIso(),
  };
  if (data.opsPinnedUntil) patch.opsPinnedUntil = String(data.opsPinnedUntil);
  await db.collection('drifts').doc(driftId).update({ data: patch });
  bumpPoolFeed('admin_pin');
  return ok({ driftId, opsPinned: true, opsPinRank });
}

async function unpin(data, openid, _ctx, _adminCtx, headers) {
  const auth = guard(openid, headers);
  if (auth.error) return auth.error;
  const driftId = String(data.driftId || '').trim();
  if (!driftId) return fail(400, '缺少漂流 ID');

  await db.collection('drifts').doc(driftId).update({
    data: {
      opsPinned: false,
      opsPinRank: 0,
      opsPinnedUntil: '',
      updatedAt: nowIso(),
    },
  });
  bumpPoolFeed('admin_unpin');
  return ok({ driftId, opsPinned: false });
}

async function reorderPins(data, openid, _ctx, _adminCtx, headers) {
  const auth = guard(openid, headers);
  if (auth.error) return auth.error;
  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length) return fail(400, '缺少排序列表');
  if (items.length > MAX_OPS_PINNED) return fail(409, `最多置顶 ${MAX_OPS_PINNED} 本`);

  await Promise.all(items.map((item, index) => {
    const driftId = String(item.driftId || '').trim();
    if (!driftId) return Promise.resolve();
    return db.collection('drifts').doc(driftId).update({
      data: {
        opsPinned: true,
        opsPinRank: Math.max(Number(item.opsPinRank) || index + 1, 1),
        updatedAt: nowIso(),
      },
    });
  }));
  bumpPoolFeed('admin_reorder_pins');
  return ok({ updated: items.length });
}

async function listPinned(_data, openid, _ctx, _adminCtx, headers) {
  const auth = guard(openid, headers);
  if (auth.error) return auth.error;
  const { data: rows } = await db.collection('drifts')
    .where({ status: 'IN_POOL', opsPinned: true })
    .limit(MAX_OPS_PINNED)
    .get();
  const now = nowIso();
  const active = rows.filter((row) => isPinnedActive(row, now));
  active.sort((a, b) => (Number(a.opsPinRank) || 999) - (Number(b.opsPinRank) || 999));
  const books = await getBooksByIds(active.map((row) => row.bookId));
  return ok({
    list: active.map((row) => ({
      driftId: row._id,
      opsPinRank: row.opsPinRank || 0,
      opsPinnedUntil: row.opsPinnedUntil || '',
      bookTitle: (books[row.bookId] || {}).title || '',
      coinValue: row.coinValue,
    })),
    count: active.length,
    max: MAX_OPS_PINNED,
  });
}

async function hide(data, openid, _ctx, _adminCtx, headers) {
  const auth = guard(openid, headers);
  if (auth.error) return auth.error;
  const driftId = String(data.driftId || '').trim();
  const reason = String(data.reason || '').trim();
  if (!driftId) return fail(400, '缺少漂流 ID');
  await db.collection('drifts').doc(driftId).update({
    data: { opsHidden: true, opsPinned: false, opsNote: reason || '运营下架', updatedAt: nowIso() },
  });
  bumpPoolFeed('admin_hide');
  return ok({ driftId, opsHidden: true });
}

async function show(data, openid, _ctx, _adminCtx, headers) {
  const auth = guard(openid, headers);
  if (auth.error) return auth.error;
  const driftId = String(data.driftId || '').trim();
  if (!driftId) return fail(400, '缺少漂流 ID');
  await db.collection('drifts').doc(driftId).update({
    data: { opsHidden: false, updatedAt: nowIso() },
  });
  bumpPoolFeed('admin_show');
  return ok({ driftId, opsHidden: false });
}

async function hasActiveOrder(driftId) {
  const { total } = await db.collection('drift_orders').where({
    driftId,
    status: _.in(['PENDING_SHIP', 'SHIPPED', 'DISPUTED']),
  }).count();
  return total > 0;
}

async function updateStatus(data, openid, _ctx, _adminCtx, headers) {
  const auth = guard(openid, headers);
  if (auth.error) return auth.error;
  const driftId = String(data.driftId || '').trim();
  const nextStatus = String(data.status || '').trim();
  const reason = String(data.reason || '').trim();
  if (!driftId) return fail(400, '缺少漂流 ID');
  if (!nextStatus) return fail(400, '请选择目标状态');
  if (!reason) return fail(400, '请填写状态变更原因');
  if (!DRIFT_STATUS_LABELS[nextStatus]) return fail(400, '状态无效');

  const loaded = await loadDriftOrFail(driftId);
  if (loaded.error) return loaded.error;
  const { drift } = loaded;
  const current = drift.status;
  if (current === nextStatus) return ok({ driftId, status: nextStatus, statusLabel: DRIFT_STATUS_LABELS[nextStatus] });

  if (['CLAIMED', 'COMPLETED'].includes(current)) {
    return fail(409, '已接漂或已完成不可直接改状态，请通过订单处理');
  }

  const allowed = ADMIN_STATUS_TARGETS[current] || [];
  if (!allowed.includes(nextStatus)) {
    return fail(409, `不支持从「${DRIFT_STATUS_LABELS[current] || current}」变更为「${DRIFT_STATUS_LABELS[nextStatus]}」`);
  }

  if (nextStatus === 'CANCELLED' && await hasActiveOrder(driftId)) {
    return fail(409, '存在进行中订单，无法取消');
  }

  const now = nowIso();
  const patch = {
    status: nextStatus,
    opsStatusNote: reason,
    updatedAt: now,
  };

  if (nextStatus === 'IN_POOL') {
    patch.rejectReason = [];
    patch.opsHidden = false;
    if (drift.appealStatus === 'OPEN') {
      patch.appealStatus = 'RESOLVED';
      patch.appealResolveNote = reason;
      patch.appealResolvedAt = now;
    }
  }
  if (nextStatus === 'REJECTED') {
    patch.rejectReason = [{ code: 'ADMIN_REJECT', message: reason }];
    patch.opsPinned = false;
    if (drift.appealStatus === 'OPEN') {
      patch.appealStatus = 'RESOLVED';
      patch.appealResolveNote = reason;
      patch.appealResolvedAt = now;
    }
  }
  if (nextStatus === 'CANCELLED') {
    patch.opsPinned = false;
    patch.cancelReason = reason;
    patch.cancelledAt = now;
  }
  if (nextStatus === 'PENDING_REVIEW') {
    patch.opsPinned = false;
  }

  await db.collection('drifts').doc(driftId).update({ data: patch });
  bumpPoolFeed('admin_update_status');
  return ok({
    driftId,
    status: nextStatus,
    statusLabel: DRIFT_STATUS_LABELS[nextStatus],
    allowedTargets: ADMIN_STATUS_TARGETS[nextStatus] || [],
  });
}

function statusOptions(data, openid, _ctx, _adminCtx, headers) {
  const auth = guard(openid, headers);
  if (auth.error) return auth.error;
  const current = String(data.status || '').trim();
  const targets = ADMIN_STATUS_TARGETS[current] || [];
  return ok({
    current,
    currentLabel: DRIFT_STATUS_LABELS[current] || current,
    options: targets.map((value) => ({ value, label: DRIFT_STATUS_LABELS[value] || value })),
    allLabels: DRIFT_STATUS_LABELS,
  });
}

async function removeFromPool(data, openid, _ctx, _adminCtx, headers) {
  const auth = guard(openid, headers);
  if (auth.error) return auth.error;
  const driftId = String(data.driftId || '').trim();
  const reason = String(data.reason || '运营下架').trim();
  if (!driftId) return fail(400, '缺少漂流 ID');

  const loaded = await loadDriftOrFail(driftId);
  if (loaded.error) return loaded.error;
  const { drift } = loaded;
  if (drift.status !== 'IN_POOL') return fail(409, '仅可下架在池书籍');

  const { total } = await db.collection('drift_orders').where({
    driftId,
    status: _.in(['PENDING_SHIP', 'SHIPPED', 'DISPUTED']),
  }).count();
  if (total > 0) return fail(409, '存在进行中订单，无法下架');

  await db.collection('drifts').doc(driftId).update({
    data: {
      status: 'CANCELLED',
      opsPinned: false,
      opsHidden: true,
      cancelReason: reason,
      cancelledAt: nowIso(),
      updatedAt: nowIso(),
    },
  });
  bumpPoolFeed('admin_remove_from_pool');
  return ok({ driftId, status: 'CANCELLED' });
}

async function approve(data, openid, _ctx, _adminCtx, headers) {
  const auth = guard(openid, headers);
  if (auth.error) return auth.error;
  const driftId = String(data.driftId || '').trim();
  const note = String(data.reason || '申诉通过').trim();
  if (!driftId) return fail(400, '缺少漂流 ID');

  const loaded = await loadDriftOrFail(driftId);
  if (loaded.error) return loaded.error;
  const { drift } = loaded;
  if (!['REJECTED', 'PENDING_REVIEW'].includes(drift.status) && drift.appealStatus !== 'OPEN') {
    return fail(409, '当前记录无需审核');
  }

  await db.collection('drifts').doc(driftId).update({
    data: {
      status: 'IN_POOL',
      rejectReason: [],
      appealStatus: 'RESOLVED',
      appealResolveNote: note,
      appealResolvedAt: nowIso(),
      updatedAt: nowIso(),
    },
  });
  bumpPoolFeed('admin_approve');
  return ok({ driftId, status: 'IN_POOL' });
}

async function reject(data, openid, _ctx, _adminCtx, headers) {
  const auth = guard(openid, headers);
  if (auth.error) return auth.error;
  const driftId = String(data.driftId || '').trim();
  const note = String(data.reason || '').trim();
  if (!driftId) return fail(400, '缺少漂流 ID');
  if (!note) return fail(400, '请填写拒绝原因');

  await db.collection('drifts').doc(driftId).update({
    data: {
      status: 'REJECTED',
      appealStatus: 'RESOLVED',
      appealResolveNote: note,
      appealResolvedAt: nowIso(),
      rejectReason: [{ code: 'ADMIN_REJECT', message: note }],
      updatedAt: nowIso(),
    },
  });
  return ok({ driftId, status: 'REJECTED' });
}

module.exports = {
  list,
  detail,
  updateCoin,
  updateCategory,
  updateStatus,
  statusOptions,
  pin,
  unpin,
  reorderPins,
  listPinned,
  hide,
  show,
  removeFromPool,
  approve,
  reject,
};
