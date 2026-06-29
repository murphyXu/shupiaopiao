function buildDriftTodoSummary(givenRows = [], receivedRows = [], now = Date.now()) {
  const givenPending = givenRows.filter((row) => row.status === 'PENDING_SHIP');
  const expiringSoon = givenPending.filter((row) => {
    const deadline = Date.parse(row.shipDeadlineAt || '');
    return Number.isFinite(deadline) && deadline > now && deadline - now <= 24 * 3600 * 1000;
  });
  const givenDisputed = givenRows.filter((row) => row.status === 'DISPUTED');
  const receivedPending = receivedRows.filter((row) => row.status === 'PENDING_SHIP');
  const receivedShipped = receivedRows.filter((row) => row.status === 'SHIPPED');
  const receivedDisputed = receivedRows.filter((row) => row.status === 'DISPUTED');
  const givenDone = givenRows.filter((row) => row.status === 'DONE');
  const receivedDone = receivedRows.filter((row) => row.status === 'DONE');
  return {
    pendingShip: givenPending.length,
    expiringSoon: expiringSoon.length,
    waitingShipReceived: receivedPending.length,
    toConfirm: receivedShipped.length,
    disputing: givenDisputed.length + receivedDisputed.length,
    toReview: givenDone.length + receivedDone.length,
    disputingGiven: givenDisputed.length,
    disputingReceived: receivedDisputed.length,
    toReviewGiven: givenDone.length,
    toReviewReceived: receivedDone.length,
  };
}

module.exports = {
  buildDriftTodoSummary,
};
