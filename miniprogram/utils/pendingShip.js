const api = require('./api');
const { isLoggedIn } = require('./util');

async function fetchPendingShipSummary() {
  if (!isLoggedIn()) {
    return { pendingShip: 0 };
  }
  try {
    const res = await api.getDriftSummary();
    return { pendingShip: totalPendingShipCount(res) };
  } catch (err) {
    return { pendingShip: 0 };
  }
}

function totalPendingShipCount(summary = {}) {
  return (Number(summary.pendingShip) || 0) + (Number(summary.waitingShipReceived) || 0);
}

function formatTabBadge(count) {
  const n = Number(count) || 0;
  if (n <= 0) return '';
  if (n > 9) return '9+';
  return String(n);
}

module.exports = {
  fetchPendingShipSummary,
  totalPendingShipCount,
  formatTabBadge,
};
