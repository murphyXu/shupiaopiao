const assert = require('assert');
const fs = require('fs');
const readline = require('readline');
const {
  detectMixedCatalogRecord,
  titlesCompatible,
  assessCatalogRecord,
  shouldTrustCatalogForMerge,
} = require('../cloudfunctions/api/lib/catalogQuality');
const { finalizeCatalogRecord, parseCatalogRow } = require('./import-book-catalog');

const catalogPath = '/Users/xumanna/Desktop/小谷吖/_书目.csv';
const targetIsbn = '9787551117500';

async function main() {
  assert.strictEqual(titlesCompatible('老鼠邮差去度假', '编辑和语言应用'), false);
  assert.strictEqual(titlesCompatible('毛泽东选集', '毛泽东选集 第四卷'), true);

  const mixed = {
    title: '编辑和语言应用',
    author: '郝荣斋  著',
    category: '社会文化',
    summary: '本书是从编辑角度研究语言文字应用的学术文集。',
    authorIntro: '玛丽安娜•迪比克，卡内基文学奖、凯特格林纳威奖提名作家，她的作品大多以动物为主角',
  };
  assert.strictEqual(detectMixedCatalogRecord(mixed), true);
  assert.strictEqual(assessCatalogRecord(mixed).quality, 'suspect');

  const trust = shouldTrustCatalogForMerge(
    { title: '老鼠邮差去度假', author: '玛丽安娜迪比克' },
    { title: '编辑和语言应用', author: '郝荣斋  著', catalogQuality: 'suspect' },
  );
  assert.strictEqual(trust.ok, false);

  let targetLine = '';
  if (fs.existsSync(catalogPath)) {
    const rl = readline.createInterface({
      input: fs.createReadStream(catalogPath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      if (line.includes(targetIsbn) && line.includes('booklibimg.kfzimg.com')) {
        targetLine = line;
        break;
      }
    }
  }
  assert.ok(targetLine, 'target isbn line should exist in catalog csv');

  const raw = parseCatalogRow(targetLine);
  const finalized = finalizeCatalogRecord(raw, new Map(), new Map([
    [targetIsbn, {
      isbn: targetIsbn,
      title: '老鼠邮差去度假',
      author: '玛丽安娜迪比克',
      publisher: '花山文艺出版社',
      category: '儿童 绘本',
    }],
  ]));
  assert.strictEqual(finalized.title, '老鼠邮差去度假');
  assert.strictEqual(finalized.inventoryOverride, true);
  assert.strictEqual(finalized.catalogQuality, 'trusted');

  console.log('catalog quality ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
