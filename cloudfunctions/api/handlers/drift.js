const { ok, fail, uid, nowIso } = require('../lib/utils');
const {
  db, _, requireUser, getBookById, getBooksByIds, getUsersByIds, formatBook, settleInviteReward, DEFAULT_SHELF_LIMIT,
} = require('../lib/db');
const { runAutoCheck, CONDITION_LABELS, CONDITION_ISSUE_LABELS } = require('../lib/pricing');
const { assertSafeTextFields, assertSafeMediaFiles } = require('../lib/contentSecurity');
const {
  policyForStage, calculateCoinValue, availableCoin, addHours, addDays,
  cancelCreditChange,
  applyPendingPenalty,
  splitViolationPenalty,
} = require('../lib/driftPolicy');
const { writeCoinEvent, writeCreditEvent, writeOrderEvent } = require('../lib/driftAccounting');
const { ensureAccountingV2 } = require('../lib/driftMigration');
const { ensureCollection } = require('../lib/collections');
const {
  attachOrderToBundle,
  removeOrderFromBundle,
  loadBundleByRef,
  shipBundlePendingOrders,
  earliestShipDeadline,
  normalizeAddressSnapshot,
  BUNDLE_MAX_ORDERS,
} = require('../lib/shipmentBundle');

const REPORT_HIDE_THRESHOLD = 3;
const ACTIVE_ORDER_STATUSES = ['PENDING_SHIP', 'SHIPPED', 'DISPUTED'];
const ACTIVE_DRIFT_DUPLICATE_STATUSES = ['PENDING_REVIEW', 'IN_POOL', 'CLAIMED'];
const OPEN_DRIFT_CANCEL_STATUSES = ['PENDING_REVIEW', 'IN_POOL'];

function policy() {
  return policyForStage(process.env.DRIFT_STAGE || 'cold');
}

function isAdminOpenid(openid) {
  return String(process.env.ADMIN_OPENIDS || '').split(',').map((item) => item.trim()).filter(Boolean).includes(openid);
}

function normalizeOrderRecord(order, orderId) {
  if (!order) return null;
  return { ...order, _id: order._id || orderId };
}

async function resolveOrderCoinValue(transaction, order) {
  let coinValue = Number(order.coinValue);
  if (Number.isFinite(coinValue) && coinValue >= 0) return coinValue;
  if (!order.driftId) return 0;
  const driftSnap = await transaction.collection('drifts').doc(order.driftId).get();
  coinValue = Number(driftSnap.data && driftSnap.data.coinValue);
  return Number.isFinite(coinValue) && coinValue >= 0 ? coinValue : 0;
}

function buildRevokePublishRewardEffects(drift, driftId, now, reason = '取消漂流退回上漂奖励') {
  const effects = { userPatch: {}, driftPatch: null, coinEvents: [], resolvedDriftId: '' };
  if (!drift || drift.publishRewardGranted !== true || drift.publishRewardRevoked === true) return effects;
  const resolvedDriftId = driftId || drift._id || drift.id || '';
  if (!resolvedDriftId) return effects;
  const credited = Math.max(Number(
    drift.publishRewardCredited === undefined ? drift.publishRewardAmount : drift.publishRewardCredited,
  ) || 0, 0);
  const offset = Math.max(Number(drift.publishRewardOffset) || 0, 0);
  if (!credited && !offset) return effects;
  if (credited) effects.userPatch.coinBalance = _.inc(-credited);
  if (offset) effects.userPatch.coinPenaltyPending = _.inc(offset);
  effects.driftPatch = { publishRewardRevoked: true, publishRewardRevokedAt: now };
  effects.resolvedDriftId = resolvedDriftId;
  if (credited) {
    effects.coinEvents.push({
      userId: drift.userId,
      refId: resolvedDriftId,
      type: 'publish_reward_revoke',
      balanceDelta: -credited,
      frozenDelta: 0,
      description: reason,
    });
  }
  if (offset) {
    effects.coinEvents.push({
      userId: drift.userId,
      refId: resolvedDriftId,
      type: 'penalty_offset_restore',
      balanceDelta: 0,
      frozenDelta: 0,
      description: '取消漂流恢复历史待抵扣',
    });
  }
  return effects;
}

async function applyRevokePublishReward(transaction, drift, driftId, now, reason = '取消漂流退回上漂奖励') {
  const effects = buildRevokePublishRewardEffects(drift, driftId, now, reason);
  if (!effects.driftPatch) return effects.userPatch;
  await transaction.collection('drifts').doc(effects.resolvedDriftId).update({ data: effects.driftPatch });
  for (const event of effects.coinEvents) {
    await writeCoinEvent(transaction, { ...event, createdAt: now });
  }
  return effects.userPatch;
}

