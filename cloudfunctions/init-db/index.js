const cloud = require('wx-server-sdk');
const { ensureCollections, COLLECTIONS } = require('./collections');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async () => {
  const result = await ensureCollections(db);
  return {
    code: 0,
    msg: 'collections ready',
    data: { ...result, names: COLLECTIONS },
  };
};
