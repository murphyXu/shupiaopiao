const { cacheRemoteBookCover } = require('./coverCache');

function isCloudCover(cover = '') {
  return typeof cover === 'string' && cover.startsWith('cloud://');
}

function hasRemoteCoverSource(book = {}) {
  if (book.coverRemote && /^https?:\/\//.test(book.coverRemote)) return true;
  if (book.cover && /^https?:\/\//.test(book.cover)) return true;
  return false;
}

async function cacheBooksForList(db, booksMap = {}, limit = 12) {
  const next = { ...booksMap };
  const targets = Object.values(booksMap)
    .filter((book) => book && book.isbn && !isCloudCover(book.cover) && hasRemoteCoverSource(book))
    .slice(0, limit);
  for (const book of targets) {
    try {
      const result = await cacheRemoteBookCover(db, {
        isbn: book.isbn,
        coverRemote: book.coverRemote || book.cover,
      });
      if (result && isCloudCover(result.cover)) {
        next[book._id] = { ...book, cover: result.cover, coverRemote: book.coverRemote || book.cover };
      }
    } catch (err) {
      console.warn('[listCoverCache]', book.isbn, err.message || err);
    }
  }
  return next;
}

module.exports = {
  cacheBooksForList,
};
