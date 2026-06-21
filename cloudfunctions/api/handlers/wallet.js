const { ok, fail } = require('../lib/utils');
const { db, requireUser } = require('../lib/db');

async function balance(openid) {
  const user = await requireUser(openid);
  if (!user) return fail(401, '未登录');
  const balanceValue = Number(user.coinBalance) || 0;
  const frozen = Number(user.coinFrozen) || 0;
  return ok({ balance: balanceValue, frozen, available: Math.max(balanceValue - frozen, 0) });
}

async function transactions(openid, data) {
  const user = await requireUser(openid);
  if (!user) return fail(401, '未登录');
  const page = Number(data.page) || 1;
  const size = 20;
  const { data: list } = await db.collection('coin_transactions')
    .where({ userId: user._id })
    .orderBy('createdAt', 'desc')
    .skip((page - 1) * size)
    .limit(size)
    .get();
  return ok({
    list: list.map((t) => ({
      id: t._id,
      amount: t.amount,
      balanceDelta: t.balanceDelta === undefined ? (Number(t.amount) || 0) : Number(t.balanceDelta),
      frozenDelta: Number(t.frozenDelta) || 0,
      type: t.type,
      description: t.description,
      createdAt: t.createdAt,
    })),
    page,
  });
}

module.exports = { balance, transactions };
