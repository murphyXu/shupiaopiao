const { CATALOG_ISBNS, localCoverByIsbn } = require('./cover');

const remoteCoverTasks = {};

function isCloudCover(cover) {
  return typeof cover === 'string' && cover.startsWith('cloud://');
}

function isRemoteCover(cover) {
  return typeof cover === 'string' && /^https?:\/\//.test(cover);
}

function cleanIsbn(isbn) {
  return String(isbn || '').replace(/[^0-9X]/gi, '');
}

function httpsUrl(url) {
  return String(url || '').replace(/^http:\/\//, 'https://');
}

function remoteCoverUrl(book) {
  if (!book) return '';
  return httpsUrl(book.coverRemote || (isRemoteCover(book.cover) ? book.cover : ''));
}

function shouldCacheRemoteCover(book) {
  if (!book || !cleanIsbn(book.isbn)) return false;
  if (isCloudCover(book.cover)) return false;
  return isRemoteCover(remoteCoverUrl(book));
}

function cloudCoverPath(isbn, url) {
  const clean = cleanIsbn(isbn);
  const extMatch = String(url || '').split('?')[0].match(/\.(png|jpe?g)$/i);
  const ext = extMatch ? extMatch[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg';
  return `book-covers/${clean}.${ext}`;
}

function downloadRemoteCover(url) {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      success(res) {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`DOWNLOAD_${res.statusCode}`));
          return;
        }
        resolve(res.tempFilePath);
      },
      fail: reject,
    });
  });
}

function cacheRemoteCover(book) {
  if (!shouldCacheRemoteCover(book)) return Promise.resolve(null);
  const isbn = cleanIsbn(book.isbn);
  const url = remoteCoverUrl(book);
  if (remoteCoverTasks[isbn]) return remoteCoverTasks[isbn];

  remoteCoverTasks[isbn] = downloadRemoteCover(url)
    .then((filePath) => wx.cloud.uploadFile({
      cloudPath: cloudCoverPath(isbn, url),
      filePath,
    }))
    .then((res) => wx.cloud.callFunction({
      name: 'api',
      data: { action: 'books.updateCover', data: { isbn, cover: res.fileID } },
    }).then(() => res.fileID))
    .catch((err) => {
      console.warn('[covers] remote cache skipped', isbn, err);
      return null;
    })
    .finally(() => {
      delete remoteCoverTasks[isbn];
    });
  return remoteCoverTasks[isbn];
}

function cacheRemoteCovers(books, limit = 3) {
  const queue = (books || []).filter(shouldCacheRemoteCover).slice(0, limit);
  let chain = Promise.resolve();
  queue.forEach((book) => {
    chain = chain.then(() => cacheRemoteCover(book));
  });
  return chain;
}

function uploadOneCover(isbn) {
  const filePath = localCoverByIsbn(isbn) || '/assets/covers/default.png';
  return wx.cloud.uploadFile({
    cloudPath: `book-covers/${isbn}.jpg`,
    filePath,
  }).then((res) => wx.cloud.callFunction({
    name: 'api',
    data: { action: 'books.updateCover', data: { isbn, cover: res.fileID } },
  })).then(() => isbn).catch((err) => {
    console.warn('[covers] upload skipped', isbn, err);
    return null;
  });
}

function syncSeedCoversToCloud() {
  const isbns = [...CATALOG_ISBNS];
  let chain = Promise.resolve();
  isbns.forEach((isbn) => {
    chain = chain.then(() => uploadOneCover(isbn));
  });
  return chain.then(() => {
    const app = getApp();
    if (app) app.globalData.coversUpdated = true;
  });
}

let syncPromise = null;

function startCoverSyncIfNeeded() {
  if (syncPromise) return syncPromise;
  syncPromise = syncSeedCoversToCloud()
    .catch((err) => console.warn('[covers] background sync failed', err))
    .finally(() => { syncPromise = null; });
  return syncPromise;
}

module.exports = {
  shouldCacheRemoteCover,
  remoteCoverUrl,
  cloudCoverPath,
  cacheRemoteCover,
  cacheRemoteCovers,
  uploadOneCover,
  syncSeedCoversToCloud,
  startCoverSyncIfNeeded,
};
