const KNOW_TITLE = '接漂须知';
const COD_SHORT = '快递到付，收件时付运费';
const COD_PLATFORM = '平台不代收运费';
const INFLIGHT_LIMIT = '在途接漂最多 5 单';
const INFLIGHT_LIMIT_SUMMARY = '最多 5 单';
const ADDRESS_PLACEHOLDER = '选择收货地址 ›';
const SAME_GIVER_HINT = '分别申请接漂，地址相同可合并一次寄出';
const CLAIM_MODAL_CONFIRM = '是否确认申请？';
const GUIDE_LINK_TEXT = '查看漂流玩法 ›';
const GUIDE_PATH = '/pages/drift/guide';

function formatKnowOccupyLine(coinValue) {
  const n = Number(coinValue) || 0;
  if (!n) return '确认收货后完成积分记录';
  return `先占用 ${n} 公益积分，确认收货后完成积分记录`;
}

function formatKnowCodLine() {
  return `快递到付，${COD_PLATFORM}`;
}

function formatClaimModalContent(coinValue) {
  const n = Number(coinValue) || 0;
  const lines = [];
  if (n) lines.push(`先占用 ${n} 公益积分`);
  lines.push('确认收货后从占用中结算');
  lines.push(CLAIM_MODAL_CONFIRM);
  return lines.join('\n');
}

module.exports = {
  KNOW_TITLE,
  COD_SHORT,
  COD_PLATFORM,
  INFLIGHT_LIMIT,
  INFLIGHT_LIMIT_SUMMARY,
  ADDRESS_PLACEHOLDER,
  SAME_GIVER_HINT,
  CLAIM_MODAL_CONFIRM,
  GUIDE_LINK_TEXT,
  GUIDE_PATH,
  formatKnowOccupyLine,
  formatKnowCodLine,
  formatClaimModalContent,
};