function parseListPrice(value) {
  const match = String(value || '').replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

function normalizeImageMap(data) {
  const sourceMap = data.imageMap || {};
  const legacyImages = Array.isArray(data.images) ? data.images.slice(0, 3) : [];
  const imageMap = {
    cover: sourceMap.cover || legacyImages[0] || '',
    inside: sourceMap.inside || legacyImages[1] || '',
    copyright: sourceMap.copyright || legacyImages[2] || '',
  };
  return { imageMap, images: [imageMap.cover, imageMap.inside, imageMap.copyright].filter(Boolean) };
}

function normalizeConditionIssues(value) {
  return [...new Set((Array.isArray(value) ? value : []).filter((key) => CONDITION_ISSUE_LABELS[key]))];
}

function hasAddressSnapshot(address = {}) {
  return !!(address.name || address.phone || address.region || address.detail);
}

async function resolveOrderAddressSnapshot(order) {
  const snapshot = normalizeAddressSnapshot(order.addressSnapshot || {});
  if (hasAddressSnapshot(snapshot) || !order.addressId) return hasAddressSnapshot(snapshot) ? snapshot : null;
  try {
    const { data: address } = await db.collection('addresses').doc(order.addressId).get();
    if (!address || address.userId !== order.receiverId) return null;
    const recovered = normalizeAddressSnapshot(address);
    return hasAddressSnapshot(recovered) ? recovered : null;
  } catch (err) {
    return null;
  }
}

function conditionIssueLabels(keys = []) {
  return keys.map((key) => CONDITION_ISSUE_LABELS[key]).filter(Boolean);
}

async function isDriftHiddenByReports(driftId) {
  const { total } = await db.collection('reports').where({
    targetType: 'drift', targetId: driftId, status: _.neq('RESOLVED'),
  }).count();
  return total >= REPORT_HIDE_THRESHOLD;
}

function formatOrder(row, drift, book, giver, receiver) {
  const issues = drift.conditionIssues || [];
  const labels = drift.conditionIssueLabels || conditionIssueLabels(issues);
  const anonymous = !!drift.isAnonymous;
  return {
    id: row._id,
    driftId: row.driftId,
    giverId: row.giverId,
    receiverId: row.receiverId,
    expressCompany: row.expressCompany || '',
    trackingNo: row.trackingNo || '',
    status: row.status,
    createdAt: row.createdAt,
    claimedAt: row.claimedAt || row.createdAt,
    shipDeadlineAt: row.shipDeadlineAt || '',
    shippedAt: row.shippedAt || '',
    autoCompleteAt: row.autoCompleteAt || '',
    confirmedAt: row.confirmedAt || '',
    bundleId: row.bundleId || '',
    bundleSeq: Number(row.bundleSeq) || 0,
    coinValue: Number(row.coinValue === undefined ? drift.coinValue : row.coinValue) || 0,
    condition: drift.condition,
    conditionLabel: CONDITION_LABELS[drift.condition] || drift.condition,
    conditionIssues: issues,
    conditionIssueLabels: labels,
    conditionIssueText: labels.join('、'),
    isAnonymous: anonymous,
    images: drift.images || [],
    imageMap: drift.imageMap || {},
    book: book ? { id: book._id, title: book.title, author: book.author, cover: book.cover, isbn: book.isbn } : {},
    giverNickname: anonymous ? '匿名书友' : (giver ? giver.nickname : ''),
    receiverNickname: receiver ? receiver.nickname : '',
  };
}

function formatDriftOnlyRecord(drift, book, giver) {
  return formatOrder({
    _id: `drift-${drift._id}`, driftId: drift._id, giverId: drift.userId, receiverId: '',
    status: drift.status, createdAt: drift.createdAt,
  }, drift, book, giver, null);
}

async function findShelfRecord(userId, data) {
  if (data.shelfBookId) {
    const { data: row } = await db.collection('shelf_books').doc(data.shelfBookId).get();
    return row && row.userId === userId ? row : null;
  }
  if (!data.bookId) return null;
  const { data: rows } = await db.collection('shelf_books').where({ userId, bookId: data.bookId }).limit(1).get();
  return rows[0] || null;
}

async function grantPublishReward(userId, driftId) {
  const config = policy();
  if (!config.publishReward || !config.publishRewardCap) return;
  await db.runTransaction(async (transaction) => {
    const driftSnap = await transaction.collection('drifts').doc(driftId).get();
    const userSnap = await transaction.collection('users').doc(userId).get();
    const drift = driftSnap.data;
    const user = userSnap.data;
    if (!drift || drift.publishRewardGranted === true) return;
    const awarded = Number(user.publishRewardCount) || 0;
    const amount = Math.min(config.publishReward, Math.max(config.publishRewardCap - awarded, 0));
    if (!amount) return;
    const { credited, offset } = applyPendingPenalty(amount, user.coinPenaltyPending);
    await transaction.collection('drifts').doc(driftId).update({
      data: {
        publishRewardGranted: true,
        publishRewardAmount: amount,
        publishRewardCredited: credited,
        publishRewardOffset: offset,
        publishRewardRevoked: false,
      },
    });
    await transaction.collection('users').doc(userId).update({
      data: { coinBalance: _.inc(credited), coinPenaltyPending: _.inc(-offset), publishRewardCount: _.inc(amount) },
    });
    await writeCoinEvent(transaction, {
      userId, refId: driftId, type: 'publish_reward', balanceDelta: amount, frozenDelta: 0,
      description: '上漂审核通过奖励', createdAt: nowIso(),
    });
    if (offset) await writeCoinEvent(transaction, {
      userId, refId: driftId, type: 'penalty_offset', balanceDelta: -offset, frozenDelta: 0,
      description: '历史违规待抵扣', createdAt: nowIso(),
    });
  });
}

async function revokePublishReward(transaction, drift, now, reason = '取消漂流退回上漂奖励', driftId = '') {
  const userPatch = await applyRevokePublishReward(transaction, drift, driftId || drift._id || drift.id || '', now, reason);
  if (Object.keys(userPatch).length) {
    await transaction.collection('users').doc(drift.userId).update({ data: userPatch });
  }
}

async function publish(openid, data) {
  const user = await requireUser(openid);
  if (!user) return fail(401, '未登录');
  const shelfRow = await findShelfRecord(user._id, data);
  if (!shelfRow) return fail(400, '请选择本人书架中的具体图书');
  const book = await getBookById(shelfRow.bookId);
  if (!book) return fail(404, '图书不存在');
  const listPrice = parseListPrice(book.listPrice);
  if (!listPrice) return fail(400, '图书定价缺失，暂不能发起漂流');

  const dayAgo = new Date(Date.now() - 86400000).toISOString();
  const [{ total: recentCount }, { total: activeDuplicateCount }] = await Promise.all([
    db.collection('drifts').where({ userId: user._id, createdAt: _.gte(dayAgo) }).count(),
    db.collection('drifts').where({ userId: user._id, shelfBookId: shelfRow._id, status: _.in(ACTIVE_DRIFT_DUPLICATE_STATUSES) }).count(),
  ]);
  const condition = data.condition || 'like_new';
  const imageResult = normalizeImageMap(data);
  const issues = normalizeConditionIssues(data.conditionIssues);
  const driftId = uid();
  const driftDoc = {
    userId: user._id,
    bookId: shelfRow.bookId,
    shelfBookId: shelfRow._id,
    condition,
    conditionIssues: issues,
    conditionIssueLabels: conditionIssueLabels(issues),
    images: imageResult.images,
    imageMap: imageResult.imageMap,
    remark: '',
    isAnonymous: data.isAnonymous !== false,
    listPrice,
    coinValue: calculateCoinValue(listPrice, condition),
    publishRewardGranted: false,
    status: 'PENDING_REVIEW',
    rejectReason: [],
    createdAt: nowIso(),
  };
  const checkResult = runAutoCheck(driftDoc, book, user, recentCount + 1, activeDuplicateCount);
  if (activeDuplicateCount > 0) {
    const duplicateReason = checkResult.reasons.find((reason) => reason.code === 'DUPLICATE');
    return fail(409, duplicateReason ? duplicateReason.message : '该书已在漂流中，不可重复上漂');
  }
  const status = checkResult.passed ? 'IN_POOL' : 'REJECTED';
  driftDoc.status = status;
  driftDoc.rejectReason = checkResult.passed ? [] : checkResult.reasons;
  await db.collection('drifts').doc(driftId).set({ data: driftDoc });
  await settleInviteReward(user, 'drift_publish');
  if (checkResult.passed) await grantPublishReward(user._id, driftId);
  return ok({
    driftId, status, coinValue: driftDoc.coinValue, passed: checkResult.passed,
    reasons: checkResult.reasons, checks: checkResult.checks || [], book: formatBook(book),
  });
}

async function check(openid, data) {
  const user = await requireUser(openid);
  if (!user) return fail(401, '未登录');
  const { data: drift } = await db.collection('drifts').doc(data.driftId).get();
  if (!drift || drift.userId !== user._id) return fail(404, '漂流记录不存在');
  const book = await getBookById(drift.bookId);
  return ok({ driftId: drift._id, status: drift.status, passed: drift.status === 'IN_POOL', coinValue: drift.coinValue, reasons: drift.rejectReason || [], book });
}

async function appeal(openid, data) {
  const user = await requireUser(openid);
  if (!user) return fail(401, '未登录');
  const { data: drift } = await db.collection('drifts').doc(data.driftId).get();
  if (!drift || drift.userId !== user._id) return fail(404, '漂流记录不存在');
  await assertSafeTextFields(openid, { reason: data.reason }, { strict: true });
  return ok({ message: '申诉已提交，将在 24 小时内处理' });
}

async function claim(openid, data) {
  const user = await requireUser(openid);
  if (!user) return fail(401, '未登录');
  if (!data.addressId) return fail(400, '请选择收货地址');
  if (await isDriftHiddenByReports(data.driftId)) return fail(404, '该书已被接漂或不存在');
  const orderId = uid();
  const now = nowIso();
  let driftForInvite = null;
  let bundleResult = { merged: false, bundleOrderCount: 1 };

  await ensureCollection(db, 'shipment_bundles');

  await db.runTransaction(async (transaction) => {
    const [userSnap, driftSnap, addressSnap] = await Promise.all([
      transaction.collection('users').doc(user._id).get(),
      transaction.collection('drifts').doc(data.driftId).get(),
      transaction.collection('addresses').doc(data.addressId).get(),
    ]);
    const freshUser = userSnap.data;
    const drift = driftSnap.data;
    const address = addressSnap.data;
    if (!drift || drift.status !== 'IN_POOL') throw new Error('ALREADY_CLAIMED');
    if (drift.userId === user._id) throw new Error('SELF_CLAIM');
    if (!address || address.userId !== user._id) throw new Error('ADDRESS_NOT_FOUND');
    if (availableCoin(freshUser) < Number(drift.coinValue)) throw new Error('INSUFFICIENT_COINS');
    if ((Number(freshUser.activeClaimCount) || 0) >= policy().inflightLimit) throw new Error('INFLIGHT_LIMIT');
    driftForInvite = drift;

    await transaction.collection('users').doc(user._id).update({
      data: { coinFrozen: _.inc(drift.coinValue), activeClaimCount: _.inc(1) },
    });
    await transaction.collection('drifts').doc(data.driftId).update({ data: { status: 'CLAIMED', activeOrderId: orderId } });
    await transaction.collection('drift_orders').doc(orderId).set({
      data: {
        driftId: data.driftId,
        giverId: drift.userId,
        receiverId: user._id,
        shelfBookId: drift.shelfBookId,
        addressId: data.addressId,
        addressSnapshot: normalizeAddressSnapshot(address),
        coinValue: Number(drift.coinValue) || 0,
        status: 'PENDING_SHIP',
        claimedAt: now,
        createdAt: now,
        shipDeadlineAt: addHours(now, 72),
        expressCompany: '',
        trackingNo: '',
        accountingVersion: 2,
        activeCounted: true,
      },
    });
    await writeCoinEvent(transaction, {
      userId: user._id, refId: orderId, type: 'claim_freeze', balanceDelta: 0,
      frozenDelta: Number(drift.coinValue) || 0, description: '接漂占用公益积分', createdAt: now,
    });
    await writeOrderEvent(transaction, { orderId, type: 'CLAIMED', actorId: user._id, createdAt: now });
    bundleResult = await attachOrderToBundle(transaction, {
      _id: orderId,
      giverId: drift.userId,
      receiverId: user._id,
      addressSnapshot: normalizeAddressSnapshot(address),
      status: 'PENDING_SHIP',
    }, _);
  });

  if (driftForInvite) await settleInviteReward(user, 'drift_claim');
  return ok({
    orderId,
    status: 'PENDING_SHIP',
    coinOccupied: Number(driftForInvite.coinValue) || 0,
    merged: bundleResult.merged,
    bundleOrderCount: bundleResult.bundleOrderCount,
    bundleId: bundleResult.bundleId,
  });
}

async function loadOrderRelations(rows) {
  const driftIds = [...new Set(rows.map((row) => row.driftId))];
  const { data: drifts } = driftIds.length ? await db.collection('drifts').where({ _id: _.in(driftIds) }).get() : { data: [] };
  const driftMap = Object.fromEntries(drifts.map((item) => [item._id, item]));
  const books = await getBooksByIds(drifts.map((item) => item.bookId));
  const userIds = [...new Set(rows.flatMap((row) => [row.giverId, row.receiverId]).filter(Boolean))];
  const users = await getUsersByIds(userIds);
  return { driftMap, books, users };
}

async function orders(openid, data) {
  const user = await requireUser(openid);
  if (!user) return fail(401, '未登录');
  if ((data.role || 'given') === 'given') return givenOrders(user, data);
  const cond = { receiverId: user._id };
  if (data.status) cond.status = data.status;
  const { data: rows } = await db.collection('drift_orders').where(cond).orderBy('createdAt', 'desc').limit(50).get();
  const { driftMap, books, users } = await loadOrderRelations(rows);
  return ok({ list: rows.filter((row) => driftMap[row.driftId]).map((row) => formatOrder(row, driftMap[row.driftId], books[driftMap[row.driftId].bookId], users[row.giverId], users[row.receiverId])) });
}

async function givenOrders(user, data) {
  const orderCond = { giverId: user._id };
  if (data.status) orderCond.status = data.status;
  const [{ data: rows }, { data: userDrifts }] = await Promise.all([
    db.collection('drift_orders').where(orderCond).orderBy('createdAt', 'desc').limit(50).get(),
    db.collection('drifts').where({ userId: user._id }).orderBy('createdAt', 'desc').limit(100).get(),
  ]);
  const { driftMap, books, users } = await loadOrderRelations(rows);
  userDrifts.forEach((item) => { driftMap[item._id] = item; });
  const orderedIds = new Set(rows.map((row) => row.driftId));
  const orderList = rows.filter((row) => driftMap[row.driftId]).map((row) => formatOrder(row, driftMap[row.driftId], books[driftMap[row.driftId].bookId] || {}, users[row.giverId] || user, users[row.receiverId]));
  const missing = userDrifts.filter((item) => !orderedIds.has(item._id));
  const missingBooks = await getBooksByIds(missing.map((item) => item.bookId));
  const list = orderList.concat(missing.map((item) => formatDriftOnlyRecord(item, missingBooks[item.bookId], user)))
    .filter((item) => !data.status || item.status === data.status)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 50);
  return ok({ list });
}

