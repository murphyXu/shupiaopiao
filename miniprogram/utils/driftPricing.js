const CONDITION_FACTORS = { new: 1.5, like_new: 1, good: 0.9, seven_new: 0.8, below_seven: 0.8 };

function parseListPrice(value) {
  const match = String(value || '').replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

function parseMedianPrice(book) {
  const direct = Number(book && book.medianPrice);
  if (Number.isFinite(direct) && direct > 0) return direct;
  if (book && book.listPriceSource === 'pricing_cache') {
    return parseListPrice(book.listPrice);
  }
  return 0;
}

function calculateSystemCoinValue(book, condition) {
  const medianPrice = parseMedianPrice(book);
  const factor = CONDITION_FACTORS[condition] || 0.8;
  if (medianPrice > 0) {
    return Math.max(Math.round(medianPrice * factor), 0);
  }
  const price = parseListPrice(book && book.listPrice);
  return Math.max(Math.round(price * factor * 0.2), 0);
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
  const medianPrice = parseMedianPrice(book);
  const canPrice = listPrice > 0 || medianPrice > 0;
  const systemCoinValue = canPrice ? calculateSystemCoinValue(book, condition) : 0;
  const coinValue = canPrice
    ? clampCoinValue(currentCoinValue === undefined ? systemCoinValue : currentCoinValue, systemCoinValue)
    : 0;
  return {
    listPrice: listPrice || medianPrice,
    systemCoinValue,
    coinValue,
    coinHint: coinHintText(coinValue, systemCoinValue),
    hasListPrice: canPrice,
  };
}

module.exports = {
  parseListPrice,
  calculateSystemCoinValue,
  clampCoinValue,
  coinHintText,
  pricingState,
};
