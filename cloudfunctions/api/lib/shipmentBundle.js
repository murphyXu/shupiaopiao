const crypto = require('crypto');
const { nowIso } = require('./utils');
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
    region: String(region || '').trim(),
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

function openBundleDocId(giverId, receiverId, addressKey) {
  const digest = crypto.createHash('sha256').update(`${giverId}|${receiverId}|${addressKey}`).digest('hex');
  return `obnd_${digest.slice(0, 28)}`;
}

function canMergeOpenBundle(bundle = {}, nowIsoStr) {
  if (!bundle || bundle.status !== 'OPEN') return false;
  const count = (bundle.orderIds || []).length;
  if (count >= BUNDLE_MAX_ORDERS) return false;
  const windowStart = addHours(nowIsoStr, -BUNDLE_MERGE_WINDOW_HOURS);
  const updatedAt = bundle.updatedAt || bundle.createdAt || '';
  return updatedAt >= windowStart;
}

function pickMergeCandidate(bundles = [], nowIsoStr) {
  return bundles.find((bundle) => canMergeOpenBundle(bundle, nowIsoStr)) || null;
}


async function writeOrderBundleMeta(transaction, orderId, bundleId, bundleSeq) {
  await transaction.collection('drift_orders').doc(orderId).update({
    data: { bundleId, bundleSeq },
  });
}

async function loadBundleAttachPlan(transaction, order, now = nowIso()) {
  const addressKey = computeAddressKey(order.addressSnapshot);
  const bundleDocId = openBundleDocId(order.giverId, order.receiverId, addressKey);
  const bundleSnap = await transaction.collection('shipment_bundles').doc(bundleDocId).get();
  const existing = bundleSnap.data || null;
  const candidate = existing
    ? pickMergeCandidate([{ ...existing, _id: bundleDocId }], now)
    : null;
  return { addressKey, bundleDocId, existing, candidate };
}

async function applyBundleAttachPlan(transaction, order, plan, _) {
  const now = nowIso();
  const { addressKey, bundleDocId, existing, candidate } = plan;

  if (candidate && candidate._id) {
    const bundleOrderCount = (candidate.orderIds || []).length + 1;
    await transaction.collection('shipment_bundles').doc(bundleDocId).update({
      data: {
        orderIds: _.push(order._id),
        updatedAt: now,
      },
    });
    await writeOrderBundleMeta(transaction, order._id, bundleDocId, bundleOrderCount);
    return { merged: true, bundleId: bundleDocId, bundleOrderCount };
  }

  const bundleOrderCount = 1;
  const payload = {
    giverId: order.giverId,
    receiverId: order.receiverId,
    addressKey,
    addressSnapshot: normalizeAddressSnapshot(order.addressSnapshot),
    orderIds: [order._id],
    status: 'OPEN',
    trackingNo: '',
    expressCompany: '',
    updatedAt: now,
  };
  if (existing) {
    await transaction.collection('shipment_bundles').doc(bundleDocId).update({
      data: {
        ...payload,
        createdAt: existing.createdAt || now,
      },
    });
  } else {
    await transaction.collection('shipment_bundles').doc(bundleDocId).set({
      data: {
        ...payload,
        createdAt: now,
      },
    });
  }
  await writeOrderBundleMeta(transaction, order._id, bundleDocId, bundleOrderCount);
  return { merged: false, bundleId: bundleDocId, bundleOrderCount };
}

async function attachOrderToBundle(transaction, order, _) {
  const now = nowIso();
  const plan = await loadBundleAttachPlan(transaction, order, now);
  return applyBundleAttachPlan(transaction, order, plan, _);
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
  openBundleDocId,
  canMergeOpenBundle,
  pickMergeCandidate,
  loadBundleAttachPlan,
  applyBundleAttachPlan,
  attachOrderToBundle,
  removeOrderFromBundle,
  loadBundleByRef,
  shipBundlePendingOrders,
  earliestShipDeadline,
  BUNDLE_MAX_ORDERS,
};
