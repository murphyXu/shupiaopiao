const { ok, fail, nowIso } = require('../../lib/utils');
const { db, _, getBooksByIds, getUsersByIds } = require('../../lib/db');
const { requireAdminContext } = require('../../lib/adminAuth');
const { normalizeAddressSnapshot } = require('../../lib/shipmentBundle');
const drift = require('../drift');
const {
  resolveShipDeadline,
  resolveAutoCompleteDeadline,
  isShipDeadlinePassed,
  isAutoCompletePassed,
} = require('../../lib/driftMaintenance');

const ORDER_STATUS_LABELS = {
  PENDING_SHIP: '待发货',
  SHIPPED: '待收货',
  DISPUTED: '申诉中',
  DONE: '已完成',
  CANCELLED: '已取消',
};

function guard(openid, headers) {
  return requireAdminContext(openid, headers);
}

function hasAddress(snapshot = {}) {
  return !!(snapshot.name || snapshot.phone || snapshot.region || snapshot.detail);
}

async function resolveFullAddress(order = {}) {
  const snapshot = normalizeAddressSnapshot(order.addressSnapshot || {});
  if (hasAddress(snapshot)) return snapshot;
  if (!order.addressId) return null;
  try {
    const { data: address } = await db.collection('addresses').doc(order.addressId).get();
    if (!address || address.userId !== order.receiverId) return null;
    const recovered = normalizeAddressSnapshot(address);
    return hasAddress(recovered) ? recovered : null;
  } catch (err) {
    return null;
  }
}

function formatOrderRow(row, driftDoc, book, giver, receiver) {
  return {
    id: row._id,
    status: row.status,
    statusLabel: ORDER_STATUS_LABELS[row.status] || row.status,
    driftId: row.driftId,
    coinValue: Number(row.coinValue) || Number(driftDoc.coinValue) || 0,
    claimedAt: row.claimedAt || row.createdAt,
    shippedAt: row.shippedAt || '',
    shipDeadlineAt: row.shipDeadlineAt || resolveShipDeadline(row),
    autoCompleteAt: row.autoCompleteAt || resolveAutoCompleteDeadline(row),
    expressCompany: row.expressCompany || '',
    trackingNo: row.trackingNo || '',
    book: book ? { id: book._id, title: book.title, author: book.author, isbn: book.isbn || '' } : null,
    giver: giver ? { id: giver._id, nickname: giver.nickname } : null,
    receiver: receiver ? { id: receiver._id, nickname: receiver.nickname } : null,
  };
}

async function list(data, openid, _ctx, _adminCtx, headers) {
  const auth = guard(openid, headers);
  if (auth.error) return auth.error;

  const page = Math.max(Number(data.page) || 1, 1);
  const size = Math.min(Math.max(Number(data.size) || 20, 1), 50);
  const status = String(data.status || '').trim();

  let query = db.collection('drift_orders');
  if (status) query = query.where({ status });
  const { data: rows } = await query.orderBy('createdAt', 'desc').skip((page - 1) * size).limit(size).get();

  const driftIds = rows.map((row) => row.driftId);
  const userIds = [...new Set(rows.flatMap((row) => [row.giverId, row.receiverId]).filter(Boolean))];
  const { data: driftRows } = driftIds.length
    ? await db.collection('drifts').where({ _id: _.in(driftIds) }).limit(driftIds.length).get()
    : { data: [] };
  const driftMap = {};
  driftRows.forEach((item) => { driftMap[item._id] = item; });
  const books = await getBooksByIds(driftRows.map((item) => item.bookId));
  const users = await getUsersByIds(userIds);

  const listRows = rows.map((row) => formatOrderRow(
    row,
    driftMap[row.driftId] || {},
    books[driftMap[row.driftId]?.bookId],
    users[row.giverId],
    users[row.receiverId],
  ));

  let total = listRows.length;
  try {
    const counter = status
      ? await db.collection('drift_orders').where({ status }).count()
      : await db.collection('drift_orders').count();
    total = counter.total || listRows.length;
  } catch (err) {
    total = listRows.length;
  }

  return ok({ list: listRows, page, size, total, hasMore: page * size < total });
}

async function detail(data, openid, _ctx, _adminCtx, headers) {
  const auth = guard(openid, headers);
  if (auth.error) return auth.error;
  const orderId = String(data.orderId || data.id || '').trim();
  if (!orderId) return fail(400, '缺少订单 ID');

  const { data: order } = await db.collection('drift_orders').doc(orderId).get();
  if (!order) return fail(404, '订单不存在');

  const { data: driftDoc } = await db.collection('drifts').doc(order.driftId).get();
  const [books, users] = await Promise.all([
    getBooksByIds([driftDoc?.bookId].filter(Boolean)),
    getUsersByIds([order.giverId, order.receiverId].filter(Boolean)),
  ]);
  const book = books[driftDoc?.bookId];
  const addressSnapshot = await resolveFullAddress(order);

  let events = [];
  try {
    const res = await db.collection('drift_order_events').where({ orderId }).orderBy('createdAt', 'asc').limit(100).get();
    events = res.data || [];
  } catch (err) {
    events = [];
  }

  return ok({
    order: {
      ...formatOrderRow(order, driftDoc || {}, book, users[order.giverId], users[order.receiverId]),
      addressSnapshot,
      addressId: order.addressId || '',
      cancelReason: order.cancelReason || '',
      cancelledAt: order.cancelledAt || '',
      bundleId: order.bundleId || '',
    },
    drift: driftDoc ? {
      id: driftDoc._id,
      status: driftDoc.status,
      condition: driftDoc.condition,
      coinValue: driftDoc.coinValue,
      remark: driftDoc.remark || '',
    } : null,
    events,
  });
}

