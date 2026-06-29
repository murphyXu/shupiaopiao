const { officialAccountUsername = '' } = require('../config/index');

const STORAGE_MILESTONE_SHOWN = 'oa_milestone_shown';
const STORAGE_MILESTONE_DISMISSED_AT = 'oa_milestone_dismissed_at';

let subscribeDialogTriggeredThisSession = false;

function isMilestoneShown() {
  return !!wx.getStorageSync(STORAGE_MILESTONE_SHOWN);
}

function canShowMilestonePrompt() {
  if (isMilestoneShown()) return false;
  if (subscribeDialogTriggeredThisSession) return false;
  return true;
}

function markSubscribeDialogTriggered() {
  subscribeDialogTriggeredThisSession = true;
}

function consumeMilestonePrompt() {
  wx.setStorageSync(STORAGE_MILESTONE_SHOWN, true);
  wx.setStorageSync(STORAGE_MILESTONE_DISMISSED_AT, Date.now());
}

function dismissMilestonePrompt() {
  consumeMilestonePrompt();
}

function isOfficialAccountConfigured() {
  return !!officialAccountUsername;
}

function openOfficialAccountProfile() {
  if (!officialAccountUsername) return;
  wx.openOfficialAccountProfile({
    username: officialAccountUsername,
    fail: () => {
      wx.showToast({ title: '暂时无法打开公众号主页', icon: 'none' });
    },
  });
}

function tryShowMilestonePrompt(scene, extra = {}) {
  if (!isOfficialAccountConfigured()) return false;
  if (!canShowMilestonePrompt()) return false;
  if (scene === 'publish' && !extra.passed) return false;
  if (scene === 'batch' && !(Number(extra.successCount) >= 1)) return false;
  if (scene === 'claim' && extra.milestoneQuery !== 'claim') return false;
  if (scene === 'ship' && extra.milestoneQuery !== 'ship') return false;
  consumeMilestonePrompt();
  try {
    const { track } = require('./track');
    track('oa_milestone_show', { scene });
  } catch (e) { /* analytics optional */ }
  return true;
}

function trackOaEvent(type, scene) {
  try {
    const { track } = require('./track');
    track(type, { scene });
  } catch (e) { /* analytics optional */ }
}

module.exports = {
  canShowMilestonePrompt,
  markSubscribeDialogTriggered,
  consumeMilestonePrompt,
  dismissMilestonePrompt,
  isOfficialAccountConfigured,
  openOfficialAccountProfile,
  tryShowMilestonePrompt,
  trackOaEvent,
  _resetSessionForTest() {
    subscribeDialogTriggeredThisSession = false;
  },
};
