const { db, _, getBooksByIds, safeQuery } = require('./db');
const { hashUid } = require('./analytics');
const {
  createEmptyProfile,
  finalizeProfile,
  applyShelfSignals,
  applyBookSignals,
  applyBrowseSignals,
  SIGNAL_WEIGHTS,
} = require('./poolRecommend');

const BROWSE_EVENT_LIMIT = 80;

async function loadDriftBookIds(driftIds = []) {
  const ids = [...new Set(driftIds.filter(Boolean))];
  if (!ids.length) return {};
  const { data: rows } = await safeQuery('drifts', (col) =>
    col.where({ _id: _.in(ids) }).limit(ids.length).get());
  const map = {};
  rows.forEach((row) => { map[row._id] = row.bookId; });
  return map;
}

async function loadUserInterestProfile(userId, openid) {
  if (!userId) return createEmptyProfile();

  const uidHash = hashUid(openid);
  const sinceDay = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [
    { data: shelfRows },
    { data: wantRows },
    { data: receivedOrders },
    { data: browseEvents },
  ] = await Promise.all([
    safeQuery('shelf_books', (col) => col.where({ userId }).limit(200).get()),
    safeQuery('drift_wants', (col) => col.where({ userId }).orderBy('createdAt', 'desc').limit(100).get()),
    safeQuery('drift_orders', (col) => col.where({
      receiverId: userId,
      status: _.neq('CANCELLED'),
    }).orderBy('createdAt', 'desc').limit(100).get()),
    safeQuery('events', (col) => col.where({
      uidHash,
      type: 'page_view',
      day: _.gte(sinceDay),
    }).orderBy('day', 'desc').limit(BROWSE_EVENT_LIMIT).get()),
  ]);

  const driftBookMap = await loadDriftBookIds(receivedOrders.map((row) => row.driftId));
  const bookIds = [
    ...new Set([
      ...shelfRows.map((row) => row.bookId),
      ...wantRows.map((row) => row.bookId),
      ...receivedOrders.map((row) => row.bookId || driftBookMap[row.driftId]),
    ].filter(Boolean)),
  ];
  const books = bookIds.length ? await getBooksByIds(bookIds) : {};

  let profile = createEmptyProfile();
  profile = applyShelfSignals(profile, shelfRows, books);
  profile = applyBookSignals(profile, Object.fromEntries(
    wantRows.map((row) => [row.bookId, books[row.bookId]]).filter(([, book]) => book),
  ), SIGNAL_WEIGHTS.want);
  profile = applyBookSignals(profile, Object.fromEntries(
    receivedOrders
      .map((row) => {
        const bookId = row.bookId || driftBookMap[row.driftId];
        return [bookId, books[bookId]];
      })
      .filter(([, book]) => book),
  ), SIGNAL_WEIGHTS.received);
  profile = applyBrowseSignals(profile, browseEvents.filter((evt) => {
    const page = String((evt.props || {}).page || '');
    return page === 'pool/detail' || page === 'pool/index';
  }));

  return finalizeProfile(profile);
}

module.exports = {
  loadUserInterestProfile,
};
