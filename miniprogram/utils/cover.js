const DEFAULT_COVER = '/assets/covers/default.png';

const CATALOG_ISBNS = new Set([
  '9787533256739', '9787506282174', '9787533251413', '9787533251420',
  '9787533251437', '9787506282181', '9787533251444', '9787506282198',
  '9787111544937', '9787020002207', '9787532747735', '9787506282204',
  '9787544258560', '9787539172768', '9787533254368', '9787505615556',
  '9787535046123', '9787533258687', '9787544727099', '9787532748388',
]);

function isCloudCover(cover) {
  return typeof cover === 'string' && cover.startsWith('cloud://');
}

function isRemoteCover(cover) {
  return typeof cover === 'string' && /^https?:\/\//.test(cover);
}

function localCoverByIsbn(isbn) {
  const clean = String(isbn || '').replace(/[^0-9X]/gi, '');
  if (clean && CATALOG_ISBNS.has(clean)) {
    return `/assets/covers/${clean}.png`;
  }
  return '';
}

function displayCover(cover, isbn, coverRemote) {
  if (isCloudCover(cover)) return cover;
  if (isRemoteCover(coverRemote)) return coverRemote;
  if (isRemoteCover(cover)) return cover;
  if (typeof cover === 'string' && cover.startsWith('local:')) {
    const local = localCoverByIsbn(cover.slice(6));
    if (local) return local;
  }
  const local = localCoverByIsbn(isbn);
  if (local) return local;
  if (typeof cover === 'string' && cover.startsWith('/assets/')) return cover;
  return DEFAULT_COVER;
}

function normalizeBook(book) {
  if (!book || typeof book !== 'object') return book;
  return { ...book, cover: displayCover(book.cover, book.isbn, book.coverRemote) };
}

function normalizeBooksDeep(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeBooksDeep(item));
  }
  if (!value || typeof value !== 'object') return value;

  const next = { ...value };
  if (next.isbn && next.title && Object.prototype.hasOwnProperty.call(next, 'cover')) {
    next.cover = displayCover(next.cover, next.isbn, next.coverRemote);
  }
  if (next.book) next.book = normalizeBook(next.book);
  Object.keys(next).forEach((key) => {
    if (key === 'book') return;
    if (Array.isArray(next[key])) {
      next[key] = normalizeBooksDeep(next[key]);
    }
  });
  return next;
}

function onCoverError(e) {
  const {
    index, listKey, single, isbn,
  } = e.currentTarget.dataset;
  const fallback = localCoverByIsbn(isbn) || DEFAULT_COVER;
  if (single) {
    this.setData({ [`${single}.cover`]: fallback });
    return;
  }
  if (index === undefined || index === '') return;
  const key = listKey || 'list.books';
  this.setData({ [`${key}[${index}].cover`]: fallback });
}

module.exports = {
  DEFAULT_COVER,
  CATALOG_ISBNS,
  isCloudCover,
  isRemoteCover,
  localCoverByIsbn,
  displayCover,
  normalizeBook,
  normalizeBooksDeep,
  onCoverError,
};
