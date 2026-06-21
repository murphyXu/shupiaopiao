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

async function tryProvider(provider, operation) {
  try {
    return await operation(provider.adapter);
  } catch (err) {
    console.warn(`[bookProviders] ${provider.name}`, err.message || err);
    return null;
  }
}

async function lookupByIsbn(isbn) {
  return createProviderLookup(PROVIDERS).lookupByIsbn(isbn);
}

async function refreshByIsbn(isbn, timeoutMs = 1200) {
  const clean = normalizeIsbn(isbn);
  if (!isValidIsbn(clean)) return null;
  return tryProvider({ name: 'tanshu_refresh', adapter: tanshu }, (adapter) => adapter.lookupByIsbn(clean, timeoutMs));
}

async function searchByKeyword(keyword, limit = 10) {
  return createProviderLookup(PROVIDERS).searchByKeyword(keyword, limit);
}

function createProviderLookup(providers) {
  return {
    async lookupByIsbn(isbn) {
      for (const provider of providers) {
        if (typeof provider.adapter.lookupByIsbn !== 'function') continue;
        const result = await tryProvider(provider, (adapter) => adapter.lookupByIsbn(isbn));
        if (result) return result;
      }
      return null;
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
  createProviderLookup,
  lookupByIsbn,
  refreshByIsbn,
  searchByKeyword,
};
