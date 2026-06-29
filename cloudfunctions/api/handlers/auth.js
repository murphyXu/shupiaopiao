const { ok, fail } = require('../lib/utils');
const { getOrCreateUser, requireUser, formatUser, db } = require('../lib/db');
const { assertSafeTextFields, assertSafeMediaFiles } = require('../lib/contentSecurity');

const MAX_SHELF_NAME_LENGTH = 12;

function shelfNameFromNickname(nickname) {
  const base = String(nickname || '').trim();
  if (!base) return '我的书架';
  return `${base}的书架`.slice(0, MAX_SHELF_NAME_LENGTH);
}

async function login(openid, data = {}) {
  const user = await getOrCreateUser(openid, data.inviterId || '');
  return ok({ user: formatUser(user) });
}

async function profile(openid) {
  const user = await requireUser(openid);
  if (!user) return fail(401, '未登录');
  return ok(formatUser(user));
}

async function updateProfile(openid, data) {
  const user = await requireUser(openid);
  if (!user) return fail(401, '未登录');
  const patch = {};
  if (data.nickname !== undefined) {
    const nickname = String(data.nickname || '').trim();
    patch.nickname = nickname;
    if (data.shelfName === undefined && nickname !== String(user.nickname || '').trim()) {
      patch.shelfName = shelfNameFromNickname(nickname);
    }
  }
  if (data.avatar !== undefined) patch.avatar = data.avatar;
  if (data.childAgeRange !== undefined) patch.childAgeRange = data.childAgeRange;
  if (data.shelfName !== undefined) {
    const shelfName = String(data.shelfName || '').trim().slice(0, 12);
    patch.shelfName = shelfName || '我的书架';
  }
  await assertSafeTextFields(openid, {
    nickname: patch.nickname,
    shelfName: patch.shelfName,
  });
  await assertSafeMediaFiles(openid, [patch.avatar].filter(Boolean));
  await db.collection('users').doc(user._id).update({ data: patch });
  const { data: updated } = await db.collection('users').doc(user._id).get();
  return ok(formatUser(updated));
}

module.exports = { login, profile, updateProfile, shelfNameFromNickname };
