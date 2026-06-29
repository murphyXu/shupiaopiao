const { cancelCreditChange } = require('./driftPolicy');

function buildRevokePublishRewardAmount(drift = {}) {
  if (!drift || drift.publishRewardGranted !== true || drift.publishRewardRevoked === true) return 0;
  return Math.max(Number(
    drift.publishRewardCredited === undefined ? drift.publishRewardAmount : drift.publishRewardCredited,
  ) || 0, 0);
}

function buildCancelPointEffects({ role, coinValue = 0, drift = null } = {}) {
  const creditChange = cancelCreditChange(role);
  const effects = {
    creditDelta: creditChange ? creditChange.delta : 0,
    coinReleased: role === 'RECEIVER' || role === 'GIVER' ? Math.max(Number(coinValue) || 0, 0) : 0,
    publishRewardRevoked: role === 'GIVER' || role === 'SYSTEM' ? buildRevokePublishRewardAmount(drift) : 0,
  };
  return effects;
}

function buildClaimPointEffects(coinValue = 0) {
  return {
    coinOccupied: Math.max(Number(coinValue) || 0, 0),
  };
}

function buildConfirmPointEffects(coinValue = 0) {
  return {
    coinSpent: Math.max(Number(coinValue) || 0, 0),
    creditDelta: 2,
  };
}

function buildRedeemPointEffects(coinCost = 0) {
  return {
    coinSpent: Math.max(Number(coinCost) || 0, 0),
  };
}

module.exports = {
  buildCancelPointEffects,
  buildClaimPointEffects,
  buildConfirmPointEffects,
  buildRedeemPointEffects,
  buildRevokePublishRewardAmount,
};
