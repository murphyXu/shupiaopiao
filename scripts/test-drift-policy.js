const assert = require('assert');
const {
  policyForStage,
  calculateCoinValue,
  resolveRequestedCoinValue,
  availableCoin,
  addHours,
  addDays,
  cancelCreditChange,
  applyPendingPenalty,
  splitViolationPenalty,
} = require('../cloudfunctions/api/lib/driftPolicy');

assert.deepStrictEqual(policyForStage('cold'), {
  signupBonus: 0,
  firstGiveBonus: 10,
  publishReward: 2,
  publishRewardCap: 2,
  inviteReward: 2,
  inflightLimit: 5,
  publishDailyLimit: 100,
});
assert.strictEqual(calculateCoinValue(15, 'new'), 5);
assert.strictEqual(calculateCoinValue(15, 'like_new'), 3);
assert.strictEqual(calculateCoinValue(15, 'good'), 3);
assert.strictEqual(calculateCoinValue(15, 'seven_new'), 2);
assert.strictEqual(calculateCoinValue(73.8, 'like_new', 10.9), 11);
assert.strictEqual(calculateCoinValue(73.8, 'new', 10.9), 16);
assert.deepStrictEqual(resolveRequestedCoinValue(4, 2), { coinValue: 2, systemCoinValue: 4 });
assert.strictEqual(resolveRequestedCoinValue(4, 5).error, 'COIN_VALUE_TOO_HIGH');
assert.strictEqual(availableCoin({ coinBalance: 12, coinFrozen: 5 }), 7);
assert.strictEqual(addHours('2026-06-21T00:00:00.000Z', 72), '2026-06-24T00:00:00.000Z');
assert.strictEqual(addDays('2026-06-21T00:00:00.000Z', 10), '2026-07-01T00:00:00.000Z');
assert.deepStrictEqual(cancelCreditChange('RECEIVER'), { target: 'receiver', delta: -2 });
assert.deepStrictEqual(cancelCreditChange('GIVER'), { target: 'giver', delta: -5 });
assert.deepStrictEqual(cancelCreditChange('SYSTEM'), { target: 'giver', delta: -10 });
assert.deepStrictEqual(applyPendingPenalty(7, 4), { credited: 3, offset: 4, pendingAfter: 0 });
assert.deepStrictEqual(applyPendingPenalty(3, 8), { credited: 0, offset: 3, pendingAfter: 5 });
assert.deepStrictEqual(splitViolationPenalty(6, 4), { deducted: 4, pending: 2 });
console.log('drift policy ok');
