const CONDITION_FACTORS = { new: 1.5, like_new: 1, good: 0.9, seven_new: 0.8, below_seven: 0.8 };

function parseListPrice(value) {
  const match = String(value || '').replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

function calculateSystemCoinValue(book, condition) {
  const price = parseListPrice(book && book.listPrice);
  return Math.max(Math.round(price * (CONDITION_FACTORS[condition] || 0.8) * 0.2), 0);
}

function clampCoinValue(coinValue, systemCoinValue) {
  const system = Math.max(Math.floor(Number(systemCoinValue) || 0), 0);
  const value = Math.floor(Number(coinValue) || 0);
  return Math.max(0, Math.min(value, system));
}

function coinHintText(coinValue, systemCoinValue) {
  const value = Number(coinValue) || 0;
  const system = Number(systemCoinValue) || 0;
  if (value === 0) {
    return '接漂方无需消耗公益积分；完成赠书后无流转积分，且不计入首次完成赠书奖励。';
  }
  if (value < system) {
    return '你已调低流转积分，接漂更容易；完成赠书后你将获得相应流转积分。';
  }
  return '按系统建议，接漂方需占用相应公益积分，完成赠书后你将获得相同流转积分。';
}

function pricingState(book, condition, currentCoinValue) {
  const sourceIsEstimate = book && book.listPriceSource === 'pricing_cache';
  const listPrice = sourceIsEstimate ? 0 : parseListPrice(book && book.listPrice);
  const systemCoinValue = listPrice ? calculateSystemCoinValue(book, condition) : 0;
  const coinValue = listPrice
    ? clampCoinValue(currentCoinValue === undefined ? systemCoinValue : currentCoinValue, systemCoinValue)
    : 0;
  return {
    listPrice,
    systemCoinValue,
    coinValue,
    coinHint: coinHintText(coinValue, systemCoinValue),
    hasListPrice: listPrice > 0,
  };
}

module.exports = {
  parseListPrice,
  calculateSystemCoinValue,
  clampCoinValue,
  coinHintText,
  pricingState,
};
