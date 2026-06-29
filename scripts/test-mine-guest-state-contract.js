const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

const mineWxml = read('miniprogram/pages/mine/index.wxml');
const loginWxml = read('miniprogram/pages/auth/login.wxml');
const loginJs = read('miniprogram/pages/auth/login.js');
const utilJs = read('miniprogram/utils/util.js');

assert.ok(!mineWxml.includes('guest-card'), 'mine page should not use login-only guest card layout');
assert.ok(mineWxml.includes('未登录') && mineWxml.includes('登录后查看'), 'mine page should show guest placeholders');
assert.ok(
  mineWxml.includes('wx:else class="avatar-placeholder"') && mineWxml.includes('/assets/brand/logo.png'),
  'mine page should use brand logo when guest or logged-in user has no avatar',
);
assert.ok(
  mineWxml.includes('wx:if="{{loggedIn && user.avatar}}"') && !mineWxml.includes('/assets/icons/mine.png'),
  'mine page should show user avatar only after login when avatar is set',
);
assert.ok(mineWxml.includes('menu-list') && mineWxml.includes('我送出的书') && mineWxml.includes('我接到的书'), 'mine page should keep drift menu visible for guests');
assert.ok(mineWxml.includes('隐私政策 / 设置'), 'mine page should keep settings accessible without login');

assert.ok(loginWxml.includes('暂不登录') && loginJs.includes('skipLogin'), 'login page should expose skip login action');
assert.ok(
  loginWxml.includes('custom-nav-bar') && loginWxml.includes('showBack') && loginJs.includes('navigateBack'),
  'login page should expose back navigation via custom nav bar',
);
assert.ok(utilJs.includes("cancelText: '先看看'"), 'requireLogin modal should allow cancel without forcing login');

console.log('mine guest state contract ok');
