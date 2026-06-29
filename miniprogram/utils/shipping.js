function formatRegion(region) {
  return Array.isArray(region) ? region.join('') : String(region || '');
}

function shippingInfoText(address = {}) {
  const region = formatRegion(address.region);
  const line1 = `${String(address.name || '').trim()} ${String(address.phone || '').trim()}`.trim();
  const line2 = `${region}${address.detail || ''}`.trim();
  return [line1, line2].filter(Boolean).join('\n');
}

function hasShippingInfo(address = {}) {
  return !!(address.name || address.phone || address.region || address.detail);
}

function formatShipDeadlineRemaining(shipDeadlineAt) {
  if (!shipDeadlineAt) return '';
  const ms = Date.parse(shipDeadlineAt) - Date.now();
  if (Number.isNaN(ms)) return '';
  if (ms <= 0) return '寄出期限已到，请尽快处理';
  const hours = Math.ceil(ms / 3600000);
  const days = Math.floor(hours / 24);
  const remainHours = hours % 24;
  if (days > 0) return `请在 ${days} 天 ${remainHours} 小时内寄出`;
  return `请在 ${hours} 小时内寄出`;
}

function formatAutoCompleteRemaining(autoCompleteAt) {
  if (!autoCompleteAt) return '';
  const ms = Date.parse(autoCompleteAt) - Date.now();
  if (Number.isNaN(ms)) return '';
  if (ms <= 0) return '确认期限已到，系统将自动完成';
  const hours = Math.ceil(ms / 3600000);
  const days = Math.floor(hours / 24);
  const remainHours = hours % 24;
  if (days > 0) return `${days} 天 ${remainHours} 小时后自动确认收货`;
  return `${hours} 小时后自动确认收货`;
}

function formatDeadlineClock(iso) {
  if (!iso) return '';
  return String(iso).replace('T', ' ').slice(0, 16);
}

module.exports = {
  formatRegion,
  shippingInfoText,
  hasShippingInfo,
  formatShipDeadlineRemaining,
  formatAutoCompleteRemaining,
  formatDeadlineClock,
};
