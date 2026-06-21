const { normalizeIsbn } = require('./bookCatalog');

function cleanBookTitle(title) {
  let value = String(title || '').trim();
  if (!value) return '';
  const raw = value;
  value = value.replace(/\s+/g, ' ');
  value = value.split(/[=＝]/)[0].trim();
  const colonIndex = value.search(/[:：]/);
  if (colonIndex > 1) {
    const main = value.slice(0, colonIndex).trim();
    const sub = value.slice(colonIndex + 1).trim();
    if (/[a-zA-Z]/.test(sub) || sub.length >= 10 || raw.includes('=')) value = main;
  }
  return value.replace(/[（(]\s*[上中下全]\s*[)）]$/, '').trim();
}

function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[\s·・,，.。:：;；'"“”‘’《》<>【】\[\]()（）\-_=＝/\\|]+/g, '');
}

function keywordTokens(keyword) {
  return String(keyword || '')
    .trim()
    .split(/[\s,，;；]+/)
    .map(normalizeSearchText)
    .filter(Boolean);
}

function bookMatchesKeyword(book, keyword) {
  const cleanKeyword = normalizeSearchText(keyword);
  if (!cleanKeyword) return false;
  const tokens = keywordTokens(keyword);
  const fields = [
    book.title,
    book.rawTitle,
    book.author,
    book.publisher,
    book.pubDate,
    book.isbn,
    book.isbn10,
  ].map(normalizeSearchText).filter(Boolean);
  const haystack = fields.join('');
  if (haystack.includes(cleanKeyword)) return true;
  if (tokens.length > 1 && tokens.every((token) => haystack.includes(token))) return true;
  return fields.some((field) => field.includes(cleanKeyword) || cleanKeyword.includes(field));
}

function versionLabel(book = {}) {
  return [
    book.publisher,
    book.pubDate,
    book.isbn ? `ISBN ${book.isbn}` : '',
  ].filter(Boolean).join(' · ');
}

function bookKey(book) {
  const isbn = normalizeIsbn(book.isbn);
  if (isbn) return `isbn:${isbn}`;
  return `text:${String(book.title || '').trim().toLowerCase()}|${String(book.author || '').trim().toLowerCase()}`;
}

function dedupeBooks(books) {
  const map = new Map();
  const textKeysByIsbn = new Map();
  books.filter(Boolean).forEach((book) => {
    const key = bookKey(book);
    if (!key || key === 'text:|') return;
    if (key.startsWith('isbn:')) {
      const textKey = bookKey({ ...book, isbn: '' });
      const existingKey = textKeysByIsbn.get(textKey);
      if (existingKey && existingKey !== key) {
        map.delete(existingKey);
      }
      textKeysByIsbn.set(textKey, key);
    } else if (textKeysByIsbn.has(key)) {
      return;
    }
    if (!map.has(key)) map.set(key, book);
  });
  return [...map.values()];
}

function mergeBookMeta(existing = {}, incoming = {}) {
  return {
    ...incoming,
    ...existing,
    coverRemote: existing.coverRemote || incoming.coverRemote || '',
    coverSource: existing.coverSource || incoming.coverSource || incoming.source || '',
    source: existing.source || incoming.source || 'cache',
    lookupStatus: existing.lookupStatus || incoming.lookupStatus || 'found',
  };
}

function manualNeeded(isbn) {
  return {
    isbn: normalizeIsbn(isbn),
    isbn10: '',
    title: '',
    author: '',
    publisher: '',
    pubDate: '',
    summary: '',
    category: '童书',
    ageRange: '',
    cover: '',
    coverRemote: '',
    coverSource: '',
    source: 'manual',
    sourceId: '',
    lookupStatus: 'manual_needed',
  };
}

module.exports = {
  cleanBookTitle,
  normalizeSearchText,
  bookMatchesKeyword,
  versionLabel,
  dedupeBooks,
  mergeBookMeta,
  manualNeeded,
};
