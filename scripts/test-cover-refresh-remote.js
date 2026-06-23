const assert = require('assert');

global.getApp = () => ({ globalData: {} });

let downloadCalls = [];
let uploadCalls = [];
let callFunctionCalls = [];

global.wx = {
  downloadFile(options) {
    downloadCalls.push(options);
    options.fail(new Error('client download should not be used for remote covers'));
  },
  cloud: {
    uploadFile(options) {
      uploadCalls.push(options);
      return Promise.resolve({ fileID: 'cloud://env/book-covers/9787559855022.jpg' });
    },
    callFunction(options) {
      callFunctionCalls.push(options);
      if (options.data.data.coverRemote && options.data.data.coverRemote.includes('fail')) {
        return Promise.resolve({ result: { code: 500, msg: 'download fail' } });
      }
      return Promise.resolve({
        result: { code: 0, data: { cover: 'cloud://env/book-covers/9787559855022.jpg' } },
      });
    },
  },
};

const {
  shouldCacheRemoteCover,
  remoteCoverUrl,
  cloudCoverPath,
  cacheRemoteCover,
  cacheRemoteCovers,
} = require('../miniprogram/utils/coverRefresh');

(async () => {
  assert.strictEqual(shouldCacheRemoteCover(null), false);
  assert.strictEqual(shouldCacheRemoteCover({ isbn: '9787559855022', cover: 'cloud://abc' }), false);
  assert.strictEqual(shouldCacheRemoteCover({ isbn: '9787559855022', cover: '/assets/covers/default.png' }), false);
  assert.strictEqual(shouldCacheRemoteCover({ isbn: '9787559855022', coverRemote: 'https://static.tanshuapi.com/a.jpg' }), true);
  assert.strictEqual(shouldCacheRemoteCover({ isbn: '9787559855022', cover: 'https://static.tanshuapi.com/a.jpg' }), true);

  assert.strictEqual(
    remoteCoverUrl({ cover: 'http://static.tanshuapi.com/a.jpg' }),
    'https://static.tanshuapi.com/a.jpg',
  );
  assert.strictEqual(cloudCoverPath('9787559855022', 'https://static.tanshuapi.com/a.png'), 'book-covers/9787559855022.png');
  assert.strictEqual(cloudCoverPath('9787559855022', 'https://static.tanshuapi.com/a.webp'), 'book-covers/9787559855022.jpg');

  const fileID = await cacheRemoteCover({
    isbn: '9787559855022',
    coverRemote: 'http://static.tanshuapi.com/a.jpg',
  });
  assert.strictEqual(fileID, 'cloud://env/book-covers/9787559855022.jpg');
  assert.strictEqual(downloadCalls.length, 0);
  assert.strictEqual(uploadCalls.length, 0);
  assert.deepStrictEqual(callFunctionCalls[0].data, {
    action: 'books.cacheRemoteCover',
    data: { isbn: '9787559855022', coverRemote: 'https://static.tanshuapi.com/a.jpg' },
  });

  const originalWarn = console.warn;
  console.warn = () => {};
  let skipped;
  try {
    skipped = await cacheRemoteCover({
      isbn: '9787559855022',
      coverRemote: 'https://static.tanshuapi.com/fail.jpg',
    });
  } finally {
    console.warn = originalWarn;
  }
  assert.strictEqual(skipped, null);

  downloadCalls = [];
  uploadCalls = [];
  callFunctionCalls = [];
  await cacheRemoteCovers([
    { isbn: '9787559855022', coverRemote: 'https://static.tanshuapi.com/a.jpg' },
    { isbn: '9787559855023', coverRemote: 'https://static.tanshuapi.com/b.jpg' },
    { isbn: '9787559855024', coverRemote: 'https://static.tanshuapi.com/c.jpg' },
  ], 2);
  assert.strictEqual(downloadCalls.length, 0);
  assert.strictEqual(uploadCalls.length, 0);
  assert.strictEqual(callFunctionCalls.length, 2);

  const { applyCoverUpdates } = require('../miniprogram/utils/coverRefresh');
  const patched = applyCoverUpdates([
    { id: 'drift-1', book: { isbn: '9787559855022', cover: 'https://static.tanshuapi.com/a.jpg' } },
  ], { 9787559855022: 'cloud://env/book-covers/9787559855022.jpg' }, 'book');
  assert.strictEqual(patched[0].book.cover, 'cloud://env/book-covers/9787559855022.jpg');

  console.log('remote cover cache ok');
})();
