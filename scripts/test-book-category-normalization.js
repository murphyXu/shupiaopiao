const assert = require('assert');

const {
  normalizeBookCategory,
  resolveShelfCategory,
  resolveShelfBookClass,
  extractSourceClc,
  isClcCode,
  clcShortName,
} = require('../cloudfunctions/api/lib/bookCategory');

assert.strictEqual(isClcCode('I242.4'), true);
assert.strictEqual(isClcCode('C913.1'), true);
assert.strictEqual(isClcCode('ts972.162'), true);
assert.strictEqual(isClcCode('TS972.162'), true);
assert.strictEqual(isClcCode('文学'), false);

assert.strictEqual(clcShortName('I242.4'), '文学');
assert.strictEqual(clcShortName('C913.1'), '社科');
assert.strictEqual(clcShortName('F272'), '经管');
assert.strictEqual(clcShortName('K825'), '历史');
assert.strictEqual(clcShortName('Z228'), '综合');

assert.strictEqual(normalizeBookCategory('I242.4', { title: '水浒传' }), '文学');
assert.strictEqual(normalizeBookCategory('C913.1', { title: '红楼梦' }), '文学');
assert.strictEqual(normalizeBookCategory('C913.1', { title: '社会学概论' }), '文学');
assert.strictEqual(normalizeBookCategory('I287.8', { title: '猜猜我有多爱你', summary: '经典亲子绘本。' }), '童书');
assert.strictEqual(normalizeBookCategory('I287.8', { title: '三国演义' }), '文学');
assert.strictEqual(normalizeBookCategory('I287.8', { title: '大黑狗' }), '童书');
assert.strictEqual(normalizeBookCategory('I287.5', { title: '月亮的味道' }), '童书');
assert.strictEqual(normalizeBookCategory('I242.4', { title: '平凡的世界' }), '文学');
assert.strictEqual(normalizeBookCategory('I287.45', { title: '屁屁侦探系列丛书 第1册' }), '童书');
assert.strictEqual(normalizeBookCategory('I287.45', { title: '屁屁侦探系列丛书 第5册' }), '童书');
assert.strictEqual(normalizeBookCategory('历史', { isbn: '9787540587850', title: '社科读物' }), '文学');
assert.strictEqual(normalizeBookCategory('历史', { isbn: '9787540487850', title: '郭论' }), '文学');
assert.strictEqual(normalizeBookCategory('小说', { title: '平凡的世界' }), '文学');
assert.strictEqual(normalizeBookCategory('经济管理', { title: '原则' }), '经管');
assert.strictEqual(normalizeBookCategory('ts972.162', { title: '石油工艺手册' }), '经管');
assert.strictEqual(normalizeBookCategory('ts972.162', { title: '战斗机，起飞！', summary: '儿童空军科普绘本' }), '童书');
assert.strictEqual(resolveShelfCategory({ category: 'ts972.162', title: '石油工艺手册' }).key, 'business');
assert.strictEqual(resolveShelfCategory({ category: 'I242.4', title: '水浒传' }).label, '文学');
assert.deepStrictEqual(
  ['child', 'literature', 'business', 'other'].map((key) => resolveShelfCategory({ category: key }).label),
  ['童书', '文学', '经管', '其他'],
);

assert.strictEqual(normalizeBookCategory('文学', { title: '萝卜回来了' }), '童书');
assert.strictEqual(normalizeBookCategory('文学', { title: '叶罗丽精灵梦' }), '童书');
assert.strictEqual(normalizeBookCategory('文学', { title: '好朋友' }), '童书');
assert.strictEqual(normalizeBookCategory('文学', { title: '好疼呀' }), '童书');
assert.strictEqual(normalizeBookCategory('文学', { title: '活着', summary: '当代文学小说' }), '文学');
assert.strictEqual(normalizeBookCategory('文学', { title: '围城', publisher: '人民文学出版社' }), '文学');
assert.strictEqual(normalizeBookCategory('文学', {
  title: '小熊宝宝绘本',
  publisher: '明天出版社',
}), '童书');
assert.strictEqual(normalizeBookCategory('文学', {
  title: '某绘本',
  sourceClc: 'I287.8',
}), '童书');
assert.strictEqual(extractSourceClc({ category: 'I287.8' }), 'I287.8');
assert.strictEqual(extractSourceClc({ category: '文学', sourceClc: 'I287.2' }), 'I287.2');
assert.strictEqual(resolveShelfBookClass({ category: '文学', title: '萝卜回来了', sourceClc: 'I287.1' }), 'child');
assert.strictEqual(normalizeBookCategory('科普', { title: '海底100层', publisher: '北京科学技术出版社' }), '童书');
assert.strictEqual(normalizeBookCategory('科普', { title: '海底10000层房子', publisher: '北京科学技术出版社' }), '童书');
assert.strictEqual(normalizeBookCategory('I712.8', { title: '海底100层', publisher: '北京科学技术出版社' }), '童书');
assert.strictEqual(resolveShelfCategory({ category: '科普', title: '原则' }).key, 'business');

console.log('book category normalization ok');
