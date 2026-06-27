const assert = require('assert');

const httpPath = require.resolve('../cloudfunctions/api/lib/bookProviders/http');
const tanshuPath = require.resolve('../cloudfunctions/api/lib/bookProviders/tanshu');

function loadProvider(mockGetJson) {
  delete require.cache[httpPath];
  require.cache[httpPath] = {
    id: httpPath,
    filename: httpPath,
    loaded: true,
    exports: { getJson: mockGetJson },
  };
  delete require.cache[tanshuPath];
  return require('../cloudfunctions/api/lib/bookProviders/tanshu');
}

(async () => {
  const originalKey = process.env.TANSHU_API_KEY;
  delete process.env.TANSHU_API_KEY;

  const missingKeyProvider = loadProvider(async () => {
    throw new Error('should not call tanshu without key');
  });
  const missingKeyResult = await missingKeyProvider.lookupByIsbn('9787533256739');
  assert.strictEqual(missingKeyResult, null);

  process.env.TANSHU_API_KEY = 'test-key';
  let calledUrl = '';
  const provider = loadProvider(async (url, timeoutMs) => {
    calledUrl = url;
    assert.strictEqual(timeoutMs, 2500);
    assert.ok(url.startsWith('https://api2.tanshuapi.com/api/isbn/v2/index?'));
    assert.ok(url.includes('key=test-key'));
    assert.ok(url.includes('isbn=9787533256739'));
    return {
      code: 1,
      msg: '操作成功',
      data: {
        title: '猜猜我有多爱你',
        img: 'http://static.tanshuapi.com/book-cover.jpg',
        author: '山姆·麦克布雷尼',
        isbn: '9787533256739',
        publisher: '明天出版社',
        pubdate: '2013-07',
        price: '39.80',
        class: 'I287.8',
        summary: '经典亲子绘本。',
      },
    };
  });

  const book = await provider.lookupByIsbn('9787533256739');
  assert.strictEqual(book.isbn, '9787533256739');
  assert.strictEqual(book.title, '猜猜我有多爱你');
  assert.strictEqual(book.author, '山姆·麦克布雷尼');
  assert.strictEqual(book.publisher, '明天出版社');
  assert.strictEqual(book.pubDate, '2013-07');
  assert.strictEqual(book.listPrice, '39.80');
  assert.strictEqual(book.category, '童书');
  assert.strictEqual(book.sourceClc, 'I287.8');
  assert.strictEqual(book.summary, '经典亲子绘本。');
  assert.strictEqual(book.coverRemote, 'https://static.tanshuapi.com/book-cover.jpg');
  assert.strictEqual(book.coverSource, 'tanshu');
  assert.strictEqual(book.source, 'tanshu');
  assert.strictEqual(book.lookupStatus, 'found');
  assert.ok(calledUrl);

  const shortTimeoutProvider = loadProvider(async (url, timeoutMs) => {
    assert.ok(url.includes('isbn=9787533256739'));
    assert.strictEqual(timeoutMs, 700);
    return { code: 0, msg: 'timeout fallback', data: null };
  });
  const shortTimeoutResult = await shortTimeoutProvider.lookupByIsbn('9787533256739', 700);
  assert.strictEqual(shortTimeoutResult, null);

  const searchResults = await provider.searchByKeyword('猜猜我有多爱你');
  assert.deepStrictEqual(searchResults, []);

  const notFoundProvider = loadProvider(async () => ({ code: 0, msg: 'not found', data: null }));
  const notFound = await notFoundProvider.lookupByIsbn('9780000000002');
  assert.strictEqual(notFound, null);

  if (originalKey === undefined) delete process.env.TANSHU_API_KEY;
  else process.env.TANSHU_API_KEY = originalKey;

  console.log('tanshu provider ok');
})();
