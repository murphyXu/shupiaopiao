const { ok, fail, uid, nowIso } = require('../lib/utils');
const { db, requireUser } = require('../lib/db');
const { estimateFromCache } = require('../lib/pricing');

async function estimate(openid, data) {
  const user = await requireUser(openid);
  if (!user) return fail(401, '未登录');
  const { data: cache } = await db.collection('pricing_cache').where({ isbn: data.isbn }).limit(1).get();
  const { data: books } = await db.collection('books').where({ isbn: data.isbn }).limit(1).get();
  const category = books[0] ? books[0].category : '';
  return ok(estimateFromCache(cache[0], data.condition || 'like_new', category));
}

module.exports = { estimate };
