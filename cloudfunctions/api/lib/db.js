const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database({ throwOnNotFound: false });
const _ = db.command;

const { uid, nowIso } = require('./utils');
const { cleanBookTitle, versionLabel } = require('./bookLookupPolicy');
const { normalizeBookCategory } = require('./bookCategory');
const { isCollectionMissing } = require('./collections');
const { applyPendingPenalty } = require('./driftPolicy');

const DEFAULT_SHELF_LIMIT = 100;
const SIGNUP_BONUS = 0;
const INVITE_REWARD = 2;
const INVITE_LIFETIME_CAP = 10;
const INVITE_DAILY_CAP = 10;

async function safeQuery(collectionName, builder) {
  try {
    return await builder(db.collection(collectionName));
  } catch (err) {
    if (isCollectionMissing(err)) return { data: [], total: 0 };
    throw err;
  }
}

async function getUserByOpenid(openid) {
  const { data } = await db.collection('users').where({ openid }).limit(1).get();
  return data[0] || null;
}

async function requireUser(openid) {
  const user = await getUserByOpenid(openid);
  if (!user) return null;
  return user;
}

async function rewardInviter(inviterId, invitedUserId) {
  if (!inviterId || inviterId === invitedUserId) return false;
  let inviter = null;
  try {
    const res = await db.collection('users').doc(inviterId).get();
    inviter = res.data;
  } catch (e) {
    inviter = null;
  }
  if (!inviter || inviter._id === invitedUserId) return false;

  const { total: duplicateReward } = await db.collection('coin_transactions')
    .where({ userId: inviterId, type: 'invite_reward', refId: invitedUserId })
    .count();
  if (duplicateReward) return false;

  const { data: rewards } = await db.collection('coin_transactions')
    .where({ userId: inviterId, type: 'invite_reward' })
    .limit(100)
    .get();
  const totalReward = rewards.reduce((sum, row) => sum + Math.max(Number(row.amount) || 0, 0), 0);
  if (totalReward >= INVITE_LIFETIME_CAP) return false;

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const todayReward = rewards
    .filter((row) => new Date(row.createdAt) >= dayStart)
    .reduce((sum, row) => sum + Math.max(Number(row.amount) || 0, 0), 0);
  if (todayReward >= INVITE_DAILY_CAP) return false;

  const amount = Math.min(INVITE_REWARD, INVITE_LIFETIME_CAP - totalReward, INVITE_DAILY_CAP - todayReward);
  if (amount <= 0) return false;

  const { credited: creditedAmount, offset } = applyPendingPenalty(amount, inviter.coinPenaltyPending);

  await db.collection('users').doc(inviterId).update({
    data: { coinBalance: _.inc(creditedAmount), coinPenaltyPending: _.inc(-offset) },
  });
  await db.collection('coin_transactions').doc(uid()).set({
    data: {
      userId: inviterId,
      amount,
      balanceDelta: amount,
      type: 'invite_reward',
      refId: invitedUserId,
      description: '邀请新书友奖励',
      createdAt: nowIso(),
    },
  });
  if (offset) {
    await db.collection('coin_transactions').doc(`${invitedUserId}-invite-penalty-offset-${inviterId}`).set({
      data: {
        userId: inviterId,
        amount: -offset,
        balanceDelta: -offset,
        frozenDelta: 0,
        type: 'penalty_offset',
        refId: invitedUserId,
        description: '历史违规待抵扣',
        createdAt: nowIso(),
      },
    });
  }
  return true;
}

async function settleInviteReward(user, actionType = 'meaningful_action') {
  if (!user || !user._id || !user.invitedBy || user.inviteRewardedAt) return false;
  try {
    const rewarded = await rewardInviter(user.invitedBy, user._id);
    await db.collection('users').doc(user._id).update({
      data: {
        inviteRewardedAt: nowIso(),
        inviteRewardAction: actionType,
      },
    });
    return rewarded;
  } catch (e) {
    console.warn('[invite] reward skipped', e.message || e);
    return false;
  }
}

