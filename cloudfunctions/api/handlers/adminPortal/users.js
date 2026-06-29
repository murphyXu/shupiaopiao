const { ok, fail, uid, nowIso } = require('../../lib/utils');
const { db, _, getBooksByIds } = require('../../lib/db');
const { requireAdminContext } = require('../../lib/adminAuth');
const { writeCoinEvent, writeCreditEvent } = require('../../lib/driftAccounting');

function guard(openid, headers) {
  return requireAdminContext(openid, headers);
}

function formatUserRow(user) {
  const balance = Number(user.coinBalance) || 0;
  const frozen = Number(user.coinFrozen) || 0;
  return {
    id: user._id,
    nickname: user.nickname || '书友',
    avatar: user.avatar || '',
    creditScore: Number(user.creditScore) || 0,
    coinBalance: balance,
    coinFrozen: frozen,
    availableCoin: Math.max(balance - frozen, 0),
    activeClaimCount: Number(user.activeClaimCount) || 0,
    shelfLimit: Number(user.shelfLimit) || 0,
    disputeRestricted: !!user.disputeRestricted,
    createdAt: user.createdAt || '',
  };
}

async function list(data, openid, _ctx, _adminCtx, headers) {
  const auth = guard(openid, headers);
  if (auth.error) return auth.error;

  const page = Math.max(Number(data.page) || 1, 1);
  const size = Math.min(Math.max(Number(data.size) || 20, 1), 50);
  const keyword = String(data.keyword || '').trim().toLowerCase();

  const { data: rows } = await db.collection('users')
    .orderBy('createdAt', 'desc')
    .skip((page - 1) * size)
    .limit(size)
    .get();

  let listRows = rows.map(formatUserRow);
  if (keyword) {
    listRows = listRows.filter((row) =>
      row.nickname.toLowerCase().includes(keyword)
      || row.id.toLowerCase().includes(keyword));
  }

  let total = listRows.length;
  try {
    const counter = await db.collection('users').count();
    total = counter.total || listRows.length;
  } catch (err) {
    total = listRows.length;
  }

  return ok({ list: listRows, page, size, total, hasMore: page * size < total });
}

async function detail(data, openid, _ctx, _adminCtx, headers) {
  const auth = guard(openid, headers);
  if (auth.error) return auth.error;
  const userId = String(data.userId || data.id || '').trim();
  if (!userId) return fail(400, '缺少用户 ID');

  const { data: user } = await db.collection('users').doc(userId).get();
  if (!user) return fail(404, '用户不存在');

  const [{ data: shelfRows }, { data: recentDrifts }, givenRes, receivedRes] = await Promise.all([
    db.collection('shelf_books').where({ userId }).limit(20).get(),
    db.collection('drifts').where({ userId }).orderBy('createdAt', 'desc').limit(10).get(),
    db.collection('drift_orders').where({ giverId: userId }).orderBy('createdAt', 'desc').limit(5).get(),
    db.collection('drift_orders').where({ receiverId: userId }).orderBy('createdAt', 'desc').limit(5).get(),
  ]);
  const recentOrders = [...(givenRes.data || []), ...(receivedRes.data || [])]
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 10);
  const books = await getBooksByIds(shelfRows.map((row) => row.bookId));

  return ok({
    user: formatUserRow(user),
    shelfCount: shelfRows.length,
    shelfPreview: shelfRows.slice(0, 5).map((row) => ({
      id: row._id,
      bookTitle: (books[row.bookId] || {}).title || '',
    })),
    recentDrifts: recentDrifts.map((row) => ({ id: row._id, status: row.status, coinValue: row.coinValue, createdAt: row.createdAt })),
    recentOrders: recentOrders.map((row) => ({ id: row._id, status: row.status, createdAt: row.createdAt })),
  });
}

async function adjustCoin(data, openid, _ctx, _adminCtx, headers) {
  const auth = guard(openid, headers);
  if (auth.error) return auth.error;
  const userId = String(data.userId || '').trim();
  const delta = Number(data.delta);
  const reason = String(data.reason || '').trim();
  if (!userId) return fail(400, '缺少用户 ID');
  if (!Number.isFinite(delta) || delta === 0) return fail(400, '调整数额无效');
  if (!reason) return fail(400, '请填写调整原因');

  const refId = `admin-${uid()}`;
  const now = nowIso();
  await db.runTransaction(async (transaction) => {
    const userSnap = await transaction.collection('users').doc(userId).get();
    const user = userSnap.data;
    if (!user) throw new Error('USER_NOT_FOUND');
    await transaction.collection('users').doc(userId).update({
      data: { coinBalance: _.inc(delta) },
    });
    await writeCoinEvent(transaction, {
      userId,
      refId,
      type: 'admin_adjust',
      balanceDelta: delta,
      frozenDelta: 0,
      description: reason,
      createdAt: now,
    });
  });

  const { data: user } = await db.collection('users').doc(userId).get();
  return ok({ userId, delta, coinBalance: user.coinBalance });
}

async function adjustCredit(data, openid, _ctx, _adminCtx, headers) {
  const auth = guard(openid, headers);
  if (auth.error) return auth.error;
  const userId = String(data.userId || '').trim();
  const delta = Number(data.delta);
  const reason = String(data.reason || '').trim();
  if (!userId) return fail(400, '缺少用户 ID');
  if (!Number.isFinite(delta) || delta === 0) return fail(400, '调整数额无效');
  if (!reason) return fail(400, '请填写调整原因');

  const refId = `admin-${uid()}`;
  const now = nowIso();
  await db.runTransaction(async (transaction) => {
    const userSnap = await transaction.collection('users').doc(userId).get();
    const user = userSnap.data;
    if (!user) throw new Error('USER_NOT_FOUND');
    await transaction.collection('users').doc(userId).update({
      data: { creditScore: _.inc(delta) },
    });
    await writeCreditEvent(transaction, {
      userId,
      refId,
      reasonCode: 'ADMIN_ADJUST',
      delta,
      reason,
      createdAt: now,
    });
  });

  const { data: user } = await db.collection('users').doc(userId).get();
  return ok({ userId, delta, creditScore: user.creditScore });
}

module.exports = {
  list, detail, adjustCoin, adjustCredit,
};
