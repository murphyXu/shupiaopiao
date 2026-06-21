const assert = require('assert');

global.getApp = () => ({ globalData: {} });

let downloadCalls = [];
let uploadCalls = [];
let callFunctionCalls = [];

global.wx = {
  downloadFile(options) {
    downloadCalls.push(options);
    if (options.url.includes('fail')) {
      options.fail(new Error('download fail'));
      return;
    }
    options.success({ statusCode: 200, tempFilePath: '/tmp/cover.jpg' });
  },
  cloud: {
    uploadFile(options) {
      uploadCalls.push(options);
      return Promise.resolve({ fileID: 'cloud://env/book-covers/9787559855022.jpg' });
    },
    callFunction(options) {
      callFunctionCalls.push(options);
      return Promise.resolve({ result: { code: 0 } });
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
  assert.strictEqual(downloadCalls[0].url, 'https://static.tanshuapi.com/a.jpg');
  assert.strictEqual(uploadCalls[0].cloudPath, 'book-covers/9787559855022.jpg');
  assert.deepStrictEqual(callFunctionCalls[0].data, {
    action: 'books.updateCover',
    data: { isbn: '9787559855022', cover: 'cloud://env/book-covers/9787559855022.jpg' },
  });

  const skipped = await cacheRemoteCover({
    isbn: '9787559855022',
    coverRemote: 'https://static.tanshuapi.com/fail.jpg',
  });
  assert.strictEqual(skipped, null);

  downloadCalls = [];
  uploadCalls = [];
  callFunctionCalls = [];
  await cacheRemoteCovers([
    { isbn: '9787559855022', coverRemote: 'https://static.tanshuapi.com/a.jpg' },
    { isbn: '9787559855023', coverRemote: 'https://static.tanshuapi.com/b.jpg' },
    { isbn: '9787559855024', coverRemote: 'https://static.tanshuapi.com/c.jpg' },
  ], 2);
  assert.strictEqual(downloadCalls.length, 2);
  assert.strictEqual(uploadCalls.length, 2);
  assert.strictEqual(callFunctionCalls.length, 2);

  console.log('remote cover cache ok');
})();
