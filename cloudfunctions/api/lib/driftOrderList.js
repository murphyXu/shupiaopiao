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

function givenStatusPriority(status) {
  return GIVEN_STATUS_PRIORITY[status] || 90;
}

function prepareGivenList(list = [], limit = 50) {
  return [...list]
    .sort((a, b) => {
      const diff = givenStatusPriority(a.status) - givenStatusPriority(b.status);
      if (diff !== 0) return diff;
      return new Date(b.createdAt) - new Date(a.createdAt);
    })
    .slice(0, limit);
}

module.exports = {
  prepareGivenList,
};
