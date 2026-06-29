const { calculateCoinValue } = require('./driftPolicy');
const { getMedianPriceByIsbn } = require('./pricingCache');

function parseListPrice(value) {
  const match = String(value || '').replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

async function resolveDriftCoinFields(db, drift = {}, book = {}) {
  const condition = drift.condition || 'like_new';
  const listPrice = parseListPrice(drift.listPrice || book.listPrice);
  const medianPrice = await getMedianPriceByIsbn(db, book.isbn);
  const systemCoinValue = calculateCoinValue(listPrice, condition, medianPrice);
  const previousCoinValue = Math.floor(Number(drift.coinValue) || 0);
  const coinValue = Math.max(0, Math.min(previousCoinValue, systemCoinValue));
  return {
    condition,
    listPrice,
    medianPrice,
    systemCoinValue,
    coinValue,
    previousSystemCoinValue: Number(drift.systemCoinValue) || 0,
    previousCoinValue,
  };
}

function pricingChanged(next = {}, drift = {}) {
  return Number(next.systemCoinValue) !== Number(drift.systemCoinValue)
    || Number(next.coinValue) !== Number(drift.coinValue);
}

module.exports = {
  parseListPrice,
  resolveDriftCoinFields,
  pricingChanged,
};
