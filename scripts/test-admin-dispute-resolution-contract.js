const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

const routes = read('cloudfunctions/api/index.js');
const drift = read('cloudfunctions/api/handlers/drift.js');
const api = read('miniprogram/utils/api.js');
const adminJs = read('miniprogram/pages/mine/disputes.js');
const adminWxml = read('miniprogram/pages/mine/disputes.wxml');

assert.ok(routes.includes("drift.listDisputes(openid, data)"), 'dispute list route should pass query data');
assert.ok(drift.includes('async function listDisputes(openid, data = {})') && drift.includes("data.status === 'RESOLVED'"), 'admin should be able to load resolved dispute history');
assert.ok(drift.includes('const remark = String(data.remark ||') && drift.includes('remark,'), 'resolveDispute should persist admin remark');
assert.ok(api.includes('getDisputes: (status') && api.includes('resolveDispute: (disputeId, action, compensate = false, remark =') && api.includes('remark'), 'frontend api should pass status and remark');
assert.ok(adminJs.includes('inputRemark') && adminJs.includes("api.getDisputes('RESOLVED')") && adminJs.includes('this.data.remark'), 'admin page should edit remark and load history');
assert.ok(adminWxml.includes('处理备注') && adminWxml.includes('处理历史') && adminWxml.includes('bindinput="inputRemark"'), 'admin page should show remark input and history');

console.log('admin dispute resolution contract ok');
