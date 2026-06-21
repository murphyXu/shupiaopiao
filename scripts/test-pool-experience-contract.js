const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const appJson = JSON.parse(read('miniprogram/app.json'));
const apiIndex = read('cloudfunctions/api/index.js');
const poolHandler = read('cloudfunctions/api/handlers/pool.js');
const apiUtils = read('miniprogram/utils/api.js');
const poolJs = read('miniprogram/pages/pool/index.js');
const poolWxml = read('miniprogram/pages/pool/index.wxml');
const poolWxss = read('miniprogram/pages/pool/index.wxss');
const detailWxml = read('miniprogram/pages/pool/detail.wxml');
const detailWxss = read('miniprogram/pages/pool/detail.wxss');
const claimJs = read('miniprogram/pages/drift/claim.js');
const claimWxml = read('miniprogram/pages/drift/claim.wxml');
const publishJs = read('miniprogram/pages/drift/publish.js');
const publishWxml = read('miniprogram/pages/drift/publish.wxml');
const guidePath = path.join(__dirname, '../miniprogram/pages/drift/guide.wxml');
const guideWxml = fs.existsSync(guidePath) ? fs.readFileSync(guidePath, 'utf8') : '';
const guideJs = fs.existsSync(path.join(__dirname, '../miniprogram/pages/drift/guide.js'))
  ? fs.readFileSync(path.join(__dirname, '../miniprogram/pages/drift/guide.js'), 'utf8')
  : '';
const guideWxss = fs.existsSync(path.join(__dirname, '../miniprogram/pages/drift/guide.wxss'))
  ? fs.readFileSync(path.join(__dirname, '../miniprogram/pages/drift/guide.wxss'), 'utf8')
  : '';

assert.ok(apiIndex.includes("'pool.stats'"), 'api should expose pool stats route');
assert.ok(poolHandler.includes('stats') && poolHandler.includes('givenCount') && poolHandler.includes('receivedCount') && poolHandler.includes('wantCount'), 'pool handler should return drift stats');
assert.ok(poolHandler.includes('availableCoin') && poolHandler.includes('availableCoin(user)'), 'pool stats should expose current user available public points');
assert.ok(apiUtils.includes('getPoolStats'), 'frontend api should wrap pool stats');
assert.ok(poolJs.includes('loadStats') && poolJs.includes('getPoolStats'), 'pool page should load stats');
assert.ok(poolWxml.includes('我赠出') && poolWxml.includes('我接漂') && poolWxml.includes('我想漂'), 'pool page should label top stats as current user counts');
assert.ok(poolWxml.includes('剩余可用公益积分') && poolWxml.includes('stats.availableCoin'), 'pool header should show current user available public points');
assert.ok(poolWxml.includes('earn-point-action') && poolWxml.includes('bindtap="showEarnPointGuide"'), 'pool header should expose an earn-points entry beside the points line');
assert.ok(!poolWxml.includes('本书正在漂流'), 'pool header should not describe plaza-wide drifting book count');
assert.ok(poolJs.includes('showEarnPointGuide()') && poolJs.includes('上漂一本书') && poolJs.includes('了解首赠') && poolJs.includes('邀请书友'), 'pool earn-points entry should guide publish, first gift and invitation paths');

assert.ok(poolWxml.includes('src="{{item.book.cover}}"'), 'pool list should use recognized book cover from data source');
assert.ok(!poolWxml.includes('item.images[0] || item.book.cover'), 'pool list should not use user shot image as card cover');
assert.ok(poolWxml.includes('stat-row') && poolWxml.includes('stat-card'), 'pool stats should reuse shelf home stat layout');

assert.ok(detailWxml.includes('mode="aspectFit"') && detailWxml.includes('shot-frame'), 'pool detail top carousel should adapt user shot images');
assert.ok(detailWxss.includes('.shot-frame') && detailWxss.includes('background: #fff'), 'pool detail image frame should fit shots on a clean background');

assert.ok(claimJs.includes('chooseWxAddress') && claimJs.includes('wx.chooseAddress'), 'claim page should read WeChat address');
assert.ok(claimJs.includes('api.addAddress') && claimJs.includes('provinceName'), 'claim page should persist selected WeChat address for claim');
assert.ok(claimWxml.includes('微信地址') && claimWxml.includes('chooseWxAddress'), 'claim page should expose WeChat address action');

assert.ok(poolWxml.includes('上漂赠书') && !poolWxml.includes('发起漂流赠出') && poolJs.includes('goPublish'), 'pool page should provide concise publish drift entry');
assert.ok(publishJs.includes('selectBook') && publishJs.includes('shelfBooks'), 'publish page should allow choosing a shelf book when no bookId is passed');
assert.ok(publishWxml.includes('选择要赠出的书') && publishWxml.includes('selectBook'), 'publish page should render a shelf-book picker');

assert.ok(appJson.pages.includes('pages/drift/guide'), 'drift guide page should be registered');
assert.ok(poolWxml.includes('漂流广场') && poolWxml.includes('玩法介绍') && poolWxml.includes('bindtap="goGuide"'), 'pool header should expose drift guide sign beside title');
assert.ok(poolWxss.includes('justify-content: flex-start') && poolWxss.includes('guide-entry') && poolWxss.includes('rotate(-2deg)'), 'pool guide entry should sit next to title as a signboard');
assert.ok(poolJs.includes('goGuide()') && poolJs.includes('/pages/drift/guide'), 'pool page should navigate to drift guide');
assert.ok(guideWxml.includes('让一本书，去遇见下一个人') && guideWxml.includes('少一点负担，多一本好书'), 'guide should use emotional and receiver-value copy');
assert.ok(guideWxml.includes('闲置变成被需要') && guideWxml.includes('分享被看见'), 'guide should state giver emotional value');
assert.ok(guideWxml.includes('把书放入漂流池') && guideWxml.includes('等待有缘人申请接漂') && guideWxml.includes('完成一次温柔传递'), 'guide should explain the three-step flow');
assert.ok(guideWxml.includes('公益积分') && guideWxml.includes('发货前可取消') && guideWxml.includes('完成后结算'), 'guide should include soft rule explanation');
assert.ok(guideJs.includes('goPool()') && guideJs.includes('wx.switchTab') && guideWxml.includes('去看看正在漂流的书'), 'guide should provide a pool call-to-action');
assert.ok(guideWxss.includes('.hero-card') && guideWxss.includes('.step-card'), 'guide should include clear visual structure');

console.log('pool experience contract ok');
