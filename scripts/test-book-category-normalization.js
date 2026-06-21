const assert = require('assert');

const {
  normalizeBookCategory,
  isClcCode,
  clcShortName,
} = require('../cloudfunctions/api/lib/bookCategory');

assert.strictEqual(isClcCode('I242.4'), true);
assert.strictEqual(isClcCode('C913.1'), true);
assert.strictEqual(isClcCode('文学'), false);

assert.strictEqual(clcShortName('I242.4'), '文学');
assert.strictEqual(clcShortName('C913.1'), '社科');
assert.strictEqual(clcShortName('F272'), '经管');
assert.strictEqual(clcShortName('K825'), '历史');
assert.strictEqual(clcShortName('Z228'), '综合');

assert.strictEqual(normalizeBookCategory('I242.4', { title: '水浒传' }), '文学');
assert.strictEqual(normalizeBookCategory('C913.1', { title: '红楼梦' }), '文学');
assert.strictEqual(normalizeBookCategory('C913.1', { title: '社会学概论' }), '社科');
assert.strictEqual(normalizeBookCategory('I287.8', { title: '猜猜我有多爱你', summary: '经典亲子绘本。' }), '童书');
assert.strictEqual(normalizeBookCategory('I287.8', { title: '三国演义' }), '文学');
assert.strictEqual(normalizeBookCategory('I287.45', { title: '屁屁侦探系列丛书 第1册' }), '童书');
assert.strictEqual(normalizeBookCategory('I287.45', { title: '屁屁侦探系列丛书 第5册' }), '童书');
assert.strictEqual(normalizeBookCategory('历史', { isbn: '9787540587850', title: '社科读物' }), '社科');
assert.strictEqual(normalizeBookCategory('历史', { isbn: '9787540487850', title: '郭论' }), '社科');
assert.strictEqual(normalizeBookCategory('小说', { title: '平凡的世界' }), '文学');
assert.strictEqual(normalizeBookCategory('经济管理', { title: '原则' }), '经管');

console.log('book category normalization ok');