async function getOrCreateUser(openid, inviterId = '') {
  let user = await getUserByOpenid(openid);
  if (user) return user;

  const id = uid();
  const doc = {
    openid,
    nickname: '书友',
    avatar: '',
    shelfName: '我的书架',
    shelfLimit: DEFAULT_SHELF_LIMIT,
    childAgeRange: '',
    creditScore: 100,
    coinBalance: SIGNUP_BONUS,
    coinFrozen: 0,
    firstGiveRewarded: false,
    publishRewardCount: 0,
    invalidDisputeCount: 0,
    verifiedViolationCount: 0,
    coinPenaltyPending: 0,
    activeClaimCount: 0,
    invitedBy: inviterId || '',
    createdAt: nowIso(),
  };
  await db.collection('users').doc(id).set({ data: doc });
  if (SIGNUP_BONUS > 0) {
    await db.collection('coin_transactions').doc(uid()).set({
      data: {
        userId: id,
        amount: SIGNUP_BONUS,
        type: 'signup',
        refId: '',
        description: '新用户注册赠送',
        createdAt: nowIso(),
      },
    });
  }
  return { _id: id, ...doc };
}

function formatUser(user) {
  return {
    id: user._id,
    nickname: user.nickname,
    avatar: user.avatar,
    shelfName: user.shelfName || '我的书架',
    shelfLimit: Math.max(Number(user.shelfLimit) || DEFAULT_SHELF_LIMIT, DEFAULT_SHELF_LIMIT),
    childAgeRange: user.childAgeRange || '',
    creditScore: user.creditScore,
    coinBalance: user.coinBalance,
    coinFrozen: Number(user.coinFrozen) || 0,
    availableCoin: Math.max((Number(user.coinBalance) || 0) - (Number(user.coinFrozen) || 0), 0),
    isAdmin: String(process.env.ADMIN_OPENIDS || '').split(',').map((item) => item.trim()).filter(Boolean).includes(user.openid),
    createdAt: user.createdAt,
  };
}

async function getBookById(bookId) {
  try {
    const { data } = await db.collection('books').doc(bookId).get();
    return data || null;
  } catch (e) {
    return null;
  }
}

async function getBooksByIds(ids) {
  if (!ids.length) return {};
  const { data } = await db.collection('books').where({ _id: _.in(ids) }).get();
  const map = {};
  data.forEach((b) => { map[b._id] = b; });
  return map;
}

async function getUsersByIds(ids) {
  if (!ids.length) return {};
  const { data } = await db.collection('users').where({ _id: _.in(ids) }).get();
  const map = {};
  data.forEach((u) => { map[u._id] = u; });
  return map;
}

function formatBook(b) {
  const title = cleanBookTitle(b.title) || b.title;
  return {
    id: b._id,
    isbn: b.isbn,
    isbn10: b.isbn10 || '',
    title,
    rawTitle: b.rawTitle || (title !== b.title ? b.title : ''),
    author: b.author,
    publisher: b.publisher || '',
    pubDate: b.pubDate || '',
    listPrice: b.listPrice || '',
    listPriceSource: b.listPriceSource || (b.listPrice ? 'book' : ''),
    cover: b.cover,
    coverRemote: b.coverRemote || '',
    coverSource: b.coverSource || '',
    summary: b.summary,
    category: normalizeBookCategory(b.category, b),
    ageRange: b.ageRange,
    source: b.source || 'cache',
    sourceId: b.sourceId || '',
    versionLabel: versionLabel({ ...b, title }),
    lookupStatus: b.lookupStatus || 'found',
  };
}

module.exports = {
  DEFAULT_SHELF_LIMIT,
  db,
  _,
  isCollectionMissing,
  safeQuery,
  getUserByOpenid,
  requireUser,
  getOrCreateUser,
  formatUser,
  getBookById,
  getBooksByIds,
  getUsersByIds,
  formatBook,
  settleInviteReward,
};
