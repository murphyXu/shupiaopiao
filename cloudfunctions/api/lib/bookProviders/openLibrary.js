const { getJson } = require('./http');
const { normalizeIsbn } = require('../bookCatalog');

const ISBN_TIMEOUT_MS = 5000;
const SEARCH_TIMEOUT_MS = 5000;
const SEARCH_FIELDS = [
  'key',
  'title',
  'author_name',
  'isbn',
  'cover_i',
  'publisher',
  'first_publish_year',
  'subject',
].join(',');

function firstName(list) {
  return Array.isArray(list) && list[0] ? (list[0].name || list[0]) : '';
}

function pickIsbns(isbns = []) {
  const result = { isbn: '', isbn10: '' };
  isbns.map(normalizeIsbn).forEach((clean) => {
    if (!result.isbn && clean.length === 13) result.isbn = clean;
    if (!result.isbn10 && clean.length === 10) result.isbn10 = clean;
  });
  if (!result.isbn && result.isbn10) result.isbn = result.isbn10;
  return result;
}

function coverById(coverId) {
  return coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : '';
}

function coverFromOpenLibraryRaw(raw = {}) {
  const sized = raw.cover && (raw.cover.medium || raw.cover.large || raw.cover.small);
  if (sized) return sized;
  const coverId = Array.isArray(raw.covers) && raw.covers[0];
  return coverId ? coverById(coverId) : '';
}

function normalizeOpenLibraryBook(bibKey, raw) {
  const isbn = normalizeIsbn(String(bibKey || '').replace(/^ISBN:/, ''));
  if (!isbn || !raw || !raw.title) return null;
  return {
    isbn,
    isbn10: isbn.length === 10 ? isbn : '',
    title: raw.title || '',
    author: (raw.authors || []).map((author) => author.name).filter(Boolean).join('、') || '未知作者',
    publisher: firstName(raw.publishers),
    pubDate: raw.publish_date || '',
    summary: raw.notes || '',
    category: firstName(raw.subjects) || '童书',
    ageRange: '',
    coverRemote: coverFromOpenLibraryRaw(raw),
    coverSource: 'open_library',
    source: 'open_library',
    sourceId: bibKey || '',
    lookupStatus: 'found',
  };
}

function normalizeOpenLibrarySearchDoc(doc) {
  const ids = pickIsbns(doc.isbn || []);
  if (!ids.isbn || !doc.title) return null;
  return {
    isbn: ids.isbn,
    isbn10: ids.isbn10,
    title: doc.title || '',
    author: (doc.author_name || []).join('、') || '未知作者',
    publisher: (doc.publisher || [])[0] || '',
    pubDate: doc.first_publish_year ? String(doc.first_publish_year) : '',
    summary: '',
    category: (doc.subject || [])[0] || '童书',
    ageRange: '',
    coverRemote: coverById(doc.cover_i),
    coverSource: 'open_library',
    source: 'open_library',
    sourceId: doc.key || '',
    lookupStatus: 'found',
  };
}

async function lookupByIsbn(isbn) {
  const bibKey = `ISBN:${isbn}`;
  const url = `https://openlibrary.org/api/books?bibkeys=${bibKey}&jscmd=data&format=json`;
  const data = await getJson(url, ISBN_TIMEOUT_MS);
  return normalizeOpenLibraryBook(bibKey, data[bibKey]);
}

async function searchByKeyword(keyword, limit = 10) {
  const isbn = normalizeIsbn(keyword);
  if (isbn) {
    const book = await lookupByIsbn(isbn);
    return book ? [book] : [];
  }
  const query = encodeURIComponent(keyword);
  const fields = encodeURIComponent(SEARCH_FIELDS);
  const urls = [
    `https://openlibrary.org/search.json?title=${query}&limit=${limit}&fields=${fields}`,
    `https://openlibrary.org/search.json?q=${query}&limit=${limit}&fields=${fields}`,
  ];
  const lists = await Promise.all(urls.map(async (url) => {
    try {
      const data = await getJson(url, SEARCH_TIMEOUT_MS);
      return (data.docs || []).map(normalizeOpenLibrarySearchDoc).filter(Boolean);
    } catch (err) {
      console.warn('[openLibrary] search', err.message || err);
      return [];
    }
  }));
  return lists.flat().slice(0, limit);
}

module.exports = {
  normalizeOpenLibraryBook,
  normalizeOpenLibrarySearchDoc,
  lookupByIsbn,
  searchByKeyword,
};
