async function countShelfCapacityUsage(db, userId) {
  const { total } = await db.collection('shelf_books').where({ userId }).count();
  return total || 0;
}

module.exports = {
  countShelfCapacityUsage,
};
