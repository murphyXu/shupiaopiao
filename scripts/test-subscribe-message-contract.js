const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

const subscribeLib = read('cloudfunctions/api/lib/subscribeMessage.js');
const drift = read('cloudfunctions/api/handlers/drift.js');
const apiIndex = read('cloudfunctions/api/index.js');
const apiConfig = read('cloudfunctions/api/config.json');
const initDb = read('cloudfunctions/init-db/collections.js');
const subscribeUtil = read('miniprogram/utils/subscribe.js');
const checkResult = read('miniprogram/pages/drift/check-result.js');
const checkWxml = read('miniprogram/pages/drift/check-result.wxml');
const givenJs = read('miniprogram/pages/drift/given.js');
const givenWxml = read('miniprogram/pages/drift/given.wxml');
const minApi = read('miniprogram/utils/api.js');
const config = read('miniprogram/config/index.js');

assert.ok(subscribeLib.includes('Gw6HlIXjcKwN2uhfvnQMpjInSj-a9dCAabcwxGWUBlg'), 'claim notify template id should be configured');
assert.ok(subscribeLib.includes('w1maSH93gEzVNejUv04-kqiat9ezvkYznjkUreW003I'), 'ship remind template id should be configured');
assert.ok(subscribeLib.includes('已接漂'), 'claim status text should fit phrase field limit');
assert.ok(subscribeLib.includes('请尽快寄出'), 'ship remind hint should fit phrase field limit');
assert.ok(subscribeLib.includes('getTemplateList') && subscribeLib.includes('buildDataFromPrivateTemplate'), 'subscribe should resolve fields from private template list');
assert.ok(subscribeLib.includes('resendClaimNotifyForGrant'), 'should support resending failed claim notify');
assert.ok(apiConfig.includes('subscribeMessage.getTemplateList'), 'cloud function should declare getTemplateList openapi');
assert.ok(subscribeLib.includes('subscribe_grants') && subscribeLib.includes('consumed: _.neq(true)'), 'grants should be stored until consumed');
assert.ok(subscribeLib.includes('miniprogramStatesToTry') && subscribeLib.includes("'developer'"), 'subscribe send should try developer state in dev');
assert.ok(subscribeLib.includes('lastSendError') && subscribeLib.includes('SUBSCRIBE_CLAIM_FAILED'), 'subscribe failures should be logged for diagnosis');
assert.ok(!subscribeLib.includes("orderBy('grantedAt'"), 'grant lookup should not require composite index orderBy');

assert.ok(drift.includes('reportSubscribe') && drift.includes('notifyGiverOnClaim'), 'drift handler should report grants and notify on claim');
assert.ok(drift.includes('subscribeNotify'), 'claim response should expose subscribe notify outcome for debugging');
assert.ok(drift.includes('sendShipRemindBatch'), 'maintenance should send ship remind notices');

assert.ok(apiIndex.includes("'drift.subscribeDebug'"), 'api router should expose drift.subscribeDebug');
assert.ok(apiConfig.includes('subscribeMessage.send'), 'cloud function should declare subscribeMessage.send openapi');

assert.ok(initDb.includes('subscribe_grants'), 'init-db should create subscribe_grants collection');

assert.ok(subscribeUtil.includes('requestSubscribeMessage') && subscribeUtil.includes('reportDriftSubscribe'), 'frontend subscribe util should request and report grants');
assert.ok(subscribeUtil.includes('claimNotify') && subscribeUtil.includes('shipRemind'), 'frontend should request both drift templates');

assert.ok(checkResult.includes('enableSubscribeNotify') && checkWxml.includes('接漂时微信提醒我'), 'check result should offer optional subscribe action');
assert.ok(checkWxml.includes('拒绝不影响漂流与发货'), 'check result should clarify subscribe is optional');

assert.ok(givenJs.includes('enableSubscribeNotify') && givenWxml.includes('开启微信提醒'), 'given list should offer subscribe re-auth');
assert.ok(givenJs.includes('pending.driftId'), 'given subscribe should bind to a pending drift');

assert.ok(minApi.includes('reportDriftSubscribe'), 'miniprogram api should call drift.reportSubscribe');
assert.ok(config.includes('claimNotify') && config.includes('shipRemind'), 'miniprogram config should expose subscribe template ids');

console.log('subscribe message contract ok');
