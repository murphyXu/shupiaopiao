const BUNDLE_INACTIVE_ORDER_STATUSES = new Set(['CANCELLED', 'CLOSED', 'COMPLETED']);
const BUNDLE_INACTIVE_BUNDLE_STATUSES = new Set(['DISSOLVED']);

function isActiveBundleOrder(order = {}) {
  return !!order.bundleId && !BUNDLE_INACTIVE_ORDER_STATUSES.has(order.status);
}

function activeBundleOrderCount(bundle = null) {
  if (!bundle || BUNDLE_INACTIVE_BUNDLE_STATUSES.has(bundle.status)) return 0;
  return (bundle.orderIds || []).length;
}

function bundleBadgeLabel(order = {}, bundle = null) {
  if (!isActiveBundleOrder(order)) return '';
  const count = activeBundleOrderCount(bundle);
  if (count <= 1) return '';
  return `同包裹 · ${count} 本`;
}

async function loadBundleMap(db, _, bundleIds = []) {
  const ids = [...new Set(bundleIds.filter(Boolean))];
  if (!ids.length) return {};
  const { data } = await db.collection('shipment_bundles').where({ _id: _.in(ids) }).limit(100).get();
  return Object.fromEntries(data.map((row) => [row._id, row]));
}

function enrichFormattedOrder(order, bundleMap = {}) {
  const bundle = order.bundleId ? bundleMap[order.bundleId] : null;
  const bundleActiveCount = isActiveBundleOrder(order) ? activeBundleOrderCount(bundle) : 0;
  return {
    ...order,
    bundleActiveCount,
    bundleBadge: bundleBadgeLabel(order, bundle),
  };
}

async function enrichOrderList(db, _, rows = [], formatRow) {
  const formatted = rows.map(formatRow);
  const bundleMap = await loadBundleMap(db, _, formatted.map((row) => row.bundleId));
  return formatted.map((row) => enrichFormattedOrder(row, bundleMap));
}

function buildOrderDetailBundle(order, bundleRow, siblings = []) {
  if (!order.bundleId || !bundleRow || BUNDLE_INACTIVE_BUNDLE_STATUSES.has(bundleRow.status)) return null;
  const activeSiblings = siblings.filter((row) => !BUNDLE_INACTIVE_ORDER_STATUSES.has(row.status));
  const activeCount = activeBundleOrderCount(bundleRow);
  if (activeCount <= 1 || !activeSiblings.length) return null;
  return {
    id: bundleRow._id,
    orderCount: activeCount,
    siblings: activeSiblings
      .sort((a, b) => (a.bundleSeq || 0) - (b.bundleSeq || 0))
      .map((row) => row),
  };
}

module.exports = {
  BUNDLE_INACTIVE_ORDER_STATUSES,
  isActiveBundleOrder,
  activeBundleOrderCount,
  bundleBadgeLabel,
  loadBundleMap,
  enrichFormattedOrder,
  enrichOrderList,
  buildOrderDetailBundle,
};
