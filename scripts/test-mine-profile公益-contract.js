const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

const root = path.join(__dirname, '..');
const visibleSourceFiles = [
  ...walk(path.join(root, 'miniprogram')),
  ...walk(path.join(root, 'cloudfunctions/api')),
].filter((file) => /\.(js|wxml|wxss|json)$/.test(file));

for (const file of visibleSourceFiles) {
  const content = fs.readFileSync(file, 'utf8');
  assert.ok(!content.includes('书漂币'), `${path.relative(root, file)} should use 公益积分 instead of 书漂币`);
  assert.ok(!content.includes('币'), `${path.relative(root, file)} should not expose legacy 币 unit`);
  assert.ok(!content.includes('信用分'), `${path.relative(root, file)} should use 信用积分 instead of 信用分`);
}

const mineWxml = read('miniprogram/pages/mine/index.wxml');
const mineJs = read('miniprogram/pages/mine/index.js');
const mineWxss = read('miniprogram/pages/mine/index.wxss');
const walletWxml = read('miniprogram/pages/mine/wallet.wxml');
const walletJs = read('miniprogram/pages/mine/wallet.js');
const walletWxss = read('miniprogram/pages/mine/wallet.wxss');
const walletJson = JSON.parse(read('miniprogram/pages/mine/wallet.json'));
const profileWxml = read('miniprogram/pages/auth/profile.wxml');
const profileJs = read('miniprogram/pages/auth/profile.js');
const profileWxss = read('miniprogram/pages/auth/profile.wxss');
const dbLib = read('cloudfunctions/api/lib/db.js');
const walletJsonText = read('miniprogram/pages/mine/wallet.json');
const creditJson = read('miniprogram/pages/mine/credit.json');

assert.ok(mineWxml.includes('name-line') && mineWxml.includes('edit-profile') && mineWxml.indexOf('edit-profile') < mineWxml.indexOf('公益积分'), 'profile edit entry should move next to nickname');
assert.ok(mineWxml.includes("bindtap=\"{{loggedIn ? 'goProfile' : 'goLogin'}}\""), 'mine avatar and nickname row should open profile when logged in');
assert.ok(mineJs.includes('goProfile'), 'mine page should route to profile editor');
assert.ok(!mineWxml.includes('class="menu-item" bindtap="goProfile"') && !mineWxml.includes('>收货地址<'), 'profile and address should not remain as menu entries');
assert.ok(!mineJs.includes('goAddress()'), 'mine page should not expose a separate address entry');

assert.ok(mineWxml.includes('mine-stat-row') && mineWxml.includes('公益积分') && mineWxml.includes('信用积分'), 'mine top should show public points and credit points stats');
assert.ok(mineWxml.includes('user.availableCoin') && !mineWxml.includes('user.coinBalance'), 'mine public-points stats should show available points instead of total record value');
assert.ok(mineJs.includes('normalizeMineUser') && mineJs.includes('availableCoin'), 'mine page should normalize available public points for old cached users');
assert.ok(!mineWxml.includes('invite-stat-card') && !mineWxml.includes('邀请规则'), 'top duplicate invitation rule card should be removed');
assert.ok(mineWxml.includes('invite-block') && mineWxml.includes('邀请书友共建') && mineWxml.includes('open-type="share"'), 'mine page should keep one neutral invitation block');
assert.ok(mineWxml.includes('invite-reward') && mineWxml.includes('inviteRewardRule') && mineJs.includes('inviteRewardSummary'), 'mine invite block should show invite reward rule copy');
assert.ok(mineWxss.includes('.mine-stat-row') && !mineWxss.includes('.invite-stat-card'), 'mine top stat row should only style point cards');

assert.ok(profileWxml.includes('收货地址') && profileWxml.includes('address-card') && profileWxml.includes('bindtap="chooseWxAddress"'), 'profile page should include address editing');
assert.ok(profileWxml.includes('user-id-card') && profileWxml.includes('copyUserId') && profileWxml.includes('{{userId}}'), 'profile page should show user id with copy action');
assert.ok(profileJs.includes('copyUserId') && profileJs.includes('wx.setClipboardData'), 'profile page should copy user id to clipboard');
assert.ok(profileWxml.includes('addressName') && profileWxml.includes('addressPhone') && profileWxml.includes('addressRegion') && profileWxml.includes('addressDetail'), 'profile address fields should be bound in profile form');
assert.ok(profileJs.includes('api.getAddresses') && profileJs.includes('api.addAddress') && profileJs.includes('api.updateAddress'), 'profile save should load and persist address');
assert.ok(
  profileJs.includes('uploadAvatar') && profileJs.includes("!avatar.startsWith('cloud://')"),
  'profile save should upload local avatar to cloud storage before updateProfile',
);
assert.ok(profileJs.includes('wx.chooseAddress') && profileJs.includes('provinceName'), 'profile page should support reading WeChat address');
assert.ok(profileWxss.includes('.address-card'), 'profile address section should have layout styles');

assert.ok(dbLib.includes("db.collection('coin_transactions')") && dbLib.includes('coinBalance: _.inc(creditedAmount)'), 'invite reward should add public points after pending penalties');
assert.ok(/type:\s*'invite_reward'/.test(dbLib), 'invite reward should be recorded as a public-points transaction');
assert.ok(walletJsonText.includes('公益积分明细') && creditJson.includes('信用积分'), 'wallet and credit page titles should use unified terms');
assert.ok(walletWxml.includes('hero-muted') && walletWxss.includes('.hero-muted') && walletWxss.includes('color: #fff'), 'wallet occupied and total values should be readable on the green hero background');
assert.ok(walletWxml.includes('item.balanceAfter') && !walletWxml.includes('余额 {{item.balanceDelta'), 'wallet transaction rows should show calculated balance after each transaction');
assert.ok(walletJs.includes('withBalanceAfter') && walletJs.includes('balanceAfter'), 'wallet page should derive transaction balance from current total and deltas');
assert.ok(walletWxml.includes('wallet-earn-action') && walletWxml.includes('bindtap="showEarnPointGuide"') && walletWxml.includes('获得积分'), 'wallet hero should expose an earn-points entry');
assert.ok(walletJs.includes('publishEarnGuideModal') && walletJs.includes('showEarnPointGuide()') && walletJs.includes("itemList: ['上漂一本书', '邀请书友']"), 'wallet earn-points entry should reuse the pool earn-points guide logic');
assert.ok(walletJs.includes('showPublishEntryOptions') && walletJs.includes("url: '/pages/mine/index'"), 'wallet earn-points action should route like the pool entry');
assert.ok(!walletJs.includes('wx.showModal') && walletJs.includes('showEarnGuideModal: true') && walletJs.includes('confirmEarnPointGuide()'), 'wallet earn-points guide should use the structured shared modal instead of wx.showModal text');
assert.ok(walletJson.usingComponents && walletJson.usingComponents['earn-point-guide-modal'], 'wallet page should register the shared earn guide modal component');
assert.ok(walletWxml.includes('earn-point-guide-modal') && walletWxml.includes('showEarnGuideModal') && walletWxml.includes('bind:confirm="confirmEarnPointGuide"'), 'wallet page should render the shared earn guide modal component');

console.log('mine profile public-points contract ok');
