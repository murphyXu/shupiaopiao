const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  getGeneratedBooklists,
  buildBooklistFeed,
  buildGeneratedBooklistDetail,
} = require('../cloudfunctions/api/lib/booklistContent');
const { BOOK_CATALOG } = require('../cloudfunctions/api/lib/bookCatalog');

function readJpegSize(filePath) {
  const buffer = fs.readFileSync(filePath);
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) break;
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
  }
  throw new Error(`cannot read jpeg size: ${filePath}`);
}

const pool = getGeneratedBooklists();
assert.strictEqual(pool.length, 1000, 'generated pool should contain 1000 topics');
assert.strictEqual(new Set(pool.map((item) => item.id)).size, 1000, 'generated ids should be unique');
assert.strictEqual(new Set(pool.map((item) => item.cardTitle)).size, 1000, 'generated card titles should be unique');
assert.ok(pool.some((item) => item.tone === '随手记'), 'pool should include note-style voice');
assert.ok(pool.some((item) => item.tone === '朋友安利'), 'pool should include social recommendation voice');
assert.ok(pool.some((item) => item.themeKey === 'emotion'), 'pool should cover emotion theme');
assert.ok(pool.some((item) => item.themeKey === 'classic'), 'pool should cover classic theme');
assert.ok(pool.some((item) => item.audience === 'adult'), 'pool should include adult readers');
assert.ok(pool.some((item) => item.themeKey === 'business'), 'pool should cover business books');
assert.ok(pool.some((item) => item.themeKey === 'mystery'), 'pool should cover fiction/mystery books');
assert.ok(pool.some((item) => item.themeKey === 'psychology'), 'pool should cover psychology books');
const curated = pool.filter((item) => item.qualityTier === '精选长文');
assert.strictEqual(curated.length, 120, '方案 C should keep 120 curated long-form items');
assert.ok(new Set(curated.map((item) => item.tone)).size >= 5, 'curated items should cover all writing voices');

const coldFeed = buildBooklistFeed({ page: 1, size: 12, books: BOOK_CATALOG, shelfBooks: [], signals: {} });
assert.strictEqual(coldFeed.list.length, 12);
assert.ok(coldFeed.total >= 1000);
assert.ok(coldFeed.list.every((item) => item.title && item.cardTitle && item.coverImage), 'feed cards need xiaohongshu display fields');
assert.ok(coldFeed.list.every((item) => /^\/assets\/booklist-covers\/[a-z0-9-]+\.jpg$/.test(item.coverImage)), 'feed covers should use packaged local jpg assets');
assert.ok(coldFeed.list.every((item) => !item.coverStyle), 'feed cards should not use generated color or gradient cover styles');
assert.ok(coldFeed.list.every((item) => !item.reason && !item.coverText), 'feed cards should not expose recommendation logic or text overlay');
assert.ok(coldFeed.list.every((item) => item.cardTitle.length <= 24), 'feed card title should stay compact');
const firstFiftyTitles = buildBooklistFeed({ page: 1, size: 50, books: BOOK_CATALOG, shelfBooks: [], signals: {} }).list.map((item) => item.cardTitle);
assert.strictEqual(new Set(firstFiftyTitles).size, firstFiftyTitles.length, 'feed titles should not repeat');
const firstTwentyCovers = buildBooklistFeed({ page: 1, size: 20, books: BOOK_CATALOG, shelfBooks: [], signals: {} }).list.map((item) => item.coverImage);
assert.strictEqual(new Set(firstTwentyCovers).size, firstTwentyCovers.length, 'first feed page should not repeat covers');
const firstFiftyCovers = buildBooklistFeed({ page: 1, size: 50, books: BOOK_CATALOG, shelfBooks: [], signals: {} }).list.map((item) => item.coverImage);
assert.strictEqual(new Set(firstFiftyCovers).size, firstFiftyCovers.length, 'large feed page should not repeat covers');
const coverAssets = new Set(pool.map((item) => item.coverImage));
assert.strictEqual(coverAssets.size, 60, 'cover pool should provide enough local photo assets for several non-repeating pages');
coverAssets.forEach((coverImage) => {
  const assetPath = path.join(__dirname, '../miniprogram', coverImage);
  assert.ok(fs.existsSync(assetPath), `cover asset should exist: ${coverImage}`);
  const size = readJpegSize(assetPath);
  assert.strictEqual(size.width / size.height, 0.8, `cover asset should be 4:5: ${coverImage}`);
});
const allBodies = pool.map((item) => buildGeneratedBooklistDetail(item.id, BOOK_CATALOG).article.sections.map((section) => section.text || section.title || '').join('\n'));
assert.strictEqual(new Set(allBodies).size, allBodies.length, 'article bodies should not repeat across generated lists');

const shelfFeed = buildBooklistFeed({
  page: 1,
  size: 20,
  books: BOOK_CATALOG,
  shelfBooks: [
    { book: { title: '我爸爸', author: '安东尼·布朗', category: '绘本', ageRange: '3-6' } },
    { book: { title: '我妈妈', author: '安东尼·布朗', category: '绘本', ageRange: '3-6' } },
  ],
  signals: {},
});
assert.ok(shelfFeed.list.slice(0, 8).some((item) => item.themeKey === 'family'), 'shelf family books should boost family recommendations');
assert.ok(!shelfFeed.list[0].reason, 'shelf-based feed should not expose recommendation reason');

const searchFeed = buildBooklistFeed({
  page: 1,
  size: 20,
  books: BOOK_CATALOG,
  shelfBooks: [],
  signals: { keywords: ['情绪管理', '生气'] },
});
assert.ok(searchFeed.list.slice(0, 8).some((item) => item.themeKey === 'emotion'), 'search behavior should boost related themes');

const detail = buildGeneratedBooklistDetail(pool.find((item) => item.themeKey === 'classic').id, BOOK_CATALOG);
assert.ok(detail);
assert.ok(detail.title);
assert.ok(detail.article.sections.length >= 8, 'long article should have enough sections');
assert.ok(detail.article.sections.some((section) => section.type === 'book'), 'article should contain inline book entries');
assert.ok(detail.books.length >= 3, 'detail should expose footer books');
assert.ok(detail.relatedLists.length >= 3, 'detail should expose related list links');
assert.ok(detail.coverImage && !detail.coverStyle && !detail.coverText, 'detail cover should be local image and visual-only');
assert.ok(detail.relatedLists.every((item) => item.coverImage && !item.coverStyle), 'related lists should use local image covers');
assert.ok(!/首先|其次|总之|作为AI|根据你的|适合放在这里读|原因是|推荐逻辑|先推|最近关注/.test(detail.article.sections.map((section) => section.text || '').join('')), 'article copy should avoid AI/product logic transitions');
assert.ok(/如果|那种|其实|后来|有时候|不是/.test(detail.article.sections.map((section) => section.text || '').join('')), 'article copy should keep a conversational, empathetic voice');

const businessDetail = buildGeneratedBooklistDetail(pool.find((item) => item.themeKey === 'business').id, BOOK_CATALOG);
assert.strictEqual(
  businessDetail.books.some((book) => ['绘本', '童书'].includes(book.category)),
  false,
  'adult business list should not fallback to unrelated children books',
);

const giftItem = pool.find((item) => item.scene === '送礼不踩雷' && item.themeKey === 'family');
const giftDetail = buildGeneratedBooklistDetail(giftItem.id, BOOK_CATALOG);
assert.ok(
  giftDetail.article.sections.some((section) => (section.text || '').includes('送礼不踩雷')),
  'article copy should use current scene text',
);

console.log('booklist content ok');
