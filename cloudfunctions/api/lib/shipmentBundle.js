const crypto = require('crypto');
const { uid, nowIso } = require('./utils');
const { addHours } = require('./driftPolicy');
const {
  BUNDLE_MERGE_WINDOW_HOURS,
  BUNDLE_MAX_ORDERS,
} = require('./driftPolicy');

function normalizeAddressSnapshot(address = {}) {
  const region = Array.isArray(address.region)
    ? address.region.filter(Boolean).join(' ')
    : String(address.region || address.regionName || '').trim();
  return {
    name: String(address.name || address.userName || '').trim(),
    phone: String(address.phone || address.telNumber || '').trim(),
    region,
    detail: String(address.detail || address.detailInfo || '').trim(),
  };
}

function computeAddressKey(addressSnapshot = {}) {
  const norm = normalizeAddressSnapshot(addressSnapshot);
  const payload = [norm.name, norm.phone, norm.region, norm.detail]
    .join('|')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 32);
}

function openBundleSlotId(giverId, receiverId, addressKey) {
  const digest = crypto.createHash('sha256').update(`${giverId}|${receiverId}|${addressKey}`).digest('hex');
  return `slot_${digest.slice(0, 28)}`;
}

function pickMergeCandidate(bundles = [], nowIsoStr) {
  const windowStart = addHours(nowIsoStr, -BUNDLE_MERGE_WINDOW_HOURS);
  return bundles.find((bundle) => {
    const count = (bundle.orderIds || []).length;
    if (count >= BUNDLE_MAX_ORDERS) return false;
    const updatedAt = bundle.updatedAt || bundle.createdAt || '';
    return updatedAt >= windowStart;
  }) || null;
}

async function readOpenBundleCandidate(transaction, order, now) {
  const addressKey = computeAddressKey(order.addressSnapshot);
  const slotId = openBundleSlotId(order.giverId, order.receiverId, addressKey);
  const slotSnap = await transaction.collection('shipment_bundles').doc(slotId).get();
  const slot = slotSnap.data;
  if (!slot || !slot.bundleId) return null;
  const bundleSnap = await transaction.collection('shipment_bundles').doc(slot.bundleId).get();
  const bundle = bundleSnap.data;
  if (!bundle || bundle.status !== 'OPEN') return null;
  return pickMergeCandidate([{ ...bundle, _id: slot.bundleId }], now);
}

async function upsertOpenBundleSlot(transaction, order, bundleId, now) {
  const addressKey = computeAddressKey(order.addressSnapshot);
  const slotId = openBundleSlotId(order.giverId, order.receiverId, addressKey);
  const slotSnap = await transaction.collection('shipment_bundles').doc(slotId).get();
  if (slotSnap.data) {
    await transaction.collection('shipment_bundles').doc(slotId).update({
      data: { bundleId, updatedAt: now },
    });
    return;
  }
  await transaction.collection('shipment_bundles').doc(slotId).set({
    data: {
      type: 'OPEN_SLOT',
      bundleId,
      giverId: order.giverId,
      receiverId: order.receiverId,
      addressKey,
      updatedAt: now,
      createdAt: now,
    },
  });
}

async function clearOpenBundleSlot(transaction, bundle = {}) {
  if (!bundle.giverId || !bundle.receiverId || !bundle.addressKey) return;
  const slotId = openBundleSlotId(bundle.giverId, bundle.receiverId, bundle.addressKey);
  try {
    await transaction.collection('shipment_bundles').doc(slotId).remove();
  } catch (err) {
    // slot may already be gone
  }
}

async function attachOrderToBundle(transaction, order, _) {
  const now = nowIso();
  const addressKey = computeAddressKey(order.addressSnapshot);
  const candidate = await readOpenBundleCandidate(transaction, order, now);

  if (candidate && candidate._id) {
    const bundleOrderCount = (candidate.orderIds || []).length + 1;
    await transaction.collection('shipment_bundles').doc(candidate._id).update({
      data: {
        orderIds: _.push(order._id),
        updatedAt: now,
      },
    });
    await upsertOpenBundleSlot(transaction, order, candidate._id, now);
    await transaction.collection('drift_orders').doc(order._id).update({
      data: { bundleId: candidate._id, bundleSeq: bundleOrderCount },
    });
    return { merged: true, bundleId: candidate._id, bundleOrderCount };
  }

  const bundleId = uid();
  await transaction.collection('shipment_bundles').doc(bundleId).set({
    data: {
      giverId: order.giverId,
      receiverId: order.receiverId,
      addressKey,
      addressSnapshot: normalizeAddressSnapshot(order.addressSnapshot),
      orderIds: [order._id],
      status: 'OPEN',
      trackingNo: '',
      expressCompany: '',
      createdAt: now,
      updatedAt: now,
    },
  });
  await upsertOpenBundleSlot(transaction, order, bundleId, now);
  await transaction.collection('drift_orders').doc(order._id).update({
    data: { bundleId, bundleSeq: 1 },
  });
  return { merged: false, bundleId, bundleOrderCount: 1 };
}

