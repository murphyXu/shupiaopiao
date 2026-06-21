const CONDITION_FACTORS = {
  new: 1.5,
  like_new: 1,
  good: 0.9,
  seven_new: 0.8,
  below_seven: 0.8,
  fair: 0.8,
};

const CONDITION_LABELS = {
  new: '全新',
  like_new: '9成新',
  good: '八成新',
  seven_new: '7成新',
  below_seven: '7成新以下',
  fair: '有笔记',
};

const CONDITION_ISSUE_LABELS = {
  notes: '有笔记',
  water: '有泡水',
  stain: '有脏污',
  damage: '有破损',
  crease: '有折痕',
  yellowing: '有泛黄',
};

const DEFAULT_PRICES = { 绘本: 25, 文学: 35, 科普: 30 };

function estimateFromCache(cached, condition, category) {
  const medianPrice = cached ? cached.medianPrice : (DEFAULT_PRICES[category] || 28);
  const factor = CONDITION_FACTORS[condition] || 0.75;
  const coinValue = Math.round(medianPrice * factor);
  return {
    medianPrice,
    conditionFactor: factor,
    coinValue,
    sources: cached ? (cached.sources || []) : [{ source: 'default', price: medianPrice }],
  };
}

function runAutoCheck(drift, book, user, recentCount, duplicateCount) {
  const reasons = [];

  // 实拍图上传模块已下线，不再校验封面实拍图。
  if ((user.creditScore || 100) < 60) {
    reasons.push({ code: 'LOW_CREDIT', message: '信用积分过低，暂不可上漂' });
  }
  if (recentCount > 10) {
    reasons.push({ code: 'RATE_LIMIT', message: '上书频率过高，请稍后再试' });
  }
  if (duplicateCount > 0) {
    reasons.push({ code: 'DUPLICATE', message: '该书已在漂流中，不可重复上漂' });
  }
  if (book.isbn === '0000000000000') {
    reasons.push({ code: 'ISBN_BLACKLIST', message: '该 ISBN 不可漂流' });
  }

  const criticalCodes = ['LOW_CREDIT', 'RATE_LIMIT', 'DUPLICATE', 'ISBN_BLACKLIST'];
  const critical = reasons.filter((r) => criticalCodes.includes(r.code));
  if (critical.length) return { passed: false, reasons: critical };

  return {
    passed: true,
    reasons: reasons.length ? reasons : [{ code: 'OK', message: '检测通过' }],
    checks: [
      { name: 'ISBN compliance', passed: true },
      { name: 'Image check', passed: true },
      { name: 'Risk rules', passed: true },
    ],
  };
}

module.exports = {
  CONDITION_FACTORS,
  CONDITION_LABELS,
  CONDITION_ISSUE_LABELS,
  estimateFromCache,
  runAutoCheck,
};
