const { getJson } = require('./http');
const { normalizeIsbn } = require('../bookCatalog');

const GOOGLE_BOOKS_ENDPOINT = 'https://www.googleapis.com/books/v1/volumes';

function httpsImage(url) {
  if (!url) return '';
  return String(url).replace(/^http:\/\//, 'https://');
}

function pickIdentifiers(identifiers = []) {
  const result = { isbn: '', isbn10: '' };
  identifiers.forEach((item) => {
    const clean = normalizeIsbn(item.identifier);
    if (item.type === 'ISBN_13' && clean.length === 13) result.isbn = clean;
    if (item.type === 'ISBN_10' && clean.length === 10) result.isbn10 = clean;
  });
  if (!result.isbn && result.isbn10) result.isbn = result.isbn10;
  return result;
}

function normalizeGoogleVolume(volume) {
  const info = volume.volumeInfo || {};
  const ids = pickIdentifiers(info.industryIdentifiers || []);
  if (!ids.isbn || !info.title) return null;
  return {
    isbn: ids.isbn,
    isbn10: ids.isbn10,
    title: info.title || '',
    author: (info.authors || []).join('、') || '未知作者',
    publisher: info.publisher || '',
    pubDate: info.publishedDate || '',
    summary: info.description || '',
    category: (info.categories && info.categories[0]) || '童书',
    ageRange: '',
    coverRemote: httpsImage((info.imageLinks || {}).thumbnail || (info.imageLinks || {}).smallThumbnail || ''),
    coverSource: 'google_books',
    source: 'google_books',
    sourceId: volume.id || '',
    lookupStatus: 'found',
  };
}

async function lookupByIsbn(isbn) {
  const url = `${GOOGLE_BOOKS_ENDPOINT}?q=isbn:${encodeURIComponent(isbn)}&maxResults=1`;
  const data = await getJson(url, 1200);
  const item = (data.items || [])[0];
  return item ? normalizeGoogleVolume(item) : null;
}

async function searchByKeyword(keyword, limit = 10) {
  const url = `${GOOGLE_BOOKS_ENDPOINT}?q=${encodeURIComponent(keyword)}&printType=books&maxResults=${limit}`;
  const data = await getJson(url, 1200);
  return (data.items || []).map(normalizeGoogleVolume).filter(Boolean);
}

module.exports = {
  normalizeGoogleVolume,
  lookupByIsbn,
  searchByKeyword,
};