async function orderDetail(openid, data) {
  const user = await requireUser(openid);
  if (!user) return fail(401, '未登录');
  if (!data.orderId) return fail(400, '缺少漂流记录');
  const { data: order } = await db.collection('drift_orders').doc(data.orderId).get();
  if (!order || (![order.giverId, order.receiverId].includes(user._id) && !isAdminOpenid(openid))) return fail(404, '漂流记录不存在');
  const { data: drift } = await db.collection('drifts').doc(order.driftId).get();
  if (!drift) return fail(404, '漂流内容不存在');
  const book = await getBookById(drift.bookId);
  const users = await getUsersByIds([order.giverId, order.receiverId]);
  const role = user._id === order.giverId ? 'giver' : (user._id === order.receiverId ? 'receiver' : 'admin');
  const { data: reviews } = await db.collection('reviews').where({ orderId: order._id, fromUser: user._id }).limit(1).get();
  const safeAddress = ['PENDING_SHIP', 'SHIPPED', 'DISPUTED'].includes(order.status) ? await resolveOrderAddressSnapshot(order) : null;
  const canDispute = ['giver', 'receiver'].includes(role) && order.status === 'SHIPPED' && !user.disputeRestricted;
  let bundle = null;
  if (order.bundleId) {
    try {
      const { data: bundleRow } = await db.collection('shipment_bundles').doc(order.bundleId).get();
      if (bundleRow) {
        const siblingIds = (bundleRow.orderIds || []).filter((id) => id !== order._id);
        const { data: siblings } = siblingIds.length
          ? await db.collection('drift_orders').where({ _id: _.in(siblingIds) }).get()
          : { data: [] };
        const { driftMap, books } = await loadOrderRelations(siblings);
        bundle = {
          id: bundleRow._id,
          orderCount: (bundleRow.orderIds || []).length,
          siblings: siblings
            .filter((row) => driftMap[row.driftId])
            .sort((a, b) => (a.bundleSeq || 0) - (b.bundleSeq || 0))
            .map((row) => ({
              id: row._id,
              status: row.status,
              bundleSeq: row.bundleSeq || 0,
              book: books[driftMap[row.driftId].bookId]
                ? {
                  title: books[driftMap[row.driftId].bookId].title,
                  cover: books[driftMap[row.driftId].bookId].cover,
                }
                : {},
            })),
        };
      }
    } catch (err) {
      bundle = null;
    }
  }
  return ok({
    order: { ...formatOrder(order, drift, book, users[order.giverId], users[order.receiverId]), addressSnapshot: safeAddress },
    bundle,
    role,
    actions: {
      canShip: role === 'giver' && order.status === 'PENDING_SHIP',
      canCancel: ['giver', 'receiver'].includes(role) && order.status === 'PENDING_SHIP',
      canConfirm: role === 'receiver' && order.status === 'SHIPPED',
      canDispute,
      disputeRestricted: ['giver', 'receiver'].includes(role) && order.status === 'SHIPPED' && !!user.disputeRestricted,
      canReview: ['giver', 'receiver'].includes(role) && order.status === 'DONE' && !reviews.length,
      canAddToShelf: role === 'receiver' && order.status === 'DONE',
    },
  });
}

