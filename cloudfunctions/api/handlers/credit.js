const { ok, fail } = require('../lib/utils');
const { db, requireUser } = require('../lib/db');

async function score(openid) {
  const user = await requireUser(openid);
  if (!user) return fail(401, '未登录');
  const { data: logs } = await db.collection('credit_logs')
    .where({ userId: user._id })
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();
  return ok({
    score: user.creditScore,
    logs: logs.map((l) => ({
      id: l._id,
      delta: l.delta,
      reason: l.reason,
      createdAt: l.createdAt,
    })),
  });
}

module.exports = { score };
