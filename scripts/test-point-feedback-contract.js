const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const pointFeedback = require('../miniprogram/utils/pointFeedback');
const pointEffects = require('../cloudfunctions/api/lib/pointEffects');
const driftHandler = read('cloudfunctions/api/handlers/drift.js');
const shelfHandler = read('cloudfunctions/api/handlers/shelf.js');
const claimJs = read('miniprogram/pages/drift/claim.js');
const orderDetailJs = read('miniprogram/pages/drift/order-detail.js');
const receivedJs = read('miniprogram/pages/drift/received.js');
const givenJs = read('miniprogram/pages/drift/given.js');
const shipJs = read('miniprogram/pages/drift/ship.js');
const redeemJs = read('miniprogram/pages/shelf/redeem-capacity.js');
const redeemWxml = read('miniprogram/pages/shelf/redeem-capacity.wxml');
const checkResultJs = read('miniprogram/pages/drift/check-result.js');
const checkResultWxml = read('miniprogram/pages/drift/check-result.wxml');

assert.ok(
  pointFeedback.buildClaimConfirmContent(5).includes('先占用 5 公益积分'),
  'claim confirm should state occupied public points',
);
assert.ok(
  pointFeedback.buildClaimConfirmContent(5).includes('从占用中结算'),
  'claim confirm should describe settlement from occupied points',
);
assert.ok(
  pointFeedback.buildClaimSuccessTitle({ coinOccupied: 5 }) === '申请已提交',
  'claim success should stay concise after confirm modal already explained points',
);
assert.ok(
  pointFeedback.buildCancelConfirmContent({ role: 'RECEIVER', coinValue: 3, creditDelta: -2 }).includes('扣除 2 信用积分')
    && pointFeedback.buildCancelConfirmContent({ role: 'RECEIVER', coinValue: 3, creditDelta: -2 }).includes('占用的 3 公益积分将释放'),
  'receiver cancel confirm should require explicit credit deduction acknowledgement',
);
assert.ok(
  pointFeedback.buildCancelConfirmContent({ role: 'GIVER', coinValue: 5, creditDelta: -5 }).includes('扣除 5 信用积分'),
  'giver cancel confirm should require explicit credit deduction acknowledgement',
);
assert.ok(
  typeof pointFeedback.promptCancelConfirm === 'function',
  'cancel flows should use a dedicated confirm modal helper',
);
assert.ok(
  pointFeedback.buildConfirmReceiveContent({ coinValue: 4, creditBonus: 2 }).includes('扣除 4 公益积分')
    && pointFeedback.buildConfirmReceiveContent({ coinValue: 4, creditBonus: 2 }).includes('信用积分 +2'),
  'confirm receive should show spend and credit gain',
);
assert.ok(
  pointFeedback.buildRedeemConfirmContent(2).includes('扣除 2 公益积分'),
  'redeem confirm should show coin spend',
);

assert.deepStrictEqual(
  pointEffects.buildCancelPointEffects({ role: 'GIVER', coinValue: 5, drift: { publishRewardGranted: true, publishRewardCredited: 2 } }),
  { creditDelta: -5, coinReleased: 5, publishRewardRevoked: 2 },
  'cancel effects should expose coin release, credit delta, and publish reward revoke',
);
assert.deepStrictEqual(
  pointEffects.buildConfirmPointEffects(6),
  { coinSpent: 6, creditDelta: 2 },
  'confirm effects should expose coin spend and credit gain',
);

assert.ok(driftHandler.includes('pointEffects') && driftHandler.includes('buildCancelPointEffects'), 'drift cancel should return point effects');
assert.ok(driftHandler.includes('buildConfirmPointEffects') && driftHandler.includes('pointEffects: pointEffects'), 'drift confirm should return point effects');
assert.ok(driftHandler.includes('publishReward'), 'publish/check should expose audit reward amount');
assert.ok(shelfHandler.includes('pointEffects: { coinSpent: coinCost }'), 'redeem capacity should return coin spend');

assert.ok(claimJs.includes('buildClaimConfirmContent') && claimJs.includes('buildClaimSuccessTitle'), 'claim page should use point feedback helpers');
assert.ok(orderDetailJs.includes('promptCancelConfirm') && orderDetailJs.includes('buildConfirmReceiveContent'), 'order detail should confirm point changes');
assert.ok(redeemJs.includes('buildRedeemConfirmContent') && redeemJs.includes('buildRedeemSuccessTitle'), 'redeem page should confirm and toast coin spend');
assert.ok(redeemJs.includes('wallet.available') && redeemWxml.includes('{{available}}'), 'redeem page should use available public points instead of total balance');
assert.ok(redeemJs.includes('showError: false') && redeemJs.includes('nextShelfLimit'), 'redeem page should show api errors after loading and compute next shelf limit in js');
assert.ok(checkResultJs.includes('publishReward'), 'check result should load publish reward amount');
assert.ok(receivedJs.includes('buildConfirmReceiveContent') && receivedJs.includes('buildConfirmReceiveSuccessTitle'), 'received list should confirm point changes');
assert.ok(orderDetailJs.includes('buildCancelSuccessTitle()'), 'order detail cancel should only toast after confirmed cancel');
assert.ok(givenJs.includes('promptCancelConfirm'), 'given cancel should wait for confirm before deducting credit');
assert.ok(shipJs.includes('promptCancelConfirm'), 'ship cancel should wait for confirm before deducting credit');
assert.ok(checkResultWxml.includes('上漂奖励') && checkResultWxml.includes('+{{publishReward}} 公益积分'), 'check result should show publish reward on page');
assert.ok(!checkResultJs.includes('buildPublishAuditRewardLine'), 'check result should not toast publish reward separately');

console.log('point feedback contract ok');
