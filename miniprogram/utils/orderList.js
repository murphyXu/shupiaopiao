const GIVEN_STATUS_TABS = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待寄出', statuses: ['PENDING_SHIP'] },
  { key: 'open', label: '待接漂', statuses: ['IN_POOL', 'PENDING_REVIEW', 'CHECKING'] },
  { key: 'transit', label: '在途', statuses: ['SHIPPED'] },
  { key: 'dispute', label: '申诉', statuses: ['DISPUTED'] },
  { key: 'review', label: '待评价', statuses: ['DONE'] },
  { key: 'closed', label: '已结束', statuses: ['REJECTED', 'CANCELLED', 'CLOSED', 'COMPLETED'] },
];

const RECEIVED_STATUS_TABS = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待确认', statuses: ['SHIPPED'] },
  { key: 'waiting', label: '待发货', statuses: ['PENDING_SHIP'] },
  { key: 'dispute', label: '申诉', statuses: ['DISPUTED'] },
  { key: 'review', label: '待评价', statuses: ['DONE'] },
  { key: 'closed', label: '已结束', statuses: ['CANCELLED', 'CLOSED', 'COMPLETED'] },
];

const GIVEN_STATUS_PRIORITY = {
  PENDING_SHIP: 10,
  PENDING_REVIEW: 20,
  CHECKING: 20,
  IN_POOL: 30,
  SHIPPED: 40,
  DISPUTED: 50,
  DONE: 60,
  REJECTED: 70,
  CANCELLED: 80,
  CLOSED: 80,
  COMPLETED: 80,
};

const RECEIVED_STATUS_PRIORITY = {
  SHIPPED: 10,
  PENDING_SHIP: 20,
  DISPUTED: 30,
  DONE: 40,
  CANCELLED: 80,
  CLOSED: 80,
  COMPLETED: 80,
};

function statusTabsFor(role) {
  return role === 'received' ? RECEIVED_STATUS_TABS : GIVEN_STATUS_TABS;
}

function statusPriority(status, role) {
  const map = role === 'received' ? RECEIVED_STATUS_PRIORITY : GIVEN_STATUS_PRIORITY;
  return map[status] || 90;
}

function sortOrdersByStatusPriority(orders = [], role) {
  return [...orders].sort((a, b) => {
    const diff = statusPriority(a.status, role) - statusPriority(b.status, role);
    if (diff !== 0) return diff;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
}

function filterOrdersByTab(orders = [], tabKey, role) {
  const tabs = statusTabsFor(role);
  const tab = tabs.find((item) => item.key === tabKey) || tabs[0];
  if (!tab.statuses) return orders;
  return orders.filter((order) => tab.statuses.includes(order.status));
}

function withTabCounts(orders = [], role) {
  return statusTabsFor(role).map((tab) => ({
    key: tab.key,
    label: tab.label,
    count: tab.key === 'all' ? orders.length : filterOrdersByTab(orders, tab.key, role).length,
  }));
}

function resolveActiveTabFromStatus(status, role) {
  if (!status) return 'all';
  const matched = statusTabsFor(role).find((tab) => tab.statuses && tab.statuses.includes(status));
  return matched ? matched.key : 'all';
}

function prepareOrderList(orders = [], role, tabKey = 'all') {
  const sorted = sortOrdersByStatusPriority(orders, role);
  const filtered = filterOrdersByTab(sorted, tabKey, role);
  return {
    orders: filtered,
    statusTabs: withTabCounts(orders, role),
  };
}

module.exports = {
  GIVEN_STATUS_TABS,
  RECEIVED_STATUS_TABS,
  statusTabsFor,
  sortOrdersByStatusPriority,
  filterOrdersByTab,
  withTabCounts,
  resolveActiveTabFromStatus,
  prepareOrderList,
};
