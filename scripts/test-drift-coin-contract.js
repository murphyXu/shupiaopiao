const assert = require('assert');
const fs = require('fs');
const path = require('path');

const driftHandler = fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/handlers/drift.js'), 'utf8');
const dbLib = fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/lib/db.js'), 'utf8');
const authHandler = fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/handlers/auth.js'), 'utf8');
const apiRoutes = fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/index.js'), 'utf8');
const utilSource = fs.readFileSync(path.join(__dirname, '../miniprogram/utils/util.js'), 'utf8');
const miniApi = fs.readFileSync(path.join(__dirname, '../miniprogram/utils/api.js'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, '../miniprogram/app.js'), 'utf8');
const loginJs = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/auth/login.js'), 'utf8');
const mineJs = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/mine/index.js'), 'utf8');
const mineWxml = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/mine/index.wxml'), 'utf8');

assert.ok(driftHandler.includes('formatDriftOnlyRecord'), 'given records should include published drifts before they are claimed');
assert.ok(driftHandler.includes("db.collection('drifts').where({ userId: user._id })"), 'given records should query drifts by publisher userId');
assert.ok(utilSource.includes('IN_POOL') && utilSource.includes('待接漂'), 'frontend status map should include unclaimed drift status');
assert.ok(utilSource.includes('PENDING_REVIEW') && utilSource.includes('REJECTED'), 'frontend status map should include pending/rejected drift status');

assert.ok(dbLib.includes('SIGNUP_BONUS = 0'), 'new user signup bonus should be zero public points');
assert.ok(dbLib.includes('coinBalance: SIGNUP_BONUS'), 'new user balance should use signup bonus constant');
assert.ok(dbLib.includes('INVITE_REWARD = 2'), 'invite reward should be two public points');
assert.ok(dbLib.includes('INVITE_LIFETIME_CAP = 10'), 'invite reward should have a 10-point lifetime cap');
assert.ok(!dbLib.includes('INVITE_DAILY_CAP'), 'invite reward should not have a daily cap');
assert.ok(dbLib.includes("type: 'invite_reward'"), 'invite reward should be recorded as a distinct public-points source');
assert.ok(driftHandler.includes('publishRewardCap') && driftHandler.includes('publishRewardCount'), 'publish reward should be capped per user');
assert.ok(driftHandler.includes('awardedTimes >= config.publishRewardCap'), 'publish reward cap should count reward times not points');
assert.ok(driftHandler.includes('publishRewardCount: _.inc(1)'), 'publish reward count should increment once per granted reward');
assert.ok(driftHandler.includes('publishRewardAmount') && driftHandler.includes('publishRewardCredited') && driftHandler.includes('publishRewardOffset'), 'publish reward should persist rollback metadata');
assert.ok(driftHandler.includes('removeOrderFromBundle') && driftHandler.includes('bundleId: \'\''), 'cancelled orders should detach and clear bundle metadata');

assert.ok(authHandler.includes('inviterId') && apiRoutes.includes('auth.login') && apiRoutes.includes('data, openid'), 'login should pass inviterId to auth handler');
assert.ok(miniApi.includes('login: (inviterId') && loginJs.includes('pendingInviterId'), 'client login should send pending inviterId');
assert.ok(appJs.includes('captureInvite') && appJs.includes('pendingInviterId'), 'app should capture inviterId from share query');
assert.ok(mineJs.includes('onShareAppMessage') && mineWxml.includes('open-type="share"'), 'mine page should expose invite sharing entry');

console.log('drift coin contract ok');
