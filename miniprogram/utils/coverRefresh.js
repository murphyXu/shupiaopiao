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

function cacheRemoteCover(book) {
  if (!shouldCacheRemoteCover(book)) return Promise.resolve(null);
  const isbn = cleanIsbn(book.isbn);
  const url = remoteCoverUrl(book);
  if (remoteCoverTasks[isbn]) return remoteCoverTasks[isbn];

  remoteCoverTasks[isbn] = wx.cloud.callFunction({
    name: 'api',
    data: { action: 'books.cacheRemoteCover', data: { isbn, coverRemote: url } },
  })
    .then((res) => {
      const result = res.result || {};
      if (result.code !== 0) throw new Error(result.msg || 'CACHE_REMOTE_COVER_FAILED');
      return result.data && result.data.cover ? result.data.cover : null;
    })
    .catch((err) => {
      console.warn('[covers] remote cache skipped', isbn, err);
      return null;
    })
    .finally(() => {
      delete remoteCoverTasks[isbn];
    });
  return remoteCoverTasks[isbn];
}

function applyCoverUpdates(items, updates = {}, nestedKey = 'book') {
  const map = updates || {};
  if (!Object.keys(map).length) return items;
  return (items || []).map((item) => {
    const target = nestedKey ? item[nestedKey] : item;
    if (!target) return item;
    const isbn = cleanIsbn(target.isbn);
    const cover = map[isbn];
    if (!cover) return item;
    if (nestedKey) return { ...item, [nestedKey]: { ...target, cover } };
    return { ...target, cover };
  });
}

function cacheRemoteCovers(books, limit = 3) {
  const queue = (books || []).filter(shouldCacheRemoteCover).slice(0, limit);
  const updates = {};
  let chain = Promise.resolve(updates);
  queue.forEach((book) => {
    chain = chain.then((acc) => cacheRemoteCover(book).then((cover) => {
      if (cover) acc[cleanIsbn(book.isbn)] = cover;
      return acc;
    }));
  });
  return chain;
}

module.exports = {
  shouldCacheRemoteCover,
  remoteCoverUrl,
  cloudCoverPath,
  cacheRemoteCover,
  cacheRemoteCovers,
  applyCoverUpdates,
};
