const { ok, fail } = require('../lib/utils');
const { requireUser } = require('../lib/db');

async function track(openid, data) {
  const user = await requireUser(openid);
  if (!user) return fail(401, '未登录');
  const trackingNo = data.trackingNo;
  const company = data.expressCompany || '快递';
  const now = new Date().toISOString();
  return ok({
    trackingNo,
    expressCompany: company,
    status: 'IN_TRANSIT',
    traces: [
      { time: now, context: `[演示] ${company} 快件已揽收，单号 ${trackingNo}` },
      { time: now, context: '[演示] 快件运输中，以快递公司官网为准' },
    ],
  });
}

module.exports = { track };
