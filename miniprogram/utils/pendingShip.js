const api = require('./api');
const { isLoggedIn } = require('./util');

async function fetchPendingShipSummary() {
  if (!isLoggedIn()) {
    return { pendingShip: 0 };
  }
  try {
    const res = await api.getDriftSummary();
    return { pendingShip: Number(res.pendingShip) || 0 };
  } catch (err) {
    return { pendingShip: 0 };
  }
}

function formatTabBadge(count) {
  const n = Number(count) || 0;
  if (n <= 0) return '';
  if (n > 9) return '9+';
  return String(n);
}

module.exports = {
  fetchPendingShipSummary,
  formatTabBadge,
};
