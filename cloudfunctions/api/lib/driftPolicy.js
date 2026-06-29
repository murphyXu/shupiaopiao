const BUNDLE_MERGE_WINDOW_HOURS = 48;
const BUNDLE_MAX_ORDERS = 5;
const LIGHTWEIGHT_COIN_THRESHOLD = 3;
const LIGHTWEIGHT_PRICE_THRESHOLD = 20;
const SHIP_DEADLINE_HOURS = 72;
const AUTO_COMPLETE_DAYS = 10;

const PUBLISH_RATE_LIMIT_STATUSES = ['PENDING_REVIEW', 'IN_POOL', 'CLAIMED', 'COMPLETED'];

const STAGES = {
  cold: { signupBonus: 0, firstGiveBonus: 10, publishReward: 2, publishRewardCap: 2, inviteReward: 2, inflightLimit: 5, publishDailyLimit: 100 },
  cycle: { signupBonus: 0, firstGiveBonus: 5, publishReward: 2, publishRewardCap: 2, inviteReward: 2, inflightLimit: 5, publishDailyLimit: 100 },
  mature: { signupBonus: 0, firstGiveBonus: 0, publishReward: 2, publishRewardCap: 2, inviteReward: 2, inflightLimit: 5, publishDailyLimit: 100 },
};

const SHELF_CAPACITY_PER_COIN = 10;

function isLightweightBook(book = {}) {
  const coin = Number(book.coinValue) || 0;
  const price = Number(book.listPrice) || 0;
  return coin <= LIGHTWEIGHT_COIN_THRESHOLD || price <= LIGHTWEIGHT_PRICE_THRESHOLD;
}

const CONDITION_FACTORS = {
  new: 1.5,
  like_new: 1,
  good: 0.9,
  seven_new: 0.8,
  below_seven: 0.8,
  fair: 0.8,
};

function policyForStage(stage = 'cold') {
  return { ...(STAGES[stage] || STAGES.cold) };
}

function calculateCoinValue(listPrice, condition, medianPrice) {
  const median = Math.max(Number(medianPrice) || 0, 0);
  const factor = CONDITION_FACTORS[condition] || 0.8;
  if (median > 0) {
    return Math.max(Math.round(median * factor), 0);
  }
  const price = Math.max(Number(listPrice) || 0, 0);
  return Math.max(Math.round(price * factor * 0.2), 0);
}

function resolveRequestedCoinValue(systemCoinValue, requested) {
  const system = Math.max(Math.floor(Number(systemCoinValue) || 0), 0);
  if (requested === undefined || requested === null || requested === '') {
    return { coinValue: system, systemCoinValue: system };
  }
  const value = Math.floor(Number(requested));
  if (!Number.isFinite(value)) return { error: 'INVALID_COIN_VALUE' };
  if (value < 0) return { error: 'COIN_VALUE_TOO_LOW' };
  if (value > system) return { error: 'COIN_VALUE_TOO_HIGH' };
  return { coinValue: value, systemCoinValue: system };
}

function availableCoin(user = {}) {
  return Math.max((Number(user.coinBalance) || 0) - (Number(user.coinFrozen) || 0), 0);
}

function addHours(iso, hours) {
  return new Date(new Date(iso).getTime() + hours * 3600000).toISOString();
}

function addDays(iso, days) {
  return addHours(iso, days * 24);
}

function shipDeadlineAt(baseIso) {
  if (!baseIso) return '';
  return addHours(baseIso, SHIP_DEADLINE_HOURS);
}

function autoCompleteAt(baseIso) {
  if (!baseIso) return '';
  return addDays(baseIso, AUTO_COMPLETE_DAYS);
}

function cancelCreditChange(role) {
  if (role === 'RECEIVER') return { target: 'receiver', delta: -2 };
  if (role === 'GIVER') return { target: 'giver', delta: -5 };
  if (role === 'SYSTEM') return { target: 'giver', delta: -10 };
  return null;
}

function applyPendingPenalty(incoming, pending) {
  const amount = Math.max(Number(incoming) || 0, 0);
  const pendingBefore = Math.max(Number(pending) || 0, 0);
  const offset = Math.min(amount, pendingBefore);
  return {
    credited: amount - offset,
    offset,
    pendingAfter: pendingBefore - offset,
  };
}

function splitViolationPenalty(penalty, available) {
  const amount = Math.max(Number(penalty) || 0, 0);
  const usable = Math.max(Number(available) || 0, 0);
  const deducted = Math.min(amount, usable);
  return {
    deducted,
    pending: amount - deducted,
  };
}

module.exports = {
  BUNDLE_MERGE_WINDOW_HOURS,
  BUNDLE_MAX_ORDERS,
  LIGHTWEIGHT_COIN_THRESHOLD,
  LIGHTWEIGHT_PRICE_THRESHOLD,
  SHIP_DEADLINE_HOURS,
  AUTO_COMPLETE_DAYS,
  PUBLISH_RATE_LIMIT_STATUSES,
  STAGES,
  SHELF_CAPACITY_PER_COIN,
  CONDITION_FACTORS,
  policyForStage,
  calculateCoinValue,
  resolveRequestedCoinValue,
  availableCoin,
  addHours,
  addDays,
  shipDeadlineAt,
  autoCompleteAt,
  isLightweightBook,
  cancelCreditChange,
  applyPendingPenalty,
  splitViolationPenalty,
};
