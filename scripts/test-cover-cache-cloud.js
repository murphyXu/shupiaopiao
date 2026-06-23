const assert = require('assert');
const {
  normalizeRemoteCoverUrl,
  isAllowedCoverUrl,
  cloudCoverPath,
  isSupportedContentType,
  cacheRemoteBookCover,
} = require('../cloudfunctions/api/lib/coverCache');

function createDb(rows) {
  return {
    collection(name) {
      assert.strictEqual(name, 'books');
      let query = {};
      return {
        where(nextQuery) {
          query = nextQuery || {};
          return this;
        },
        limit() {
          return this;
        },
        async get() {
          return { data: rows.filter((row) => row.isbn === query.isbn).map((row) => ({ ...row })) };
        },
        doc(id) {
          return {
            async update({ data }) {
              const row = rows.find((item) => item._id === id);
              Object.assign(row, data);
            },
          };
        },
      };
    },
  };
}

(async () => {
  assert.strictEqual(
    normalizeRemoteCoverUrl('http://static.tanshuapi.com/a.jpg'),
    'https://static.tanshuapi.com/a.jpg',
  );
  assert.strictEqual(isAllowedCoverUrl('https://static.tanshuapi.com/a.jpg'), true);
  assert.strictEqual(isAllowedCoverUrl('https://example.com/a.jpg'), false);
  assert.strictEqual(cloudCoverPath('9787559855022', 'https://static.tanshuapi.com/a.png'), 'book-covers/9787559855022.png');
  assert.strictEqual(isSupportedContentType('image/jpeg; charset=binary'), true);
  assert.strictEqual(isSupportedContentType('text/html'), false);

  const rows = [{
    _id: 'book-1',
    isbn: '9787559855022',
    cover: '',
    coverRemote: 'https://static.tanshuapi.com/book-cover.jpg',
  }];
  let downloadedUrl = '';
  let uploadedOptions = null;
  const result = await cacheRemoteBookCover(createDb(rows), {
    isbn: '9787559855022',
    coverRemote: 'https://example.com/ignored.jpg',
  }, {
    downloadRemoteCover: async (url) => {
      downloadedUrl = url;
      return { buffer: Buffer.from('cover-bytes') };
    },
    cloud: {
      uploadFile: async (options) => {
        uploadedOptions = options;
        return { fileID: 'cloud://env/book-covers/9787559855022.jpg' };
      },
    },
  });
  assert.strictEqual(downloadedUrl, 'https://static.tanshuapi.com/book-cover.jpg');
  assert.strictEqual(uploadedOptions.cloudPath, 'book-covers/9787559855022.jpg');
  assert.strictEqual(uploadedOptions.fileContent.toString(), 'cover-bytes');
  assert.deepStrictEqual(result, {
    isbn: '9787559855022',
    cover: 'cloud://env/book-covers/9787559855022.jpg',
    cached: true,
  });
  assert.strictEqual(rows[0].cover, 'cloud://env/book-covers/9787559855022.jpg');

  const existingCloudRows = [{
    _id: 'book-2',
    isbn: '9787559855023',
    cover: 'cloud://env/book-covers/9787559855023.jpg',
    coverRemote: 'https://static.tanshuapi.com/old.jpg',
  }];
  const existing = await cacheRemoteBookCover(createDb(existingCloudRows), {
    isbn: '9787559855023',
  }, {
    downloadRemoteCover: async () => {
      throw new Error('existing cloud cover should not download');
    },
    cloud: {
      uploadFile: async () => {
        throw new Error('existing cloud cover should not upload');
      },
    },
  });
  assert.deepStrictEqual(existing, {
    isbn: '9787559855023',
    cover: 'cloud://env/book-covers/9787559855023.jpg',
    cached: false,
  });

  await assert.rejects(() => cacheRemoteBookCover(createDb([{
    _id: 'book-3',
    isbn: '9787559855024',
    cover: '',
    coverRemote: 'https://example.com/bad.jpg',
  }]), { isbn: '9787559855024' }, {
    downloadRemoteCover: async () => ({ buffer: Buffer.from('bad') }),
    cloud: { uploadFile: async () => ({ fileID: 'cloud://env/bad.jpg' }) },
  }), /COVER_URL_NOT_ALLOWED/);

  console.log('cloud cover cache contract ok');
})();
