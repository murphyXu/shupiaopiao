const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { resolveRequestedCoinValue, calculateCoinValue } = require('../cloudfunctions/api/lib/driftPolicy');

const root = path.join(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

assert.deepStrictEqual(resolveRequestedCoinValue(5, undefined), { coinValue: 5, systemCoinValue: 5 });
assert.deepStrictEqual(resolveRequestedCoinValue(5, null), { coinValue: 5, systemCoinValue: 5 });
assert.deepStrictEqual(resolveRequestedCoinValue(5, ''), { coinValue: 5, systemCoinValue: 5 });
assert.deepStrictEqual(resolveRequestedCoinValue(5, 3), { coinValue: 3, systemCoinValue: 5 });
assert.deepStrictEqual(resolveRequestedCoinValue(5, 0), { coinValue: 0, systemCoinValue: 5 });
assert.deepStrictEqual(resolveRequestedCoinValue(5, 3.9), { coinValue: 3, systemCoinValue: 5 });
assert.deepStrictEqual(resolveRequestedCoinValue(0, 0), { coinValue: 0, systemCoinValue: 0 });
assert.strictEqual(resolveRequestedCoinValue(5, -1).error, 'COIN_VALUE_TOO_LOW');
assert.strictEqual(resolveRequestedCoinValue(5, 6).error, 'COIN_VALUE_TOO_HIGH');
assert.strictEqual(resolveRequestedCoinValue(5, 'abc').error, 'INVALID_COIN_VALUE');

const driftHandler = read('cloudfunctions/api/handlers/drift.js');
const publishJs = read('miniprogram/pages/drift/publish.js');
const publishWxml = read('miniprogram/pages/drift/publish.wxml');
const checkResultWxml = read('miniprogram/pages/drift/check-result.wxml');
const pointRules = read('miniprogram/utils/pointRules.js');

assert.ok(driftHandler.includes('resolveRequestedCoinValue'), 'publish should validate requested coin value');
assert.ok(driftHandler.includes('systemCoinValue'), 'drift should persist systemCoinValue');
assert.ok(driftHandler.includes('流转积分不能高于系统建议值'), 'publish should reject values above system suggestion');
assert.ok(driftHandler.includes('orderCoinValue === 0 ? 0'), 'zero coin completion should skip first give bonus');
assert.ok(driftHandler.includes('if (firstBonus > 0) giverPatch.firstGiveRewarded = true'), 'zero coin completion should not consume first give entitlement');

assert.ok(publishJs.includes('decreaseCoinValue') && publishJs.includes('increaseCoinValue'), 'publish page should expose stepper handlers');
assert.ok(publishJs.includes('confirmZeroCoinValue') && publishJs.includes('coinValue: this.data.coinValue'), 'publish submit should confirm zero and send coinValue');
assert.ok(publishWxml.includes('coin-stepper') && publishWxml.includes('系统建议'), 'publish page should show system suggestion and stepper');
assert.ok(!publishWxml.includes('用户不能自行定价'), 'publish page should remove old non-adjustable copy');

assert.ok(checkResultWxml.includes('本次无流转积分') && checkResultWxml.includes('首次完成赠书奖励'), 'check result should explain zero coin outcome');
assert.ok(pointRules.includes('0 积分完成不计'), 'point rules should document zero coin first-give exception');

assert.strictEqual(calculateCoinValue(15, 'like_new'), resolveRequestedCoinValue(calculateCoinValue(15, 'like_new')).coinValue, 'default requested value should match system value');

console.log('drift coin value adjustment contract ok');
