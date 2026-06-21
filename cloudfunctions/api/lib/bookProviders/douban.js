const { getJson, getText } = require('./http');
const tanshu = require('./tanshu');
const { normalizeIsbn } = require('../bookCatalog');

const SUGGEST_ENDPOINT = 'https://book.douban.com/j/subject_suggest';
const SEARCH_ENDPOINT = 'https://search.douban.com/book/subject_search';
const SUGGEST_TIMEOUT_MS = 900;
const DETAIL_TIMEOUT_MS = 1200;
const MAX_DETAIL = 5;
const DOUBAN_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  Referer: 'https://book.douban.com/',
};

function decodeHtml(value) {
  return String(value || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripTags(value) {
  return decodeHtml(String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function normalizeDoubanCover(url) {
  if (!url) return '';
  return String(url)
    .replace(/^http:\/\//, 'https://')
    .replace(/\/view\/subject\/[a-z]\/public\//, '/view/subject/l/public/');
}

function parseAbstract(abstract) {
  const parts = String(abstract || '')
    .split(/\s*\/\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  return {
    author: parts[0] || '',
    publisher: parts[1] || '',
    pubDate: parts[2] || '',
  };
}

function normalizeSuggestItem(item = {}) {
  if (!item || item.type === 's' || item.tpl_name === 'search_more') return null;
  const url = item.url || (item.id ? `https://book.douban.com/subject/${item.id}/` : '');
  if (!url || !/\/subject\/\d+\/?/.test(url)) return null;
  const abstract = parseAbstract(item.abstract || '');
  return {
    id: String(item.id || (url.match(/\/subject\/(\d+)/) || [])[1] || ''),
    title: stripTags(item.title || ''),
    url,
    author: stripTags(item.author_name || abstract.author),
    publisher: stripTags(abstract.publisher),
    pubDate: stripTags(item.year || abstract.pubDate),
    coverRemote: normalizeDoubanCover(item.pic || item.cover_url || ''),
  };
}

function parseSuggestItems(input) {
  let data = input;
  if (typeof input === 'string') {
    const dataMatch = input.match(/window\.__DATA__\s*=\s*(\{[\s\S]*?\});/);
    if (dataMatch) {
      try {
        data = JSON.parse(dataMatch[1]);
      } catch (e) {
        data = {};
      }
    } else {
      try {
        data = JSON.parse(input);
      } catch (e) {
        data = {};
      }
    }
  }
  const list = Array.isArray(data) ? data : (data.items || []);
  return list.map(normalizeSuggestItem).filter(Boolean);
}

function extractInfoValue(html, label) {
  const pattern = new RegExp(`<span[^>]*class=["']pl["'][^>]*>\\s*${label}\\s*:?\\s*<\\/span>\\s*:?([\\s\\S]*?)(?:<br\\s*\\/?>|<\\/div>)`, 'i');
  const match = String(html || '').match(pattern);
  return match ? stripTags(match[1]) : '';
}

function parseSubjectPage(html) {
  const content = String(html || '');
  const mainPic = (content.match(/<div[^>]+id=["']mainpic["'][\s\S]*?<a[^>]+href=["']([^"']+)["']/i) || [])[1] || '';
  const isbn = normalizeIsbn(extractInfoValue(content, 'ISBN'));
  const introMatches = [...content.matchAll(/<div[^>]+class=["']intro["'][^>]*>([\s\S]*?)<\/div>/gi)];
  const summary = introMatches
    .map((match) => stripTags(match[1]).replace(/展开全部/g, '').trim())
    .find((text) => text.length > 10) || '';
  return {
    isbn,
    author: extractInfoValue(content, '作者'),
    publisher: extractInfoValue(content, '出版社'),
    pubDate: extractInfoValue(content, '出版年'),
    summary,
    coverRemote: normalizeDoubanCover(mainPic),
  };
}

function normalizeDoubanBook(item, detail = {}, enriched = null) {
  const isbn = normalizeIsbn((enriched && enriched.isbn) || detail.isbn);
  if (!isbn || !item.title) return null;
  if (enriched) {
    return {
      ...enriched,
      title: enriched.title || item.title,
      rawTitle: item.title,
      source: enriched.source || 'tanshu',
      sourceId: enriched.sourceId || isbn,
      lookupStatus: 'found',
    };
  }
  return {
    isbn,
    isbn10: isbn.length === 10 ? isbn : '',
    title: item.title || '',
    rawTitle: '',
    author: detail.author || item.author || '未知作者',
    publisher: detail.publisher || item.publisher || '',
    pubDate: detail.pubDate || item.pubDate || '',
    summary: detail.summary || '',
    category: '图书',
    ageRange: '',
    coverRemote: detail.coverRemote || item.coverRemote || '',
    coverSource: 'douban',
    source: 'douban',
    sourceId: item.id || isbn,
    lookupStatus: 'found',
  };
}

async function fetchSuggest(keyword) {
  const url = `${SUGGEST_ENDPOINT}?q=${encodeURIComponent(keyword)}`;
  try {
    const data = await getJson(url, SUGGEST_TIMEOUT_MS, undefined, DOUBAN_HEADERS);
    return parseSuggestItems(data);
  } catch (err) {
    console.warn('[douban] suggest json', err.message || err);
    if ((err.message || '') === 'REQUEST_TIMEOUT') return [];
  }

  const fallbackUrl = `${SEARCH_ENDPOINT}?search_text=${encodeURIComponent(keyword)}&cat=1001`;
  const html = await getText(fallbackUrl, SUGGEST_TIMEOUT_MS, undefined, DOUBAN_HEADERS);
  return parseSuggestItems(html);
}

async function fetchDetail(item) {
  try {
    const html = await getText(item.url, DETAIL_TIMEOUT_MS, undefined, DOUBAN_HEADERS);
    return parseSubjectPage(html);
  } catch (err) {
    console.warn('[douban] detail', item.id || item.url, err.message || err);
    return {};
  }
}

async function enrichByIsbn(isbn) {
  try {
    return await tanshu.lookupByIsbn(isbn, 700);
  } catch (err) {
    console.warn('[douban] tanshu enrich', err.message || err);
    return null;
  }
}

async function searchByKeyword(keyword, limit = 10) {
  const text = String(keyword || '').trim();
  if (!text || !/[\u4e00-\u9fff]/.test(text)) return [];

  const items = (await fetchSuggest(text)).slice(0, Math.min(limit, MAX_DETAIL));
  const details = await Promise.all(items.map(fetchDetail));
  const enriched = await Promise.all(details.map((detail) => (
    detail.isbn ? enrichByIsbn(detail.isbn) : Promise.resolve(null)
  )));
  return items
    .map((item, index) => normalizeDoubanBook(item, details[index], enriched[index]))
    .filter(Boolean)
    .slice(0, limit);
}

module.exports = {
  parseSuggestItems,
  parseSubjectPage,
  normalizeDoubanCover,
  normalizeDoubanBook,
  searchByKeyword,
};
