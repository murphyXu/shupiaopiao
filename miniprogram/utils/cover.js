const DEFAULT_COVER = '/assets/covers/default.png';

function isCloudCover(cover) {
  return typeof cover === 'string' && cover.startsWith('cloud://');
}

function isRemoteCover(cover) {
  return typeof cover === 'string' && /^https?:\/\//.test(cover);
}

function httpsUrl(url) {
  return String(url || '').replace(/^http:\/\//, 'https://');
}

function displayCover(cover, isbn, coverRemote) {
  if (isCloudCover(cover)) return cover;
  const remote = httpsUrl(coverRemote || '');
  if (isRemoteCover(remote)) return remote;
  if (isRemoteCover(cover)) return httpsUrl(cover);
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
    const child = next[key];
    if (child && typeof child === 'object') {
      next[key] = normalizeBooksDeep(child);
    }
  });
  return next;
}

function readNestedValue(root, path) {
  if (!path) return root;
  return String(path).split('.').reduce((value, part) => (value ? value[part] : null), root);
}

function readBookFromContext(ctx, { single, listKey, index, nestedKey }) {
  if (single) {
    return readNestedValue(ctx.data, single) || null;
  }
  if (index === undefined || index === '') return null;
  const list = readNestedValue(ctx.data, listKey || 'list') || [];
  const item = list[index];
  if (!item) return null;
  return nestedKey ? item[nestedKey] : item;
}

function applyCoverField(ctx, { single, listKey, index, nestedKey }, cover) {
  if (single) {
    ctx.setData({ [`${single}.cover`]: cover });
    return;
  }
  if (index === undefined || index === '') return;
  const key = listKey || 'list';
  const field = nestedKey ? `${key}[${index}].${nestedKey}.cover` : `${key}[${index}].cover`;
  ctx.setData({ [field]: cover });
}

function onCoverError(e) {
  const { cacheRemoteCover, shouldCacheRemoteCover, remoteCoverUrl } = require('./coverRefresh');
  const {
    index, listKey, single, isbn, nestedKey,
  } = e.currentTarget.dataset;
  const ctx = this;
  const book = readBookFromContext(ctx, {
    single, listKey, index, nestedKey,
  }) || { isbn, coverRemote: '' };
  const remote = remoteCoverUrl(book);

  const applyResolvedCover = (cover) => {
    if (cover) applyCoverField(ctx, { single, listKey, index, nestedKey }, cover);
    else if (remote) applyCoverField(ctx, { single, listKey, index, nestedKey }, remote);
    else applyCoverField(ctx, { single, listKey, index, nestedKey }, DEFAULT_COVER);
  };

  if (shouldCacheRemoteCover(book)) {
    cacheRemoteCover(book).then(applyResolvedCover);
    return;
  }
  applyResolvedCover('');
}

module.exports = {
  DEFAULT_COVER,
  isCloudCover,
  isRemoteCover,
  displayCover,
  normalizeBook,
  normalizeBooksDeep,
  onCoverError,
};
