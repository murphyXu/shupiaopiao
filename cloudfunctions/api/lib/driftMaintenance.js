const { shipDeadlineAt, autoCompleteAt } = require('./driftPolicy');

const PENDING_SHIP_SCAN_LIMIT = 500;
const SHIPPED_SCAN_LIMIT = 500;

function resolveShipDeadline(order = {}) {
  const base = order.claimedAt || order.createdAt;
  if (base) return shipDeadlineAt(base);
  return String(order.shipDeadlineAt || '').trim();
}

function resolveAutoCompleteDeadline(order = {}) {
  const base = order.shippedAt || order.createdAt;
  if (base) return autoCompleteAt(base);
  return String(order.autoCompleteAt || '').trim();
}

function isShipDeadlinePassed(order = {}, nowIso = '') {
  if (!order || order.status !== 'PENDING_SHIP') return false;
  const deadline = resolveShipDeadline(order);
  return !!deadline && deadline <= nowIso;
}

function isAutoCompletePassed(order = {}, nowIso = '') {
  if (!order || order.status !== 'SHIPPED') return false;
  const deadline = resolveAutoCompleteDeadline(order);
  return !!deadline && deadline <= nowIso;
}

function shipDeadlineBackfill(order = {}) {
  const resolved = resolveShipDeadline(order);
  if (!resolved || resolved === order.shipDeadlineAt) return null;
  return { shipDeadlineAt: resolved };
}

function autoCompleteBackfill(order = {}) {
  const resolved = resolveAutoCompleteDeadline(order);
  if (!resolved || resolved === order.autoCompleteAt) return null;
  return { autoCompleteAt: resolved };
}

function partitionPendingShipMaintenance(orders = [], nowIso = '') {
  const dueCancel = [];
  const backfills = [];
  orders.forEach((order) => {
    if (order.status !== 'PENDING_SHIP') return;
    const patch = shipDeadlineBackfill(order);
    if (patch) backfills.push({ id: order._id, patch });
    if (isShipDeadlinePassed(order, nowIso)) dueCancel.push(order);
  });
  return { dueCancel, backfills };
}

function partitionShippedMaintenance(orders = [], nowIso = '') {
  const dueComplete = [];
  const backfills = [];
  orders.forEach((order) => {
    if (order.status !== 'SHIPPED') return;
    const patch = autoCompleteBackfill(order);
    if (patch) backfills.push({ id: order._id, patch });
    if (isAutoCompletePassed(order, nowIso)) dueComplete.push(order);
  });
  return { dueComplete, backfills };
}

module.exports = {
  PENDING_SHIP_SCAN_LIMIT,
  SHIPPED_SCAN_LIMIT,
  resolveShipDeadline,
  resolveAutoCompleteDeadline,
  isShipDeadlinePassed,
  isAutoCompletePassed,
  shipDeadlineBackfill,
  autoCompleteBackfill,
  partitionPendingShipMaintenance,
  partitionShippedMaintenance,
};
