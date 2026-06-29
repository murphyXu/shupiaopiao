#!/usr/bin/env node
/**
 * Recalculate coinValue/systemCoinValue for open drifts (IN_POOL / PENDING_REVIEW).
 *
 * Usage:
 *   rtk node scripts/migrate-drift-pricing.js
 *   rtk node scripts/migrate-drift-pricing.js --dry-run
 */

const fs = require('fs');
const path = require('path');
const { resolveDriftCoinFields, pricingChanged } = require('../cloudfunctions/api/lib/driftPricingRecalc');

const ROOT = path.join(__dirname, '..');
const DEFAULT_ENV = 'cloud1-6gngg7ipd8f073ed';
const OPEN_STATUSES = ['PENDING_REVIEW', 'IN_POOL'];

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  fs.readFileSync(filePath, 'utf8').split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) return;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = value;
  });
}

function parseArgs(argv) {
  const args = { limit: 50, dryRun: false };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--limit') args.limit = Number(argv[++i]) || 50;
    else if (key === '--dry-run') args.dryRun = true;
  }
  return args;
}

function loadCloudbaseApp() {
  const env = process.env.TCB_ENV || process.env.CLOUD_ENV_ID || DEFAULT_ENV;
  const secretId = process.env.TCB_SECRET_ID || process.env.TENCENT_SECRET_ID;
  const secretKey = process.env.TCB_SECRET_KEY || process.env.TENCENT_SECRET_KEY;
  if (!secretId || !secretKey) throw new Error('Missing TCB credentials in .env.local');
  const cloudbase = require(path.join(ROOT, 'cloudfunctions/seed/node_modules/@cloudbase/node-sdk'));
  return cloudbase.init({ env, secretId, secretKey });
}

function wrapDb(app) {
  const raw = app.database();
  function wrapQuery(query) {
    return {
      where(condition) { return wrapQuery(query.where(condition)); },
      orderBy(field, direction) { return wrapQuery(query.orderBy(field, direction)); },
      limit(n) { return wrapQuery(query.limit(n)); },
      get() { return query.get(); },
    };
  }
  function wrapCollection(col) {
    return {
      where(condition) { return wrapQuery(col.where(condition)); },
      orderBy(field, direction) { return wrapQuery(col.orderBy(field, direction)); },
      doc(id) {
        const ref = col.doc(id);
        return {
          get: () => ref.get(),
          update(payload = {}) {
            const data = payload.data !== undefined ? payload.data : payload;
            return ref.update(data);
          },
        };
      },
    };
  }
  return {
    collection: (name) => wrapCollection(raw.collection(name)),
    command: raw.command,
  };
}

async function loadBooksByIds(db, bookIds = []) {
  const ids = [...new Set(bookIds.filter(Boolean))];
  if (!ids.length) return {};
  const { data } = await db.collection('books').where({ _id: db.command.in(ids) }).get();
  const map = {};
  data.forEach((row) => { map[row._id] = row; });
  return map;
}

async function main() {
  loadDotEnv(path.join(ROOT, '.env.local'));
  const args = parseArgs(process.argv);
  const app = loadCloudbaseApp();
  const db = wrapDb(app);
  const _ = db.command;

  let cursor = '';
  let totals = { processed: 0, updated: 0, unchanged: 0, failed: 0 };
  const samples = [];

  while (true) {
    let query = db.collection('drifts').where({ status: _.in(OPEN_STATUSES) }).orderBy('_id', 'asc').limit(args.limit);
    if (cursor) query = db.collection('drifts').where({ status: _.in(OPEN_STATUSES), _id: _.gt(cursor) }).orderBy('_id', 'asc').limit(args.limit);
    const { data: rows } = await query.get();
    if (!rows.length) break;

    const books = await loadBooksByIds(db, rows.map((row) => row.bookId));
    for (const drift of rows) {
      totals.processed += 1;
      try {
        const pricing = await resolveDriftCoinFields(db, drift, books[drift.bookId] || {});
        if (!pricingChanged(pricing, drift)) {
          totals.unchanged += 1;
          continue;
        }
        if (!args.dryRun) {
          await db.collection('drifts').doc(drift._id).update({
            systemCoinValue: pricing.systemCoinValue,
            coinValue: pricing.coinValue,
            pricingRecalcAt: new Date().toISOString(),
          });
        }
        totals.updated += 1;
        if (samples.length < 15) {
          samples.push({
            driftId: drift._id,
            isbn: books[drift.bookId] && books[drift.bookId].isbn,
            from: { systemCoinValue: pricing.previousSystemCoinValue, coinValue: pricing.previousCoinValue },
            to: { systemCoinValue: pricing.systemCoinValue, coinValue: pricing.coinValue, medianPrice: pricing.medianPrice },
          });
        }
      } catch (err) {
        totals.failed += 1;
      }
    }

    cursor = rows[rows.length - 1]._id;
    console.log(`batch processed=${rows.length} cursor=${cursor}`);
    if (rows.length < args.limit) break;
  }

  console.log(JSON.stringify({ ok: true, dryRun: args.dryRun, totals, samples }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