async function bundleDetail(openid, data) {
  const user = await requireUser(openid);
  if (!user) return fail(401, '未登录');
  const bundleId = String(data.bundleId || '').trim();
  const orderId = String(data.orderId || '').trim();
  if (!bundleId && !orderId) return fail(400, '缺少 bundleId 或 orderId');

  let bundle;
  if (bundleId) {
    const { data: row } = await db.collection('shipment_bundles').doc(bundleId).get();
    bundle = row;
  } else {
    const { data: order } = await db.collection('drift_orders').doc(orderId).get();
    if (!order || !order.bundleId) return fail(404, '包裹组不存在');
    const { data: row } = await db.collection('shipment_bundles').doc(order.bundleId).get();
    bundle = row;
  }
  if (!bundle) return fail(404, '包裹组不存在');
  if (![bundle.giverId, bundle.receiverId].includes(user._id) && !isAdminOpenid(openid)) {
    return fail(403, '无权查看');
  }

  const orderIds = bundle.orderIds || [];
  const { data: orderRows } = orderIds.length
    ? await db.collection('drift_orders').where({ _id: _.in(orderIds) }).get()
    : { data: [] };
  const { driftMap, books, users } = await loadOrderRelations(orderRows);
  const list = orderRows
    .filter((row) => driftMap[row.driftId])
    .sort((a, b) => (a.bundleSeq || 0) - (b.bundleSeq || 0))
    .map((row) => formatOrder(
      row,
      driftMap[row.driftId],
      books[driftMap[row.driftId].bookId] || {},
      users[row.giverId] || {},
      users[row.receiverId] || {},
    ));
  const role = user._id === bundle.giverId ? 'giver' : 'receiver';
  const pendingOrders = orderRows.filter((row) => row.status === 'PENDING_SHIP');
  const safeAddress = role === 'giver' && pendingOrders.length
    ? (hasAddressSnapshot(bundle.addressSnapshot)
      ? normalizeAddressSnapshot(bundle.addressSnapshot)
      : await resolveOrderAddressSnapshot(pendingOrders[0]))
    : null;

  return ok({
    bundle: {
      id: bundle._id,
      status: bundle.status,
      orderCount: list.length,
      shipDeadlineAt: earliestShipDeadline(orderRows),
      trackingNo: bundle.trackingNo || '',
      expressCompany: bundle.expressCompany || '',
      addressSnapshot: safeAddress,
    },
    orders: list,
    role,
    actions: {
      canShip: role === 'giver' && bundle.status === 'OPEN' && pendingOrders.length > 0,
    },
  });
}

