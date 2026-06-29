const { RULES } = require('./pointRules');
const driftCopy = require('./driftCopy');

function absAmount(value) {
  return Math.abs(Number(value) || 0);
}

function formatCoinEarn(amount) {
  const n = absAmount(amount);
  return n ? `获得 ${n} 公益积分` : '';
}

function formatCoinSpend(amount) {
  const n = absAmount(amount);
  return n ? `扣除 ${n} 公益积分` : '';
}

function formatCoinOccupy(amount) {
  const n = absAmount(amount);
  return n ? `占用 ${n} 公益积分` : '';
}

function formatCoinRelease(amount) {
  const n = absAmount(amount);
  return n ? `释放 ${n} 公益积分` : '';
}

function formatCoinRevoke(amount) {
  const n = absAmount(amount);
  return n ? `退回 ${n} 公益积分` : '';
}

function formatCreditChange(delta) {
  const n = Number(delta) || 0;
  if (!n) return '';
  return n > 0 ? `信用积分 +${n}` : `信用积分 ${n}`;
}

function joinPointLines(lines = []) {
  return lines.filter(Boolean).join('\n');
}

function buildClaimConfirmContent(coinValue) {
  return driftCopy.formatClaimModalContent(coinValue);
}

function buildClaimSuccessTitle(result = {}) {
  if (result.merged) return '已与上一本合并寄出';
  return '申请已提交';
}

function buildCancelConfirmContent({
  role,
  coinValue = 0,
  creditDelta = 0,
  publishRewardRevoke = 0,
} = {}) {
  const lines = [];
  const creditAmount = absAmount(creditDelta);
  if (creditAmount) {
    lines.push(`确认取消后将扣除 ${creditAmount} 信用积分`);
  }
  if (role === 'GIVER') {
    const n = absAmount(coinValue);
    if (n) lines.push(`接漂方占用的 ${n} 公益积分将释放`);
    const revoke = absAmount(publishRewardRevoke);
    if (revoke) lines.push(`已发放的上漂奖励将退回 ${revoke} 公益积分`);
  } else if (role === 'RECEIVER') {
    const n = absAmount(coinValue);
    if (n) lines.push(`占用的 ${n} 公益积分将释放`);
  }
  return joinPointLines(lines);
}

function promptCancelConfirm(options = {}) {
  return new Promise((resolve) => {
    wx.showModal({
      title: options.title || '确认取消',
      content: buildCancelConfirmContent(options),
      confirmText: '确认取消',
      cancelText: '再想想',
      success: (res) => resolve(!!res.confirm),
    });
  });
}

function cancelCreditDelta(role) {
  if (role === 'RECEIVER') return RULES.creditReceiverCancel;
  if (role === 'GIVER') return RULES.creditGiverCancel;
  if (role === 'SYSTEM') return RULES.creditGiverTimeout;
  return 0;
}

function buildCancelSuccessTitle() {
  return '已取消';
}

function buildPublishRewardResultText(publishReward = 0) {
  const amount = absAmount(publishReward);
  return amount ? `+${amount} 公益积分` : '';
}

function buildConfirmReceiveContent({ coinValue = 0, creditBonus = RULES.creditCompleteBonus } = {}) {
  return joinPointLines([
    formatCoinSpend(coinValue),
    formatCreditChange(creditBonus),
    '是否确认已收到图书？',
  ]);
}

function buildConfirmReceiveSuccessTitle(pointEffects = {}) {
  const lines = [];
  const spent = absAmount(pointEffects.coinSpent);
  if (spent) lines.push(formatCoinSpend(spent));
  const credit = formatCreditChange(pointEffects.creditDelta);
  if (credit) lines.push(credit);
  return lines.length ? lines.join('，') : '已确认收货';
}

function buildRedeemConfirmContent(coinCost) {
  return joinPointLines([
    formatCoinSpend(coinCost),
    '是否确认兑换？',
  ]);
}

function buildRedeemSuccessTitle(coinCost) {
  const spent = absAmount(coinCost);
  return spent ? `兑换成功，${formatCoinSpend(spent)}` : '兑换成功';
}

function buildPublishAuditRewardLine(publishReward = 0) {
  const amount = absAmount(publishReward);
  return amount ? `上漂奖励 ${formatCoinEarn(amount)}` : '';
}

module.exports = {
  RULES,
  buildClaimConfirmContent,
  buildClaimSuccessTitle,
  buildCancelConfirmContent,
  buildCancelSuccessTitle,
  buildConfirmReceiveContent,
  buildConfirmReceiveSuccessTitle,
  buildRedeemConfirmContent,
  buildRedeemSuccessTitle,
  buildPublishAuditRewardLine,
  buildPublishRewardResultText,
  cancelCreditDelta,
  formatCoinEarn,
  formatCoinOccupy,
  formatCoinRelease,
  formatCoinRevoke,
  formatCoinSpend,
  formatCreditChange,
  joinPointLines,
  promptCancelConfirm,
};
