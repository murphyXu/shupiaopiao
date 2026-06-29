#!/usr/bin/env node
/**
 * Audit _书目.csv for suspect catalog rows.
 *
 * Usage:
 *   rtk node scripts/audit-catalog-quality.js
 *   rtk node scripts/audit-catalog-quality.js --limit 20
 */

const fs = require('fs');
const readline = require('readline');
const { parseCatalogRow, loadInventoryOverrides, finalizeCatalogRecord } = require('./import-book-catalog');

const DEFAULT_CATALOG = '/Users/xumanna/Desktop/小谷吖/_书目.csv';
const DEFAULT_PRICING = '/Users/xumanna/Desktop/小谷吖/新建 文本文档_核价.csv';
const DEFAULT_INVENTORY = '/Users/xumanna/Desktop/小谷吖/社科类图书-有库存-20240911.csv';

function parseArgs(argv) {
  const args = { catalog: DEFAULT_CATALOG, pricing: DEFAULT_PRICING, inventory: DEFAULT_INVENTORY, limit: 0 };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--catalog') args.catalog = argv[++i];
    else if (key === '--pricing') args.pricing = argv[++i];
    else if (key === '--inventory') args.inventory = argv[++i];
    else if (key === '--limit') args.limit = Number(argv[++i]) || 0;
  }
  return args;
}

async function loadPricingMap(pricingPath) {
  const { loadPricingMap: load } = require('./import-book-catalog');
  return load(pricingPath);
}

async function main() {
  const args = parseArgs(process.argv);
  const pricingMap = await loadPricingMap(args.pricing);
  const inventoryMap = await loadInventoryOverrides(args.inventory);

  const rl = readline.createInterface({
    input: fs.createReadStream(args.catalog, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  let first = true;
  let parsed = 0;
  let suspect = 0;
  let inventoryOverrides = 0;
  const samples = [];

  for await (const line of rl) {
    if (first) {
      first = false;
      continue;
    }
    const raw = parseCatalogRow(line);
    if (!raw) continue;
    parsed += 1;
    const doc = finalizeCatalogRecord(raw, pricingMap, inventoryMap);
    if (!doc) continue;
    if (doc.inventoryOverride) inventoryOverrides += 1;
    if (doc.catalogQuality === 'suspect') {
      suspect += 1;
      if (!args.limit || samples.length < args.limit) {
        samples.push({
          isbn: doc.isbn,
          title: doc.title,
          author: doc.author,
          category: doc.category,
          reasons: doc.catalogQualityReasons || [],
        });
      }
    }
  }

  console.log(JSON.stringify({
    ok: true,
    parsed,
    suspect,
    suspectRate: parsed ? Number((suspect / parsed).toFixed(4)) : 0,
    inventoryOverrides,
    samples,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