async function removeOrderFromBundle(transaction, order, _) {
  if (!order.bundleId) return;
  const bundleSnap = await transaction.collection('shipment_bundles').doc(order.bundleId).get();
  const bundle = bundleSnap.data;
  if (!bundle) return;
  const remaining = (bundle.orderIds || []).filter((id) => id !== order._id);
  const now = nowIso();
  if (!remaining.length) {
    await transaction.collection('shipment_bundles').doc(order.bundleId).update({
      data: { status: 'DISSOLVED', orderIds: [], updatedAt: now },
    });
    await clearOpenBundleSlot(transaction, bundle);
    return;
  }
  await transaction.collection('shipment_bundles').doc(order.bundleId).update({
    data: { orderIds: remaining, updatedAt: now },
  });
}

async function loadBundleByRef(transaction, { bundleId, orderId }) {
  if (bundleId) {
    const snap = await transaction.collection('shipment_bundles').doc(bundleId).get();
    return snap.data ? { ...snap.data, _id: bundleId } : null;
  }
  if (orderId) {
    const orderSnap = await transaction.collection('drift_orders').doc(orderId).get();
    const order = orderSnap.data;
    if (!order || !order.bundleId) return null;
    const bundleSnap = await transaction.collection('shipment_bundles').doc(order.bundleId).get();
    return bundleSnap.data ? { ...bundleSnap.data, _id: order.bundleId } : null;
  }
  return null;
}

async function shipBundlePendingOrders(transaction, {
  bundle,
  giverId,
  expressCompany,
  trackingNo,
  now,
  _,
  writeOrderEvent,
}) {
  if (!bundle || bundle.giverId !== giverId) throw new Error('ORDER_NOT_FOUND');
  if (bundle.status !== 'OPEN') throw new Error('INVALID_STATUS');
  const orderIds = bundle.orderIds || [];
  if (!orderIds.length) throw new Error('INVALID_STATUS');

  const shippedIds = [];
  for (const orderId of orderIds) {
    const orderSnap = await transaction.collection('drift_orders').doc(orderId).get();
    const order = orderSnap.data;
    if (!order || order.status !== 'PENDING_SHIP') continue;
    if (order.shipDeadlineAt && order.shipDeadlineAt <= now) throw new Error('SHIP_DEADLINE_EXPIRED');
    await transaction.collection('drift_orders').doc(orderId).update({
      data: {
        expressCompany,
        trackingNo,
        status: 'SHIPPED',
        shippedAt: now,
        autoCompleteAt: require('./driftPolicy').addDays(now, 10),
      },
    });
    await writeOrderEvent(transaction, { orderId, type: 'SHIPPED', actorId: giverId, createdAt: now });
    shippedIds.push(orderId);
  }
  if (!shippedIds.length) throw new Error('INVALID_STATUS');

  await transaction.collection('shipment_bundles').doc(bundle._id).update({
    data: {
      status: 'SHIPPED',
      expressCompany,
      trackingNo,
      shippedAt: now,
      updatedAt: now,
    },
  });
  await clearOpenBundleSlot(transaction, bundle);
  return shippedIds;
}

function earliestShipDeadline(orders = []) {
  const deadlines = orders
    .map((order) => order.shipDeadlineAt)
    .filter(Boolean)
    .sort();
  return deadlines[0] || '';
}

module.exports = {
  normalizeAddressSnapshot,
  computeAddressKey,
  openBundleSlotId,
  pickMergeCandidate,
  attachOrderToBundle,
  removeOrderFromBundle,
  loadBundleByRef,
  shipBundlePendingOrders,
  earliestShipDeadline,
  BUNDLE_MAX_ORDERS,
};