async function ship(openid, data) {
  const user = await requireUser(openid);
  if (!user) return fail(401, '未登录');
  const expressCompany = String(data.expressCompany || '').trim();
  const { validateTrackingNo } = require('../lib/trackingNo');
  const trackingCheck = validateTrackingNo(data.trackingNo, expressCompany);
  if (!expressCompany || !trackingCheck.ok) return fail(400, trackingCheck.message || '请填写有效的承运商和运单号');
  const trackingNo = trackingCheck.normalized;
  const now = nowIso();
  const bundleId = String(data.bundleId || '').trim();
  const orderId = String(data.orderId || '').trim();
  if (!bundleId && !orderId) return fail(400, '缺少 bundleId 或 orderId');

  if (bundleId) {
    let shippedIds = [];
    await db.runTransaction(async (transaction) => {
      const bundle = await loadBundleByRef(transaction, { bundleId });
      shippedIds = await shipBundlePendingOrders(transaction, {
        bundle: bundle ? { ...bundle, _id: bundleId } : null,
        giverId: user._id,
        expressCompany,
        trackingNo,
        now,
        _,
        writeOrderEvent,
      });
    });
    return ok({ bundleId, orderIds: shippedIds, status: 'SHIPPED' });
  }

  await db.runTransaction(async (transaction) => {
    const orderSnap = await transaction.collection('drift_orders').doc(orderId).get();
    let order = normalizeOrderRecord(orderSnap.data, orderId);
    if (!order || order.giverId !== user._id) throw new Error('ORDER_NOT_FOUND');
    const migrated = await ensureAccountingV2(transaction, order, _, orderId);
    order = migrated.order;
    if (order.status !== 'PENDING_SHIP') throw new Error('INVALID_STATUS');
    if (order.shipDeadlineAt && order.shipDeadlineAt <= now) throw new Error('SHIP_DEADLINE_EXPIRED');
    await transaction.collection('drift_orders').doc(order._id).update({
      data: { expressCompany, trackingNo, status: 'SHIPPED', shippedAt: now, autoCompleteAt: addDays(now, 10) },
    });
    await writeOrderEvent(transaction, { orderId: order._id, type: 'SHIPPED', actorId: user._id, createdAt: now });
  });
  return ok({ orderId, status: 'SHIPPED' });
}

function driftPatchAfterOrderCancel(role, now, reason = '') {
  const base = { activeOrderId: '' };
  if (role === 'RECEIVER') return { ...base, status: 'IN_POOL' };
  return {
    ...base,
    status: 'CANCELLED',
    cancelReason: reason,
    cancelledAt: now,
  };
}

async function cancelOrderById(orderId, actor, reason = '') {
  const now = nowIso();
  await db.runTransaction(async (transaction) => {
    const orderSnap = await transaction.collection('drift_orders').doc(orderId).get();
    let order = normalizeOrderRecord(orderSnap.data, orderId);
    if (!order) throw new Error('ORDER_NOT_FOUND');
    if (order.status === 'CANCELLED') return;
    const migrated = await ensureAccountingV2(transaction, order, _, orderId);
    order = migrated.order;
    if (order.status !== 'PENDING_SHIP') throw new Error('INVALID_STATUS');
    const coinValue = await resolveOrderCoinValue(transaction, order);
    order = { ...order, coinValue };
    const role = actor.system ? 'SYSTEM' : (actor.userId === order.receiverId ? 'RECEIVER' : (actor.userId === order.giverId ? 'GIVER' : ''));
    const creditChange = cancelCreditChange(role);
    if (!creditChange) throw new Error('FORBIDDEN');
    const driftSnap = role === 'GIVER' || role === 'SYSTEM'
      ? await transaction.collection('drifts').doc(order.driftId).get()
      : { data: null };

    const receiverPatch = { coinFrozen: _.inc(-coinValue) };
    if (order.activeCounted === true) receiverPatch.activeClaimCount = _.inc(-1);
    if (creditChange.target === 'receiver') receiverPatch.creditScore = _.inc(creditChange.delta);
    await transaction.collection('users').doc(order.receiverId).update({ data: receiverPatch });

    if (creditChange.target === 'giver') {
      const giverPatch = { creditScore: _.inc(creditChange.delta) };
      if (driftSnap.data) {
        const revokePatch = await applyRevokePublishReward(
          transaction,
          driftSnap.data,
          order.driftId,
          now,
          role === 'SYSTEM' ? '超时取消退回上漂奖励' : '取消漂流退回上漂奖励',
        );
        Object.assign(giverPatch, revokePatch);
      }
      await transaction.collection('users').doc(order.giverId).update({ data: giverPatch });
    }

    await transaction.collection('drift_orders').doc(order._id).update({
      data: { status: 'CANCELLED', activeCounted: false, cancelledBy: role, cancelReason: reason, cancelledAt: now },
    });
    await transaction.collection('drifts').doc(order.driftId).update({
      data: driftPatchAfterOrderCancel(role, now, reason),
    });
    await writeCoinEvent(transaction, {
      userId: order.receiverId, refId: order._id, type: 'claim_unfreeze', balanceDelta: 0,
      frozenDelta: -coinValue, description: '取消接漂释放占用积分', createdAt: now,
    });
    const creditUserId = creditChange.target === 'receiver' ? order.receiverId : order.giverId;
    await writeCreditEvent(transaction, {
      userId: creditUserId, refId: order._id, reasonCode: role === 'SYSTEM' ? 'SHIP_TIMEOUT' : `${role}_CANCEL`,
      delta: creditChange.delta, reason: role === 'SYSTEM' ? '72 小时未寄出' : '发货前取消漂流', createdAt: now,
    });
    await writeOrderEvent(transaction, { orderId: order._id, type: `CANCELLED_${role}`, actorId: actor.userId || '', createdAt: now });
    await removeOrderFromBundle(transaction, order, _);
  });
}

