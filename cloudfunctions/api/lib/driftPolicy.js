const STAGES = {
  cold: { signupBonus: 0, firstGiveBonus: 10, publishReward: 2, publishRewardCap: 2, inviteReward: 2, inflightLimit: 2 },
  cycle: { signupBonus: 0, firstGiveBonus: 5, publishReward: 2, publishRewardCap: 2, inviteReward: 2, inflightLimit: 2 },
  mature: { signupBonus: 0, firstGiveBonus: 0, publishReward: 2, publishRewardCap: 2, inviteReward: 2, inflightLimit: 2 },
};

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

function calculateCoinValue(listPrice, condition) {
  const price = Math.max(Number(listPrice) || 0, 0);
  return Math.max(Math.round(price * (CONDITION_FACTORS[condition] || 0.8) * 0.2), 0);
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
  STAGES,
  CONDITION_FACTORS,
  policyForStage,
  calculateCoinValue,
  availableCoin,
  addHours,
  addDays,
  cancelCreditChange,
  applyPendingPenalty,
  splitViolationPenalty,
};
