const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const promptUtil = read('miniprogram/utils/officialAccountPrompt.js');
const config = read('miniprogram/config/index.js');
const checkResultJs = read('miniprogram/pages/drift/check-result.js');
const checkResultWxml = read('miniprogram/pages/drift/check-result.wxml');
const batchResultJs = read('miniprogram/pages/drift/batch-result.js');
const batchResultWxml = read('miniprogram/pages/drift/batch-result.wxml');
const claimJs = read('miniprogram/pages/drift/claim.js');
const receivedJs = read('miniprogram/pages/drift/received.js');
const receivedWxml = read('miniprogram/pages/drift/received.wxml');
const shipJs = read('miniprogram/pages/drift/ship.js');
const orderDetailJs = read('miniprogram/pages/drift/order-detail.js');
const orderDetailWxml = read('miniprogram/pages/drift/order-detail.wxml');
const mineJs = read('miniprogram/pages/mine/index.js');
const mineWxml = read('miniprogram/pages/mine/index.wxml');
const givenWxml = read('miniprogram/pages/drift/given.wxml');
const claimWxml = read('miniprogram/pages/drift/claim.wxml');
const tipBarWxml = read('miniprogram/components/official-account-tip-bar/index.wxml');
const followBlockWxml = read('miniprogram/components/official-account-follow-block/index.wxml');

const forbidden = [
  '关注送积分',
  '关注领奖励',
  '关注解锁',
  '必须关注',
  'wx.showModal',
];

const oaSources = [
  checkResultWxml,
  batchResultWxml,
  receivedWxml,
  orderDetailWxml,
  mineWxml,
  tipBarWxml,
  followBlockWxml,
].join('\n');

forbidden.forEach((phrase) => {
  assert.ok(!oaSources.includes(phrase), `official account copy should avoid "${phrase}"`);
});

assert.ok(config.includes('officialAccountUsername'), 'config should expose officialAccountUsername');
assert.ok(promptUtil.includes('oa_milestone_shown'), 'prompt util should persist milestone shown flag');
assert.ok(!promptUtil.includes('oa_mine_card_dismissed_at'), 'mine OA card should stay permanent without dismiss storage');
assert.ok(promptUtil.includes('markSubscribeDialogTriggered'), 'prompt util should track subscribe dialog session');
assert.ok(promptUtil.includes('tryShowMilestonePrompt'), 'prompt util should expose milestone gate helper');
assert.ok(!promptUtil.includes('30 * 24 * 60 * 60 * 1000'), 'mine card should not use timed hide window');

assert.ok(checkResultWxml.includes('optional-notify-card'), 'check result should merge subscribe and OA into optional card');
assert.ok(checkResultWxml.includes('接漂时微信提醒我'), 'check result should keep subscribe action');
assert.ok(checkResultWxml.includes('拒绝不影响漂流与发货'), 'check result should keep subscribe optional copy');
assert.ok(checkResultWxml.includes('关注公众号 · 玩法指南与故事'), 'check result should include OA milestone copy');
assert.ok(checkResultJs.includes('markSubscribeDialogTriggered'), 'check result subscribe should mark session to skip OA');
assert.ok(checkResultJs.includes('tryShowMilestonePrompt'), 'check result should use milestone gate');

assert.ok(batchResultJs.includes("tryShowMilestonePrompt('batch'"), 'batch result should gate OA milestone');
assert.ok(batchResultWxml.includes('official-account-tip-bar'), 'batch result should render OA tip bar');

assert.ok(claimJs.includes('milestone=claim'), 'claim success should route received with milestone query');
assert.ok(receivedJs.includes("tryShowMilestonePrompt('claim'"), 'received should gate OA milestone');
assert.ok(receivedWxml.includes('official-account-tip-bar'), 'received should render OA tip bar');

assert.ok(shipJs.includes('milestone=ship'), 'ship success should route order detail with milestone query');
assert.ok(orderDetailJs.includes("tryShowMilestonePrompt('ship'"), 'order detail should gate OA milestone');
assert.ok(orderDetailWxml.includes('official-account-tip-bar'), 'order detail should render OA tip bar');

assert.ok(mineWxml.includes('oa-mine-card'), 'mine page should render OA card between menu and invite');
assert.ok(mineWxml.includes('书漂漂公众号'), 'mine OA card should keep compact title');
assert.ok(mineJs.includes('openOaProfile'), 'mine OA card should open profile on row tap');
assert.ok(!mineWxml.includes('official-account-follow-block'), 'mine OA card should use compact row without follow block');
assert.ok(!mineWxml.includes('oa-mine-close'), 'mine OA card should not expose dismiss control');
assert.ok(!mineJs.includes('dismissOaMineCard'), 'mine page should keep OA card permanent');
assert.ok(mineWxml.indexOf('oa-mine-card') < mineWxml.indexOf('invite-block'), 'OA card should sit above invite block');

assert.ok(!givenWxml.includes('official-account'), 'given list should not add OA prompt');
assert.ok(!claimWxml.includes('official-account'), 'claim page should not add OA prompt');

assert.ok(followBlockWxml.includes('<official-account'), 'follow block should use native official-account component');
assert.ok(followBlockWxml.includes('前往公众号主页'), 'follow block should always expose profile fallback link');

console.log('official account prompt contract ok');