async function cancel(openid, data) {
  const user = await requireUser(openid);
  if (!user) return fail(401, '未登录');
  if (!data.orderId) return fail(400, '缺少漂流记录');
  await cancelOrderById(data.orderId, { userId: user._id }, String(data.reason || '').trim());
  return ok({ orderId: data.orderId, status: 'CANCELLED' });
}

async function cancelOpen(openid, data) {
  const user = await requireUser(openid);
  if (!user) return fail(401, '未登录');
  const driftId = data.driftId || data.id || '';
  if (!driftId) return fail(400, '缺少漂流记录');
  const now = nowIso();
  await db.runTransaction(async (transaction) => {
    const driftSnap = await transaction.collection('drifts').doc(driftId).get();
    const drift = driftSnap.data;
    if (!drift || drift.userId !== user._id) throw new Error('ORDER_NOT_FOUND');
    if (!OPEN_DRIFT_CANCEL_STATUSES.includes(drift.status)) throw new Error('INVALID_STATUS');
    await transaction.collection('drifts').doc(driftId).update({
      data: {
        status: 'CANCELLED',
        cancelReason: String(data.reason || '').trim(),
        cancelledAt: now,
      },
    });
    await revokePublishReward(transaction, drift, now, '取消漂流退回上漂奖励', driftId);
  });
  return ok({ driftId, status: 'CANCELLED' });
}

async function settleOrder(orderId, completionType, actorUserId = '') {
  const now = nowIso();
  await db.runTransaction(async (transaction) => {
    const orderSnap = await transaction.collection('drift_orders').doc(orderId).get();
    let order = normalizeOrderRecord(orderSnap.data, orderId);
    if (!order) throw new Error('ORDER_NOT_FOUND');
    if (completionType === 'USER' && actorUserId !== order.receiverId) throw new Error('FORBIDDEN');
    if (order.status === 'DONE') return;
    const migrated = await ensureAccountingV2(transaction, order, _, orderId);
    order = migrated.order;
    if (completionType === 'ADMIN') {
      if (order.status !== 'DISPUTED') throw new Error('INVALID_STATUS');
    } else if (order.status !== 'SHIPPED') {
      throw new Error('INVALID_STATUS');
    }
    const driftSnap = await transaction.collection('drifts').doc(order.driftId).get();
    const giverSnap = await transaction.collection('users').doc(order.giverId).get();
    const drift = driftSnap.data;
    const giver = giverSnap.data;
    const receiverPatch = { coinFrozen: _.inc(-Number(order.coinValue)), coinBalance: _.inc(-Number(order.coinValue)), creditScore: _.inc(2) };
    if (order.activeCounted === true) receiverPatch.activeClaimCount = _.inc(-1);
    await transaction.collection('users').doc(order.receiverId).update({ data: receiverPatch });
    const firstBonus = giver.firstGiveRewarded ? 0 : policy().firstGiveBonus;
    const grossReward = Number(order.coinValue) + firstBonus;
    const { credited, offset } = applyPendingPenalty(grossReward, giver.coinPenaltyPending);
    await transaction.collection('users').doc(order.giverId).update({
      data: { coinBalance: _.inc(credited), coinPenaltyPending: _.inc(-offset), creditScore: _.inc(2), firstGiveRewarded: true },
    });
    await transaction.collection('drift_orders').doc(order._id).update({ data: { status: 'DONE', activeCounted: false, completionType, confirmedAt: now } });
    await transaction.collection('drifts').doc(order.driftId).update({ data: { status: 'COMPLETED' } });
    if (order.shelfBookId || drift.shelfBookId) await transaction.collection('shelf_books').doc(order.shelfBookId || drift.shelfBookId).remove();
    await writeCoinEvent(transaction, { userId: order.receiverId, refId: order._id, type: 'claim_spend', balanceDelta: -Number(order.coinValue), frozenDelta: -Number(order.coinValue), description: '完成接漂记录扣除', createdAt: now });
    await writeCoinEvent(transaction, { userId: order.giverId, refId: order._id, type: 'drift_reward', balanceDelta: Number(order.coinValue), frozenDelta: 0, description: '完成赠书记录公益积分', createdAt: now });
    if (firstBonus) await writeCoinEvent(transaction, { userId: order.giverId, refId: order._id, type: 'first_give_bonus', balanceDelta: firstBonus, frozenDelta: 0, description: '首次完成赠书奖励', createdAt: now });
    if (offset) await writeCoinEvent(transaction, { userId: order.giverId, refId: order._id, type: 'penalty_offset', balanceDelta: -offset, frozenDelta: 0, description: '历史违规待抵扣', createdAt: now });
    await writeCreditEvent(transaction, { userId: order.giverId, refId: order._id, reasonCode: 'GIVE_DONE', delta: 2, reason: '按时完成漂流', createdAt: now });
    await writeCreditEvent(transaction, { userId: order.receiverId, refId: order._id, reasonCode: 'CLAIM_DONE', delta: 2, reason: '完成接漂', createdAt: now });
    await writeOrderEvent(transaction, { orderId: order._id, type: `COMPLETED_${completionType}`, actorId: actorUserId, createdAt: now });
  });
}

async function confirm(openid, data) {
  const user = await requireUser(openid);
  if (!user) return fail(401, '未登录');
  await settleOrder(data.orderId, 'USER', user._id);
  return ok({ message: '确认收货成功，公益积分已结算' });
}

