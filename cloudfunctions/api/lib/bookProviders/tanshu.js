const { getJson } = require('./http');
const { normalizeIsbn } = require('../bookCatalog');
const { normalizeBookCategory } = require('../bookCategory');

const TANSHU_ENDPOINT = 'https://api2.tanshuapi.com/api/isbn/v2/index';
const TIMEOUT_MS = 2500;

function httpsImage(url) {
  if (!url) return '';
  return String(url).replace(/^http:\/\//, 'https://');
}

function normalizeTanshuBook(raw, fallbackIsbn) {
  const data = raw || {};
  const isbn = normalizeIsbn(data.isbn || fallbackIsbn);
  if (!isbn || !data.title) return null;
  const rawCategory = data.class || data.category || data.bookCategory || data.classify || data.classification || data.clcName || data.clc || data.catalog || data.type || '图书';
  return {
    isbn,
    isbn10: data.isbn10 || (isbn.length === 10 ? isbn : ''),
    title: data.title || '',
    author: data.author || '未知作者',
    publisher: data.publisher || '',
    pubDate: data.pubdate || '',
    listPrice: String(data.price || data.listPrice || data.fixedPrice || '').trim(),
    summary: data.summary || '',
    category: normalizeBookCategory(rawCategory, {
      title: data.title,
      summary: data.summary,
    }),
    ageRange: '',
    coverRemote: httpsImage(data.img),
    coverSource: 'tanshu',
    source: 'tanshu',
    sourceId: isbn,
    lookupStatus: 'found',
  };
}

async function lookupByIsbn(isbn, timeoutMs = TIMEOUT_MS) {
  const clean = normalizeIsbn(isbn);
  const key = process.env.TANSHU_API_KEY;
  if (!clean || !key) return null;

  const url = `${TANSHU_ENDPOINT}?key=${encodeURIComponent(key)}&isbn=${encodeURIComponent(clean)}`;
  const result = await getJson(url, timeoutMs);
  if (!result || result.code !== 1 || !result.data) return null;
  return normalizeTanshuBook(result.data, clean);
}

async function searchByKeyword() {
  return [];
}

module.exports = {
  normalizeTanshuBook,
  lookupByIsbn,
  searchByKeyword,
};
