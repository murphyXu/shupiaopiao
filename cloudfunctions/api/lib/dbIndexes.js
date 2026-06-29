/**
 * Recommended CloudBase composite indexes (create in console or init script).
 * Query patterns must match field order for index use.
 */
const DB_INDEX_SPECS = [
  {
    collection: 'drifts',
    fields: [{ name: 'status', direction: 'asc' }, { name: 'createdAt', direction: 'desc' }],
    purpose: 'pool feed rebuild and in-pool listing',
  },
  {
    collection: 'drifts',
    fields: [{ name: 'status', direction: 'asc' }, { name: 'opsPinned', direction: 'desc' }],
    purpose: 'ops pinned drifts in pool',
  },
  {
    collection: 'shelf_books',
    fields: [{ name: 'userId', direction: 'asc' }, { name: 'createdAt', direction: 'desc' }],
    purpose: 'shelf list pagination',
  },
  {
    collection: 'shelf_books',
    fields: [{ name: 'userId', direction: 'asc' }, { name: 'bookClass', direction: 'asc' }, { name: 'createdAt', direction: 'desc' }],
    purpose: 'shelf category tab filter',
  },
  {
    collection: 'drift_orders',
    fields: [{ name: 'driftId', direction: 'asc' }, { name: 'status', direction: 'asc' }],
    purpose: 'pool visibility cancelled-by-giver lookup',
  },
  {
    collection: 'drift_wants',
    fields: [{ name: 'userId', direction: 'asc' }, { name: 'driftId', direction: 'asc' }],
    purpose: 'pool list wanted state',
  },
];

module.exports = { DB_INDEX_SPECS };
