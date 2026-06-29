const { ok, fail, uid, nowIso } = require('../lib/utils');
const { db, requireUser } = require('../lib/db');
const { assertSafeTextFields } = require('../lib/contentSecurity');
const { schedulePoolFeedRebuild } = require('../lib/poolFeedSnapshot');

const TARGET_TYPES = new Set(['drift', 'note', 'review', 'shelf']);

async function create(openid, data = {}) {
  const user = await requireUser(openid);
  if (!user) return fail(401, '未登录');
  const targetType = String(data.targetType || '').trim();
  const targetId = String(data.targetId || '').trim();
  const reason = String(data.reason || '').trim().slice(0, 200);
  if (!TARGET_TYPES.has(targetType)) return fail(400, '举报对象不支持');
  if (!targetId) return fail(400, '缺少举报对象');
  if (!reason) return fail(400, '请填写举报原因');

  await assertSafeTextFields(openid, { reason }, { strict: true });

  const reportId = uid();
  await db.collection('reports').doc(reportId).set({
    data: {
      userId: user._id,
      targetType,
      targetId,
      reason,
      status: 'OPEN',
      createdAt: nowIso(),
    },
  });
  if (targetType === 'drift') schedulePoolFeedRebuild('drift_report');
  return ok({ reportId, message: '举报已提交' });
}

module.exports = { create };
