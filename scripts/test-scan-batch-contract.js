const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const scanJs = read('miniprogram/pages/shelf/scan.js');
const scanWxml = read('miniprogram/pages/shelf/scan.wxml');

assert.ok(!scanWxml.includes('参考二手价'), 'scan result should not show second-hand reference price');
assert.ok(!scanWxml.includes('estimate.medianPrice'), 'scan result should not bind second-hand estimate');
assert.ok(!scanJs.includes('estimatePrice'), 'scan flow should not request pricing estimate while adding shelf books');
assert.ok(!/estimate:\s*\{/.test(scanJs), 'scan page should not keep estimate state');

assert.ok(scanJs.includes('batchAutoAdd'), 'continuous scan should have an auto-add batch mode');
assert.ok(scanJs.includes('addScannedBook'), 'scan page should share add logic between manual and batch add');
assert.ok(scanJs.includes('if (this.data.continuousScan && this.data.batchAutoAdd)'), 'lookup should auto-add books during active continuous scan');
assert.ok(scanWxml.includes('批量连续扫码') && scanWxml.includes('自动加入书架后继续扫下一本'), 'continuous scan copy should explain batch auto-add behavior');
assert.ok(scanWxml.includes("{{continuousScan ? '加入并开始批量扫码' : '加入书架'}}"), 'first add button should explain batch start when continuous scan is on');

console.log('scan batch contract ok');
