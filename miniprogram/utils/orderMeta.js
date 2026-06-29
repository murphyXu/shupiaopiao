const { formatDate } = require('./util');

function formatOrderNo(id) {
  if (!id || String(id).startsWith('drift-')) return '';
  return String(id).replace(/-/g, '').slice(-8).toUpperCase();
}

function formatOrderTime(order = {}) {
  if (order.orderTimeText) return order.orderTimeText;
  return formatDate(order.claimedAt || order.createdAt);
}

function buildOrderMetaLine(order = {}) {
  if (!order || String(order.id || '').startsWith('drift-')) return '';
  const orderNo = order.orderNo || formatOrderNo(order.id);
  const orderTime = formatOrderTime(order);
  const parts = [];
  if (orderNo) parts.push(`订单编号 ${orderNo}`);
  if (orderTime) parts.push(`下单 ${orderTime}`);
  return parts.join(' · ');
}

module.exports = {
  buildOrderMetaLine,
  formatOrderNo,
  formatOrderTime,
};
