const tanshu = require('./tanshu');
const douban = require('./douban');
const googleBooks = require('./googleBooks');
const openLibrary = require('./openLibrary');
const { normalizeIsbn, isValidIsbn } = require('../bookCatalog');
const { cleanBookTitle, dedupeBooks } = require('../bookLookupPolicy');

const PROVIDERS = [
  { name: 'tanshu', adapter: tanshu },
  { name: 'douban', adapter: douban },
  { name: 'google_books', adapter: googleBooks },
  { name: 'open_library', adapter: openLibrary },
];

function searchKeywordVariants(keyword) {
  const variants = [String(keyword || '').trim(), cleanBookTitle(keyword)];
  return [...new Set(variants.filter(Boolean))];
}

function shouldUseExternalKeywordSearch(keyword) {
  const text = String(keyword || '').trim();
  if (!text) return false;
  return /[\u4e00-\u9fffA-Za-z]/.test(text);
}

function shouldProviderSearchKeyword(provider, keyword) {
  const name = provider.name || '';
  const hasChinese = /[\u4e00-\u9fff]/.test(String(keyword || ''));
  if (hasChinese) return name === 'douban';
  if (name === 'douban' || name.includes('tanshu')) return false;
  return true;
}

function hasRemoteCover(book = {}) {
  return !!(book.coverRemote && /^https?:\/\//.test(String(book.coverRemote)));
}

function mergeLookupBooks(base, incoming) {
  if (!incoming) return base || null;
  if (!base) return incoming;
  return {
    ...incoming,
    ...base,
    title: base.title || incoming.title,
    rawTitle: base.rawTitle || incoming.rawTitle || '',
    author: base.author || incoming.author,
    publisher: base.publisher || incoming.publisher,
    pubDate: base.pubDate || incoming.pubDate,
    listPrice: base.listPrice || incoming.listPrice,
    summary: base.summary || incoming.summary,
    category: base.category || incoming.category,
    sourceClc: base.sourceClc || incoming.sourceClc,
    ageRange: base.ageRange || incoming.ageRange,
    coverRemote: base.coverRemote || incoming.coverRemote || '',
    coverSource: base.coverRemote ? base.coverSource : (incoming.coverSource || base.coverSource || ''),
    source: base.source || incoming.source,
    sourceId: base.sourceId || incoming.sourceId,
    lookupStatus: base.lookupStatus || incoming.lookupStatus || 'found',
  };
}

async function lookupCoverByTitle(title, isbn) {
  if (typeof douban.lookupCoverByTitle !== 'function') return null;
  return douban.lookupCoverByTitle(title, isbn);
}

async function tryProvider(provider, operation) {
  try {
    return await operation(provider.adapter);
  } catch (err) {
    console.warn(`[bookProviders] ${provider.name}`, err.message || err);
    return null;
  }
}

async function lookupByIsbn(isbn) {
  return createProviderLookup(PROVIDERS, { coverFallback: true }).lookupByIsbn(isbn);
}

async function refreshByIsbn(isbn, timeoutMs = 1200) {
  const clean = normalizeIsbn(isbn);
  if (!isValidIsbn(clean)) return null;
  const fast = await tryProvider({ name: 'tanshu_refresh', adapter: tanshu }, (adapter) => adapter.lookupByIsbn(clean, timeoutMs));
  if (fast && hasRemoteCover(fast)) return fast;
  return createProviderLookup(PROVIDERS, { coverFallback: true }).lookupByIsbn(clean);
}

async function searchByKeyword(keyword, limit = 10) {
  return createProviderLookup(PROVIDERS, { coverFallback: true }).searchByKeyword(keyword, limit);
}

function createProviderLookup(providers, options = {}) {
  const coverFallback = !!options.coverFallback;
  return {
    async lookupByIsbn(isbn) {
      const clean = normalizeIsbn(isbn);
      if (!isValidIsbn(clean)) return null;
      let merged = null;
      for (const provider of providers) {
        if (typeof provider.adapter.lookupByIsbn !== 'function') continue;
        const result = await tryProvider(provider, (adapter) => adapter.lookupByIsbn(clean));
        if (!result) continue;
        merged = mergeLookupBooks(merged, result);
        if (coverFallback && merged.title && !hasRemoteCover(merged)) {
          const byTitle = await lookupCoverByTitle(merged.title, clean);
          if (byTitle) merged = mergeLookupBooks(merged, byTitle);
        }
        return merged;
      }
      return merged;
    },

    async searchByKeyword(keyword, limit = 10) {
      const isbn = normalizeIsbn(keyword);
      if (isValidIsbn(isbn)) {
        const book = await this.lookupByIsbn(isbn);
        return book ? [book] : [];
      }
      if (!shouldUseExternalKeywordSearch(keyword)) return [];
      const variants = searchKeywordVariants(keyword);
      const tasks = providers
        .filter((provider) => typeof provider.adapter.searchByKeyword === 'function')
        .filter((provider) => shouldProviderSearchKeyword(provider, keyword))
        .flatMap((provider) => variants.map((variant) =>
          tryProvider(provider, (adapter) => adapter.searchByKeyword(variant, limit))));
      const lists = await Promise.all(tasks);
      const results = [];
      lists.forEach((list) => {
        if (Array.isArray(list)) results.push(...list);
      });
      return dedupeBooks(results).slice(0, limit);
    },
  };
}

module.exports = {
  searchKeywordVariants,
  shouldUseExternalKeywordSearch,
  shouldProviderSearchKeyword,
  hasRemoteCover,
  mergeLookupBooks,
  createProviderLookup,
  lookupByIsbn,
  refreshByIsbn,
  searchByKeyword,
};
