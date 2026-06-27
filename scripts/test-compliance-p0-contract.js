const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

const apiIndex = read('cloudfunctions/api/index.js');
const driftHandler = read('cloudfunctions/api/handlers/drift.js');
const shelfHandler = read('cloudfunctions/api/handlers/shelf.js');
const authHandler = read('cloudfunctions/api/handlers/auth.js');
const dbLib = read('cloudfunctions/api/lib/db.js');
const reportHandlerPath = path.join(__dirname, '..', 'cloudfunctions/api/handlers/report.js');
const securityPath = path.join(__dirname, '..', 'cloudfunctions/api/lib/contentSecurity.js');

assert.ok(fs.existsSync(securityPath), 'content security helper should exist');
const security = read('cloudfunctions/api/lib/contentSecurity.js');
assert.ok(security.includes('msgSecCheck'), 'text UGC should call WeChat msgSecCheck');
assert.ok(security.includes('mediaCheckAsync'), 'image UGC should call WeChat mediaCheckAsync');
assert.ok(security.includes('assertSafeTextFields'), 'security helper should expose text field guard');
assert.ok(security.includes('assertSafeMediaFiles'), 'security helper should expose media file guard');

assert.ok(driftHandler.includes('assertSafeTextFields') && driftHandler.includes('assertSafeMediaFiles'), 'drift publish/review should run text and media checks');
assert.ok(shelfHandler.includes('assertSafeTextFields'), 'shelf metadata text should run content checks');
assert.ok(!shelfHandler.includes('data.cover') && !shelfHandler.includes('data.summary'), 'manual shelf add should not accept user cover or free-form summary');
assert.ok(authHandler.includes('assertSafeTextFields'), 'profile nickname and shelf name should run content checks');

const apiConfig = read('cloudfunctions/api/config.json');
assert.ok(
  apiConfig.includes('security.msgSecCheck') && apiConfig.includes('security.mediaCheckAsync'),
  'api cloud function should declare content security openapi permissions',
);

assert.ok(fs.existsSync(reportHandlerPath), 'report handler should exist');
const reportHandler = read('cloudfunctions/api/handlers/report.js');
assert.ok(reportHandler.includes("db.collection('reports')"), 'reports should be stored in reports collection');
assert.ok(reportHandler.includes('assertSafeTextFields'), 'report reason should run text safety check');
assert.ok(apiIndex.includes("'report.create'"), 'api should expose report.create route');

const poolDetailWxml = read('miniprogram/pages/pool/detail.wxml');
const bookDetailWxml = read('miniprogram/pages/book/detail.wxml');
assert.ok(poolDetailWxml.includes('bindtap="reportItem"') && poolDetailWxml.includes('举报'), 'pool detail should expose report entry');
assert.ok(!bookDetailWxml.includes('reportNote') && !bookDetailWxml.includes('大家的读书笔记'), 'book detail should not expose social reader notes for personal-subject review');

const settingsWxml = read('miniprogram/pages/mine/settings.wxml');
assert.ok(!settingsWxml.includes('地址信息加密存储'), 'privacy copy should not claim encryption if storage is plaintext');
assert.ok(settingsWxml.includes('仅用于领取漂流图书'), 'privacy copy should state address purpose');
assert.ok(settingsWxml.includes('积分规则') && settingsWxml.includes('pointRules.sections'), 'settings should explain public points and credit points to normal users');
const pointRulesLib = read('miniprogram/utils/pointRules.js');
assert.ok(pointRulesLib.includes('公益积分 · 加分') && pointRulesLib.includes('信用积分 · 扣分'), 'settings point rules should list user-facing earn and penalty standards');
assert.ok(pointRulesLib.includes('发货前取消上漂') && pointRulesLib.includes('已接漂未收货最多'), 'settings should explain user-facing point rollback and in-flight claim limit');
assert.ok(pointRulesLib.includes('shelfCapacityPerCoin: 10'), 'point rules should define shelf capacity redeem ratio');
assert.ok(pointRulesLib.includes('inviteLifetimeTimes: 5') && pointRulesLib.includes('不设单日上限') && !pointRulesLib.includes('inviteDailyCap'), 'invite reward rules should cap at five times with no daily limit');
assert.ok(!settingsWxml.includes('publishRewardCap') && !settingsWxml.includes('inflightLimit') && !settingsWxml.includes('REPORT_HIDE_THRESHOLD'), 'settings should not expose internal strategy names or thresholds');

const mineWxml = read('miniprogram/pages/mine/index.wxml');
const mineJs = read('miniprogram/pages/mine/index.js');
assert.ok(!mineWxml.includes('邀请成功可得 5 公益积分'), 'mine page should not use direct invite-for-points inducement copy');
assert.ok(
  mineWxml.includes('邀请规则') || mineWxml.includes('共建奖励') || (mineWxml.includes('invite-reward') && mineJs.includes('inviteRewardSummary') && pointRulesLib.includes('共建奖励')),
  'mine page should use neutral invitation rule wording',
);
assert.ok(!mineWxml.includes('充值') && !mineWxml.includes('提现'), 'mine page should avoid recharge and withdrawal wording');
assert.ok(dbLib.includes('settleInviteReward'), 'invite reward should be settled after meaningful interaction');
assert.ok(!dbLib.includes('rewardInviter(inviterId, id)'), 'new user login should not immediately grant invite reward');
assert.ok(shelfHandler.includes('settleInviteReward') && driftHandler.includes('settleInviteReward'), 'shelf or drift interactions should trigger invite reward settlement');

const walletJson = read('miniprogram/pages/mine/wallet.json');
assert.ok(!walletJson.includes('钱包'), '公益积分 page title should avoid wallet wording');

console.log('compliance p0 contract ok');