async function addReceivedBook(openid, data) {
  const user = await requireUser(openid);
  if (!user) return fail(401, '未登录');
  const { data: order } = await db.collection('drift_orders').doc(data.orderId).get();
  const normalizedOrder = normalizeOrderRecord(order, data.orderId);
  if (!normalizedOrder || normalizedOrder.receiverId !== user._id || normalizedOrder.status !== 'DONE') return fail(404, '已完成的漂流记录不存在');
  const { data: existing } = await db.collection('shelf_books').where({ userId: user._id, sourceOrderId: normalizedOrder._id }).limit(1).get();
  if (existing.length) return ok({ id: existing[0]._id, existed: true });
  const { total } = await db.collection('shelf_books').where({ userId: user._id }).count();
  const shelfLimit = Math.max(Number(user.shelfLimit) || DEFAULT_SHELF_LIMIT, DEFAULT_SHELF_LIMIT);
  if (total >= shelfLimit) return fail(400, '书架容量已满，请先整理书架');
  const { data: drift } = await db.collection('drifts').doc(normalizedOrder.driftId).get();
  const id = `received-${normalizedOrder._id}`;
  await db.collection('shelf_books').doc(id).set({
    data: { userId: user._id, bookId: drift.bookId, source: 'drift_received', sourceOrderId: normalizedOrder._id, category: 'want_read', readingStatus: 'want_read', status: 'unread', rating: 0, note: '', createdAt: nowIso() },
  });
  return ok({ id, existed: false });
}

async function dispute(openid, data) {
  const user = await requireUser(openid);
  if (!user) return fail(401, '未登录');
  if (user.disputeRestricted) throw new Error('DISPUTE_RESTRICTED');
  const reason = String(data.reason || '').trim();
  if (!reason) return fail(400, '请填写申诉原因');
  await assertSafeTextFields(openid, { reason }, { strict: true });
  await assertSafeMediaFiles(openid, data.images || []);
  const disputeId = uid();
  await db.runTransaction(async (transaction) => {
    const orderSnap = await transaction.collection('drift_orders').doc(data.orderId).get();
    let order = normalizeOrderRecord(orderSnap.data, data.orderId);
    if (!order || ![order.giverId, order.receiverId].includes(user._id)) throw new Error('ORDER_NOT_FOUND');
    const migrated = await ensureAccountingV2(transaction, order, _, data.orderId);
    order = migrated.order;
    if (order.status !== 'SHIPPED') throw new Error('INVALID_STATUS');
    await transaction.collection('drift_disputes').doc(disputeId).set({ data: { orderId: order._id, createdBy: user._id, reason, images: data.images || [], status: 'OPEN', createdAt: nowIso() } });
    await transaction.collection('drift_orders').doc(order._id).update({ data: { status: 'DISPUTED', activeDisputeId: disputeId } });
    await writeOrderEvent(transaction, { orderId: order._id, type: 'DISPUTED', actorId: user._id, createdAt: nowIso() });
  });
  return ok({ disputeId, status: 'OPEN' });
}

async function listDisputes(openid, data = {}) {
  if (!isAdminOpenid(openid)) return fail(403, '无管理员权限');
  const status = data.status === 'RESOLVED' ? 'RESOLVED' : 'OPEN';
  const orderField = status === 'RESOLVED' ? 'resolvedAt' : 'createdAt';
  const { data: rows } = await db.collection('drift_disputes').where({ status }).orderBy(orderField, 'desc').limit(50).get();
  return ok({ list: rows });
}

async function refundDispute(orderId, action, options = {}) {
  const now = nowIso();
  await db.runTransaction(async (transaction) => {
    const orderSnap = await transaction.collection('drift_orders').doc(orderId).get();
    let order = normalizeOrderRecord(orderSnap.data, orderId);
    if (!order) throw new Error('ORDER_NOT_FOUND');
    const migrated = await ensureAccountingV2(transaction, order, _, orderId);
    order = migrated.order;
    if (order.status !== 'DISPUTED') throw new Error('INVALID_STATUS');
    const receiverPatch = { coinFrozen: _.inc(-Number(order.coinValue)) };
    if (order.activeCounted === true) receiverPatch.activeClaimCount = _.inc(-1);
    await transaction.collection('users').doc(order.receiverId).update({ data: receiverPatch });
    const giverPenalty = action === 'GIVER_FAULT_FIRST' ? -5 : (action === 'GIVER_FAULT_REPEAT' ? -20 : 0);
    if (giverPenalty) {
      const giverPatch = { creditScore: _.inc(giverPenalty), verifiedViolationCount: _.inc(1) };
      if (action === 'GIVER_FAULT_REPEAT') {
        const giverSnap = await transaction.collection('users').doc(order.giverId).get();
        const penalty = Number(order.coinValue) || 0;
          const { deducted, pending } = splitViolationPenalty(penalty, availableCoin(giverSnap.data));
          if (deducted) giverPatch.coinBalance = _.inc(-deducted);
          if (pending) giverPatch.coinPenaltyPending = _.inc(pending);
          await writeCoinEvent(transaction, { userId: order.giverId, refId: order._id, type: 'violation_penalty', balanceDelta: -deducted, frozenDelta: 0, description: '重复履约违规处理', createdAt: now });
      }
      await transaction.collection('users').doc(order.giverId).update({ data: giverPatch });
      await writeCreditEvent(transaction, { userId: order.giverId, refId: order._id, reasonCode: action, delta: giverPenalty, reason: '申诉核实为赠书方责任', createdAt: now });
    }
    const withCompensation = action === 'GIVER_FAULT_FIRST' && (options.compensate === true || options.compensate === 'true');
    if (withCompensation) {
      const compensation = 5;
      await transaction.collection('users').doc(order.receiverId).update({ data: { coinBalance: _.inc(compensation) } });
      await writeCoinEvent(transaction, {
        userId: order.receiverId,
        refId: order._id,
        type: 'dispute_compensation',
        balanceDelta: compensation,
        frozenDelta: 0,
        description: '申诉首次责任处理补偿',
        createdAt: now,
      });
    }
    await transaction.collection('drift_orders').doc(order._id).update({ data: { status: 'CLOSED', activeCounted: false, closedAt: now, resolution: action } });
    await transaction.collection('drifts').doc(order.driftId).update({ data: { status: 'CLOSED' } });
    await writeCoinEvent(transaction, { userId: order.receiverId, refId: order._id, type: 'dispute_unfreeze', balanceDelta: 0, frozenDelta: -Number(order.coinValue), description: '申诉关闭释放占用积分', createdAt: now });
    await writeOrderEvent(transaction, { orderId: order._id, type: `RESOLVED_${action}`, actorId: '', createdAt: now });
  });
}

