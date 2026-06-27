const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

const commonWxss = read('miniprogram/styles/common.wxss');
const addressEditWxml = read('miniprogram/pages/mine/address-edit.wxml');
const addressEditWxss = read('miniprogram/pages/mine/address-edit.wxss');
const profileWxml = read('miniprogram/pages/auth/profile.wxml');
const profileWxss = read('miniprogram/pages/auth/profile.wxss');
const searchWxss = read('miniprogram/pages/shelf/search.wxss');
const detailWxss = read('miniprogram/pages/book/detail.wxss');

assert.ok(commonWxss.includes('.form-control') && /height:\s*88rpx/.test(commonWxss), 'shared form controls should define input height');
assert.ok(commonWxss.includes('.form-textarea') && /min-height:\s*160rpx/.test(commonWxss), 'shared form textarea should define min height');

assert.ok(addressEditWxml.includes('class="form-control"') && addressEditWxml.includes('class="form-textarea"'), 'address edit should use shared form controls');
assert.ok(!addressEditWxss.includes('input, textarea'), 'address edit page should not keep local bare input styles');

assert.ok(profileWxml.includes('class="form-control"') && profileWxml.includes('class="form-textarea"'), 'profile address fields should use shared form controls');
assert.ok(!profileWxss.includes('.input {') && !profileWxss.includes('.textarea {'), 'profile page should not keep undersized local input styles');

assert.ok(/height:\s*76rpx/.test(searchWxss), 'shelf search input should define height');
assert.ok(/height:\s*88rpx/.test(detailWxss), 'book detail custom location input should define height');

console.log('form control contract ok');
