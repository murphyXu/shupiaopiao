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
const profileWxml = read('miniprogram/pages/auth/profile.wxml');
const profileJs = read('miniprogram/pages/auth/profile.js');
const profileWxss = read('miniprogram/pages/auth/profile.wxss');
const dbLib = read('cloudfunctions/api/lib/db.js');
const walletJson = read('miniprogram/pages/mine/wallet.json');
const creditJson = read('miniprogram/pages/mine/credit.json');

assert.ok(mineWxml.includes('name-line') && mineWxml.includes('edit-profile') && mineWxml.indexOf('edit-profile') < mineWxml.indexOf('公益积分'), 'profile edit entry should move next to nickname');
assert.ok(!mineWxml.includes('class="menu-item" bindtap="goProfile"') && !mineWxml.includes('>收货地址<'), 'profile and address should not remain as menu entries');
assert.ok(!mineJs.includes('goAddress()'), 'mine page should not expose a separate address entry');

assert.ok(mineWxml.includes('mine-stat-row') && mineWxml.includes('公益积分') && mineWxml.includes('信用积分'), 'mine top should show public points and credit points stats');
assert.ok(!mineWxml.includes('invite-stat-card') && !mineWxml.includes('邀请规则'), 'top duplicate invitation rule card should be removed');
assert.ok(mineWxml.includes('invite-block') && mineWxml.includes('邀请书友共建') && mineWxml.includes('open-type="share"'), 'mine page should keep one neutral invitation block');
assert.ok(mineWxss.includes('.mine-stat-row') && !mineWxss.includes('.invite-stat-card'), 'mine top stat row should only style point cards');

assert.ok(profileWxml.includes('收货地址') && profileWxml.includes('address-card') && profileWxml.includes('bindtap="chooseWxAddress"'), 'profile page should include address editing');
assert.ok(profileWxml.includes('addressName') && profileWxml.includes('addressPhone') && profileWxml.includes('addressRegion') && profileWxml.includes('addressDetail'), 'profile address fields should be bound in profile form');
assert.ok(profileJs.includes('api.getAddresses') && profileJs.includes('api.addAddress') && profileJs.includes('api.updateAddress'), 'profile save should load and persist address');
assert.ok(profileJs.includes('wx.chooseAddress') && profileJs.includes('provinceName'), 'profile page should support reading WeChat address');
assert.ok(profileWxss.includes('.address-card'), 'profile address section should have layout styles');

assert.ok(dbLib.includes("db.collection('coin_transactions')") && dbLib.includes('coinBalance: _.inc(creditedAmount)'), 'invite reward should add public points after pending penalties');
assert.ok(/type:\s*'invite_reward'/.test(dbLib), 'invite reward should be recorded as a public-points transaction');
assert.ok(walletJson.includes('公益积分明细') && creditJson.includes('信用积分'), 'wallet and credit page titles should use unified terms');

console.log('mine profile public-points contract ok');
