/** 书漂漂云数据库集合（首次使用前须 createCollection） */
const COLLECTIONS = [
  'books',
  'pricing_cache',
  'users',
  'shelf_books',
  'drifts',
  'drift_wants',
  'drift_orders',
  'drift_disputes',
  'drift_order_events',
  'coin_transactions',
  'credit_logs',
  'addresses',
  'reviews',
  'reports',
  'events',
  'daily_metrics',
];

function isAlreadyExists(err) {
  const msg = (err && (err.message || err.errMsg || '')).toString();
  return msg.includes('already exists')
    || msg.includes('Table exist')
    || msg.includes('ResourceExist')
    || err.errCode === -501001;
}

function isCollectionMissing(err) {
  const msg = (err && (err.message || err.errMsg || '')).toString();
  return err.errCode === -502005 || msg.includes('not exist') || msg.includes('DATABASE_COLLECTION_NOT_EXIST');
}

async function ensureCollections(db) {
  if (typeof db.createCollection !== 'function') {
    throw new Error('wx-server-sdk 版本过低，请重新上传云函数（云端安装依赖）');
  }
  const created = [];
  const skipped = [];
  for (const name of COLLECTIONS) {
    try {
      await db.createCollection(name);
      created.push(name);
    } catch (err) {
      if (isAlreadyExists(err)) {
        skipped.push(name);
      } else {
        throw err;
      }
    }
  }
  return { created, skipped, total: COLLECTIONS.length };
}

module.exports = { COLLECTIONS, ensureCollections, isCollectionMissing, isAlreadyExists };