async function todos(_data, openid, _ctx, _adminCtx, headers) {
  const auth = guard(openid, headers);
  if (auth.error) return auth.error;

  const now = nowIso();
  const soon = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

  const [{ data: pendingRows }, { data: shippedRows }, { data: appealRows }] = await Promise.all([
    db.collection('drift_orders').where({ status: 'PENDING_SHIP' }).limit(200).get(),
    db.collection('drift_orders').where({ status: 'SHIPPED' }).limit(200).get(),
    db.collection('drifts').where({ appealStatus: 'OPEN' }).orderBy('appealAt', 'desc').limit(50).get(),
  ]);

  const overdueShip = pendingRows.filter((row) => isShipDeadlinePassed(row, now));
  const autoCompleteSoon = shippedRows.filter((row) => {
    const deadline = row.autoCompleteAt || resolveAutoCompleteDeadline(row);
    return deadline && deadline > now && deadline <= soon;
  });

  return ok({
    overdueShip: overdueShip.map((row) => ({ orderId: row._id, driftId: row.driftId, shipDeadlineAt: row.shipDeadlineAt || resolveShipDeadline(row) })),
    autoCompleteSoon: autoCompleteSoon.map((row) => ({ orderId: row._id, driftId: row.driftId, autoCompleteAt: row.autoCompleteAt || resolveAutoCompleteDeadline(row) })),
    appealOpen: appealRows.map((row) => ({
      driftId: row._id,
      bookId: row.bookId,
      appealReason: row.appealReason || '',
      appealAt: row.appealAt || '',
      status: row.status,
    })),
    counts: {
      overdueShip: overdueShip.length,
      autoCompleteSoon: autoCompleteSoon.length,
      appealOpen: appealRows.length,
    },
  });
}

async function forceCancel(data, openid, _ctx, _adminCtx, headers) {
  const auth = guard(openid, headers);
  if (auth.error) return auth.error;
  const orderId = String(data.orderId || '').trim();
  const reason = String(data.reason || '运营取消').trim();
  if (!orderId) return fail(400, '缺少订单 ID');
  if (!reason) return fail(400, '请填写取消原因');
  try {
    await drift.cancelOrderById(orderId, { system: true }, reason);
    return ok({ orderId, status: 'CANCELLED' });
  } catch (err) {
    if (err.message === 'ORDER_NOT_FOUND') return fail(404, '订单不存在');
    if (err.message === 'INVALID_STATUS') return fail(409, '当前状态不可取消');
    return fail(500, err.message || '取消失败');
  }
}

async function forceComplete(data, openid, _ctx, _adminCtx, headers) {
  const auth = guard(openid, headers);
  if (auth.error) return auth.error;
  const orderId = String(data.orderId || '').trim();
  if (!orderId) return fail(400, '缺少订单 ID');
  try {
    await drift.settleOrder(orderId, 'AUTO');
    return ok({ orderId, status: 'DONE' });
  } catch (err) {
    if (err.message === 'ORDER_NOT_FOUND') return fail(404, '订单不存在');
    if (err.message === 'INVALID_STATUS') return fail(409, '当前状态不可完成');
    return fail(500, err.message || '操作失败');
  }
}

async function extendDeadline(data, openid, _ctx, _adminCtx, headers) {
  const auth = guard(openid, headers);
  if (auth.error) return auth.error;
  const orderId = String(data.orderId || '').trim();
  const hours = Math.max(Number(data.hours) || 0, 0);
  if (!orderId) return fail(400, '缺少订单 ID');
  if (!hours) return fail(400, '请指定延长小时数');

  const { data: order } = await db.collection('drift_orders').doc(orderId).get();
  if (!order) return fail(404, '订单不存在');

  const patch = {};
  if (order.status === 'PENDING_SHIP') {
    const base = order.shipDeadlineAt || resolveShipDeadline(order);
    patch.shipDeadlineAt = new Date(new Date(base || nowIso()).getTime() + hours * 3600000).toISOString();
  } else if (order.status === 'SHIPPED') {
    const base = order.autoCompleteAt || resolveAutoCompleteDeadline(order);
    patch.autoCompleteAt = new Date(new Date(base || nowIso()).getTime() + hours * 3600000).toISOString();
  } else {
    return fail(409, '当前状态不可延期');
  }
  patch.updatedAt = nowIso();
  await db.collection('drift_orders').doc(orderId).update({ data: patch });
  return ok({ orderId, ...patch });
}

module.exports = {
  list, detail, todos, forceCancel, forceComplete, extendDeadline,
};