async function resolveDispute(openid, data) {
  if (!isAdminOpenid(openid)) return fail(403, '无管理员权限');
  const { data: disputeRow } = await db.collection('drift_disputes').doc(data.disputeId).get();
  if (!disputeRow || disputeRow.status !== 'OPEN') return fail(404, '待处理申诉不存在');
  const action = data.action;
  const remark = String(data.remark || '').trim().slice(0, 200);
  const normalizedAction = action === 'GIVER_FAULT_FIRST_WITH_COMP' ? 'GIVER_FAULT_FIRST' : action;
  const shouldCompensate = normalizedAction === 'GIVER_FAULT_FIRST' && (String(data.compensate) === 'true');
  if (normalizedAction === 'COMPLETE') await settleOrder(disputeRow.orderId, 'ADMIN');
  else if (['REFUND_CLOSE', 'GIVER_FAULT_FIRST', 'GIVER_FAULT_REPEAT'].includes(normalizedAction)) await refundDispute(disputeRow.orderId, normalizedAction, { compensate: shouldCompensate });
  else if (normalizedAction === 'INVALID') {
    await db.runTransaction(async (transaction) => {
      const orderSnap = await transaction.collection('drift_orders').doc(disputeRow.orderId).get();
      const order = normalizeOrderRecord(orderSnap.data, disputeRow.orderId);
      if (!order || order.status !== 'DISPUTED') throw new Error('INVALID_STATUS');
      const userSnap = await transaction.collection('users').doc(disputeRow.createdBy).get();
      const nextInvalidCount = (Number(userSnap.data.invalidDisputeCount) || 0) + 1;
      await transaction.collection('users').doc(disputeRow.createdBy).update({ data: { invalidDisputeCount: nextInvalidCount, disputeRestricted: nextInvalidCount >= 3 } });
      await transaction.collection('drift_orders').doc(order._id).update({ data: { status: 'SHIPPED', activeDisputeId: '' } });
    });
  } else return fail(400, '未知处理结果');
  await db.collection('drift_disputes').doc(disputeRow._id).update({
    data: {
      status: 'RESOLVED',
      action: normalizedAction,
      compensate: normalizedAction === 'GIVER_FAULT_FIRST' && shouldCompensate,
      remark,
      resolvedAt: nowIso(),
      resolvedBy: openid,
    },
  });
  return ok({ disputeId: disputeRow._id, action: normalizedAction, compensate: shouldCompensate });
}

async function review(openid, data) {
  const user = await requireUser(openid);
  if (!user) return fail(401, '未登录');
  const { data: order } = await db.collection('drift_orders').doc(data.orderId).get();
  const normalizedOrder = normalizeOrderRecord(order, data.orderId);
  if (!normalizedOrder || normalizedOrder.status !== 'DONE' || ![normalizedOrder.giverId, normalizedOrder.receiverId].includes(user._id)) return fail(400, '当前漂流记录不可评价');
  const toUser = normalizedOrder.giverId === user._id ? normalizedOrder.receiverId : normalizedOrder.giverId;
  const reviewId = `${normalizedOrder._id}-${user._id}`;
  let existing = null;
  try {
    const snapshot = await db.collection('reviews').doc(reviewId).get();
    existing = snapshot.data;
  } catch (err) {
    existing = null;
  }
  if (existing) return fail(409, '每人每笔漂流只能评价一次');
  const rating = Math.max(1, Math.min(5, Number(data.rating) || 5));
  await db.collection('reviews').doc(reviewId).set({ data: { orderId: normalizedOrder._id, fromUser: user._id, toUser, rating, createdAt: nowIso() } });
  return ok({ reviewId });
}

async function maintainDriftOrders() {
  const now = nowIso();
  const [{ data: pending }, { data: shipped }] = await Promise.all([
    db.collection('drift_orders').where({ status: 'PENDING_SHIP', shipDeadlineAt: _.lte(now) }).limit(50).get(),
    db.collection('drift_orders').where({ status: 'SHIPPED', autoCompleteAt: _.lte(now) }).limit(50).get(),
  ]);
  const results = [];
  for (const order of pending) {
    try { await cancelOrderById(order._id, { system: true }, 'SHIP_TIMEOUT'); results.push({ id: order._id, action: 'SHIP_TIMEOUT' }); } catch (err) { results.push({ id: order._id, error: err.message }); }
  }
  for (const order of shipped) {
    try {
      const { total } = await db.collection('drift_disputes').where({ orderId: order._id, status: 'OPEN' }).count();
      if (total) { results.push({ id: order._id, action: 'SKIP_OPEN_DISPUTE' }); continue; }
      await settleOrder(order._id, 'AUTO');
      results.push({ id: order._id, action: 'AUTO_COMPLETE' });
    } catch (err) { results.push({ id: order._id, error: err.message }); }
  }
  return ok({ processed: results.length, results });
}

async function migrateLegacyAccounting(openid, data = {}) {
  const tokenAllowed = process.env.MIGRATION_TOKEN && data.migrationToken === process.env.MIGRATION_TOKEN;
  if (!isAdminOpenid(openid) && !tokenAllowed) return fail(403, '无管理员权限');
  const cond = { status: _.in(ACTIVE_ORDER_STATUSES) };
  if (data.cursor) cond._id = _.gt(data.cursor);
  const { data: rows } = await db.collection('drift_orders').where(cond).orderBy('_id', 'asc').limit(50).get();
  let migrated = 0;
  const failed = [];
  for (const row of rows.filter((item) => item.accountingVersion === undefined || item.accountingVersion === null)) {
    try {
      await db.runTransaction(async (transaction) => {
        const snap = await transaction.collection('drift_orders').doc(row._id).get();
        const result = await ensureAccountingV2(transaction, snap.data, _, row._id);
        if (result.migrated) migrated += 1;
      });
    } catch (err) { failed.push({ id: row._id, error: err.message }); }
  }
  return ok({ processed: rows.length, migrated, failed, nextCursor: rows.length === 50 ? rows[rows.length - 1]._id : '' });
}

module.exports = {
  publish, check, appeal, claim, orders, orderDetail, bundleDetail, ship, cancel, cancelOpen, confirm, addReceivedBook,
  dispute, listDisputes, resolveDispute, review, maintainDriftOrders, migrateLegacyAccounting,
  settleOrder,
};
