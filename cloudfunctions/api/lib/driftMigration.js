const ACTIVE_LEGACY_STATUSES = new Set(['PENDING_SHIP', 'SHIPPED', 'DISPUTED']);

async function ensureAccountingV2(transaction, order, command, orderId = '') {
  if (!order) throw new Error('ORDER_NOT_FOUND');
  const resolvedId = order._id || orderId;
  if (!resolvedId) throw new Error('ORDER_NOT_FOUND');
  order = { ...order, _id: resolvedId };
  if (order.accountingVersion === 2) return { migrated: false, order };
  if (order.accountingVersion !== undefined && order.accountingVersion !== null) {
    throw new Error('ACCOUNTING_VERSION_UNSUPPORTED');
  }
  if (!ACTIVE_LEGACY_STATUSES.has(order.status)) {
    throw new Error('ACCOUNTING_VERSION_UNSUPPORTED');
  }

  const eventId = `${order._id}-legacy_accounting_migration-${order.receiverId}`;
  let existing = null;
  try {
    const snapshot = await transaction.collection('drift_order_events').doc(eventId).get();
    existing = snapshot && snapshot.data;
  } catch (err) {
    existing = null;
  }
  if (existing) {
    await transaction.collection('drift_orders').doc(order._id).update({
      data: { accountingVersion: 2, activeCounted: true },
    });
    return { migrated: false, order: { ...order, accountingVersion: 2, activeCounted: true } };
  }

  let coinValue = Number(order.coinValue);
  if (!Number.isFinite(coinValue) && order.driftId) {
    const driftSnapshot = await transaction.collection('drifts').doc(order.driftId).get();
    coinValue = Number(driftSnapshot.data && driftSnapshot.data.coinValue);
  }
  if (!Number.isFinite(coinValue) || coinValue < 0) throw new Error('ACCOUNTING_VERSION_UNSUPPORTED');
  const userPatch = {
    coinBalance: command.inc(coinValue),
    coinFrozen: command.inc(coinValue),
  };
  if (order.activeCounted !== true) userPatch.activeClaimCount = command.inc(1);
  await transaction.collection('users').doc(order.receiverId).update({ data: userPatch });
  await transaction.collection('drift_orders').doc(order._id).update({
    data: { accountingVersion: 2, activeCounted: true, coinValue },
  });
  await transaction.collection('drift_order_events').doc(eventId).set({
    data: {
      orderId: order._id,
      userId: order.receiverId,
      type: 'legacy_accounting_migration',
      balanceDelta: coinValue,
      frozenDelta: coinValue,
      createdAt: new Date().toISOString(),
    },
  });
  return { migrated: true, order: { ...order, accountingVersion: 2, activeCounted: true, coinValue } };
}

module.exports = { ACTIVE_LEGACY_STATUSES, ensureAccountingV2 };
