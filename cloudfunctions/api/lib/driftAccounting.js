function eventId(refId, type, userId) {
  return `${refId}-${type}-${userId}`;
}

function compactEventData(data = {}) {
  const result = {};
  Object.entries(data).forEach(([key, value]) => {
    if (value === undefined) return;
    if (typeof value === 'number' && !Number.isFinite(value)) return;
    result[key] = value;
  });
  return result;
}

async function writeCoinEvent(transaction, data) {
  const id = eventId(data.refId, data.type, data.userId);
  await transaction.collection('coin_transactions').doc(id).set({
    data: compactEventData({ amount: Number(data.balanceDelta) || 0, ...data }),
  });
  return id;
}

async function writeCreditEvent(transaction, data) {
  const id = eventId(data.refId, data.reasonCode, data.userId);
  await transaction.collection('credit_logs').doc(id).set({
    data: compactEventData({ reason: data.reason || data.reasonCode, ...data }),
  });
  return id;
}

async function writeOrderEvent(transaction, data) {
  const id = `${data.orderId}-${data.type}`;
  await transaction.collection('drift_order_events').doc(id).set({ data: compactEventData(data) });
  return id;
}

module.exports = { eventId, writeCoinEvent, writeCreditEvent, writeOrderEvent };
