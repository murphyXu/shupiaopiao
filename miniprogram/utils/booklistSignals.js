const STORAGE_KEY = 'booklistSignals';
const MAX_KEYWORDS = 10;
const MAX_BOOKS = 20;
const MAX_THEMES = 20;

function readSignals() {
  try {
    return wx.getStorageSync(STORAGE_KEY) || {};
  } catch (e) {
    return {};
  }
}

function writeSignals(signals) {
  try {
    wx.setStorageSync(STORAGE_KEY, signals);
  } catch (e) {
    // ignore storage failures
  }
}

function uniqueFront(list, value, limit) {
  const clean = typeof value === 'string' ? value.trim() : value;
  if (!clean) return (list || []).slice(0, limit);
  const key = typeof clean === 'string' ? clean : (clean.id || clean.isbn || clean.title);
  const filtered = (list || []).filter((item) => {
    const itemKey = typeof item === 'string' ? item : (item.id || item.isbn || item.title);
    return itemKey !== key;
  });
  return [clean].concat(filtered).slice(0, limit);
}

function recordSearchKeyword(keyword) {
  const clean = String(keyword || '').trim();
  if (!clean) return;
  const signals = readSignals();
  signals.keywords = uniqueFront(signals.keywords, clean, MAX_KEYWORDS);
  writeSignals(signals);
}

function recordBookView(book = {}) {
  const item = {
    id: book.id || book._id || book.isbn || book.title || '',
    isbn: book.isbn || '',
    title: book.title || '',
    author: book.author || '',
    category: book.category || '',
    ageRange: book.ageRange || '',
  };
  if (!item.title) return;
  const signals = readSignals();
  signals.books = uniqueFront(signals.books, item, MAX_BOOKS);
  writeSignals(signals);
}

function recordBooklistView(list = {}) {
  const signals = readSignals();
  [list.themeKey, list.theme].filter(Boolean).forEach((theme) => {
    signals.listThemes = uniqueFront(signals.listThemes, theme, MAX_THEMES);
  });
  writeSignals(signals);
}

function getBooklistSignals() {
  const signals = readSignals();
  return {
    keywords: (signals.keywords || []).slice(0, MAX_KEYWORDS),
    books: (signals.books || []).slice(0, MAX_BOOKS),
    listThemes: (signals.listThemes || []).slice(0, MAX_THEMES),
  };
}

module.exports = {
  recordSearchKeyword,
  recordBookView,
  recordBooklistView,
  getBooklistSignals,
};
