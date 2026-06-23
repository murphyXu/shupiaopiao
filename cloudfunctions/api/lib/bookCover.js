const { formatBook } = require('./db');

function isCloudCover(cover = '') {
  return typeof cover === 'string' && cover.startsWith('cloud://');
}

function isRemoteCover(cover = '') {
  return typeof cover === 'string' && /^https?:\/\//.test(cover);
}

function normalizeHttps(url = '') {
  return String(url || '').replace(/^http:\/\//, 'https://');
}

function formatDisplayBook(book) {
  if (!book || !book._id) return {};
  const formatted = formatBook(book);
  if (isCloudCover(formatted.cover)) return formatted;
  if (isRemoteCover(formatted.coverRemote)) {
    return { ...formatted, cover: normalizeHttps(formatted.coverRemote) };
  }
  if (isRemoteCover(formatted.cover)) {
    return { ...formatted, cover: normalizeHttps(formatted.cover) };
  }
  return formatted;
}

module.exports = {
  isCloudCover,
  isRemoteCover,
  normalizeHttps,
  formatDisplayBook,
};
