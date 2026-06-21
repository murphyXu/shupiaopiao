const assert = require('assert');

const storage = {};
global.wx = {
  getStorageSync(key) {
    return storage[key];
  },
  setStorageSync(key, value) {
    storage[key] = value;
  },
};

const {
  recordSearchKeyword,
  recordBookView,
  recordBooklistView,
  getBooklistSignals,
} = require('../miniprogram/utils/booklistSignals');

recordSearchKeyword('三国演义');
recordSearchKeyword(' 情绪管理 ');
recordSearchKeyword('三国演义');
recordBookView({ id: 'b1', title: '我爸爸', author: '安东尼·布朗', category: '绘本', ageRange: '3-6' });
recordBookView({ id: 'b1', title: '我爸爸', author: '安东尼·布朗', category: '绘本', ageRange: '3-6' });
recordBooklistView({ id: 'gen-a', theme: '亲情陪伴', themeKey: 'family' });

const signals = getBooklistSignals();
assert.deepStrictEqual(signals.keywords.slice(0, 2), ['三国演义', '情绪管理']);
assert.strictEqual(signals.books.length, 1);
assert.strictEqual(signals.books[0].title, '我爸爸');
assert.deepStrictEqual(signals.listThemes, ['亲情陪伴', 'family']);

for (let i = 0; i < 20; i++) recordSearchKeyword(`词${i}`);
assert.strictEqual(getBooklistSignals().keywords.length, 10);

console.log('booklist signals ok');
