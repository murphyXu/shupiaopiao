const { ok, fail, uid, nowIso } = require('../lib/utils');
const { db, requireUser } = require('../lib/db');

function formatAddress(a) {
  return {
    id: a._id,
    name: a.name,
    phone: a.phone,
    region: a.region,
    detail: a.detail,
    isDefault: !!a.isDefault,
    createdAt: a.createdAt,
  };
}

async function list(openid) {
  const user = await requireUser(openid);
  if (!user) return fail(401, '未登录');
  const { data } = await db.collection('addresses').where({ userId: user._id }).orderBy('createdAt', 'desc').get();
  return ok({ list: data.map(formatAddress) });
}

async function unsetOtherDefaultAddresses(userId, keepId = '') {
  const { data: existing } = await db.collection('addresses').where({ userId }).get();
  await Promise.all(existing
    .filter((item) => item._id !== keepId && item.isDefault)
    .map((item) => db.collection('addresses').doc(item._id).update({ data: { isDefault: false } })));
}

async function add(openid, data) {
  const user = await requireUser(openid);
  if (!user) return fail(401, '未登录');
  if (data.isDefault) {
    await unsetOtherDefaultAddresses(user._id);
  }
  const id = uid();
  await db.collection('addresses').add({
    data: {
      _id: id,
      userId: user._id,
      name: data.name,
      phone: data.phone,
      region: data.region,
      detail: data.detail,
      isDefault: !!data.isDefault,
      createdAt: nowIso(),
    },
  });
  const { data: row } = await db.collection('addresses').doc(id).get();
  return ok(formatAddress(row));
}

async function update(openid, data) {
  const user = await requireUser(openid);
  if (!user) return fail(401, '未登录');
  const { data: row } = await db.collection('addresses').doc(data.id).get();
  if (!row || row.userId !== user._id) return fail(404, '地址不存在');
  if (data.isDefault) {
    await unsetOtherDefaultAddresses(user._id, data.id);
  }
  const patch = {};
  ['name', 'phone', 'region', 'detail', 'isDefault'].forEach((k) => {
    if (data[k] !== undefined) patch[k] = data[k];
  });
  await db.collection('addresses').doc(data.id).update({ data: patch });
  const { data: updated } = await db.collection('addresses').doc(data.id).get();
  return ok(formatAddress(updated));
}

async function remove(openid, data) {
  const user = await requireUser(openid);
  if (!user) return fail(401, '未登录');
  const { data: row } = await db.collection('addresses').doc(data.id).get();
  if (!row || row.userId !== user._id) return fail(404, '地址不存在');
  await db.collection('addresses').doc(data.id).remove();
  return ok(null);
}

module.exports = { list, add, update, remove };
