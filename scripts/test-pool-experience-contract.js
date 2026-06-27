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
const poolJson = JSON.parse(read('miniprogram/pages/pool/index.json'));
const detailWxml = read('miniprogram/pages/pool/detail.wxml');
const detailWxss = read('miniprogram/pages/pool/detail.wxss');
const detailJs = read('miniprogram/pages/pool/detail.js');
const earnGuideComponentWxml = read('miniprogram/components/earn-point-guide-modal/index.wxml');
const earnGuideComponentWxss = read('miniprogram/components/earn-point-guide-modal/index.wxss');
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
const { publishEarnGuideModal } = require('../miniprogram/utils/pointRules');
const earnGuide = publishEarnGuideModal();

assert.ok(apiIndex.includes("'pool.stats'"), 'api should expose pool stats route');
assert.ok(poolHandler.includes('stats') && poolHandler.includes('givenCount') && poolHandler.includes('receivedCount') && poolHandler.includes('wantCount'), 'pool handler should return drift stats');
assert.ok(poolHandler.includes('availableCoin') && poolHandler.includes('availableCoin(user)'), 'pool stats should expose current user available public points');
assert.ok(apiUtils.includes('getPoolStats'), 'frontend api should wrap pool stats');
assert.ok(poolJs.includes('loadStats') && poolJs.includes('getPoolStats'), 'pool page should load stats');
assert.ok(!poolWxml.includes('stat-row') && !poolWxml.includes('我赠出'), 'pool home should not render the top stats row');
assert.ok(poolWxml.includes('剩余可用公益积分') && poolWxml.includes('stats.availableCoin'), 'pool header should show current user available public points');
assert.ok(poolWxml.includes('earn-point-action') && poolWxml.includes('bindtap="showEarnPointGuide"'), 'pool header should expose an earn-points entry beside the points line');
assert.ok(!poolWxml.includes('本书正在漂流'), 'pool header should not describe plaza-wide drifting book count');
assert.ok(poolJs.includes('showEarnPointGuide()') && poolJs.includes('上漂一本书') && poolJs.includes('邀请书友') && !poolJs.includes('了解首赠'), 'pool earn-points entry should merge publish and first-gift into one path plus invitation');
assert.ok(!poolJs.includes('wx.showModal') && poolJs.includes('showEarnGuideModal: true') && poolJs.includes('confirmEarnPointGuide()'), 'pool earn-points guide should use a structured custom modal instead of wx.showModal text');
assert.ok(poolJs.includes('publishEarnGuideModal') && read('miniprogram/utils/pointRules.js').includes('首次完成赠书'), 'publish earn guide should show combined scoring details');
assert.strictEqual(earnGuide.title, '上漂赠书可获得积分', 'publish earn guide title should be action-oriented and concise');
assert.ok(earnGuide.content.includes('【提交上漂】') && earnGuide.content.includes('【完成赠书】') && earnGuide.content.includes('【取消说明】') && earnGuide.content.includes('【上漂频率】'), 'publish earn guide should use clear visual sections');
assert.ok(Array.isArray(earnGuide.sections) && earnGuide.sections.length === 4 && earnGuide.sections.every((section) => Array.isArray(section.items) && section.items.length), 'publish earn guide should expose structured sections for real line breaks');
assert.ok(!earnGuide.content.includes('从书架选一本书提交上漂，审核通过后即可获得公益积分：'), 'publish earn guide should remove the old long intro sentence');
assert.ok(poolJson.usingComponents && poolJson.usingComponents['earn-point-guide-modal'], 'pool page should register the shared earn guide modal component');
assert.ok(poolWxml.includes('earn-point-guide-modal') && poolWxml.includes('showEarnGuideModal') && poolWxml.includes('bind:confirm="confirmEarnPointGuide"'), 'pool page should render the shared earn guide modal component');
assert.ok(earnGuideComponentWxml.includes('wx:for="{{guide.sections}}"') && earnGuideComponentWxml.includes('wx:for="{{item.items}}"'), 'earn guide modal should render section and item lines as separate nodes');
assert.ok(earnGuideComponentWxss.includes('.earn-guide-section') && earnGuideComponentWxss.includes('.earn-guide-line'), 'earn guide modal should style sections and lines separately');

assert.ok(poolWxml.includes('src="{{item.book.cover}}"'), 'pool list should use recognized book cover from data source');
assert.ok(!poolWxml.includes('item.images[0] || item.book.cover'), 'pool list should not use user shot image as card cover');
assert.ok(!poolWxml.includes('stat-row') && !poolWxml.includes('stat-card'), 'pool home should not render the top stats row');
const commonWxss = read('miniprogram/styles/common.wxss');
const poolIndexWxss = read('miniprogram/pages/pool/index.wxss');
assert.ok(commonWxss.includes('minmax(0, 1fr)'), 'two-column grids should prevent content from stretching one track wider');
assert.ok(commonWxss.includes('.grid-book-card') && commonWxss.includes('min-width: 0'), 'pool cards should shrink within equal grid columns');

assert.ok(detailWxml.includes('mode="aspectFit"') && detailWxml.includes('shot-frame'), 'pool detail top carousel should adapt user shot images');
assert.ok(detailWxss.includes('.shot-frame') && detailWxss.includes('background: #fff'), 'pool detail image frame should fit shots on a clean background');
assert.ok(detailWxml.includes('内容介绍') && detailWxml.includes('基础信息'), 'pool detail should show book intro and basic metadata');
assert.ok(detailWxml.includes('summary-clamped') && detailWxml.includes('toggleSummary'), 'pool detail should fold long summaries with expand toggle');
assert.ok(detailJs.includes('buildSummaryView') && detailJs.includes('SUMMARY_FOLD_THRESHOLD'), 'pool detail should compute summary fold state');
assert.ok(detailWxml.includes('item.book.isbn') && detailWxml.includes('item.book.publisher'), 'pool detail should expose ISBN and publisher');

assert.ok(claimJs.includes('chooseWxAddress') && claimJs.includes('wx.chooseAddress'), 'claim page should read WeChat address');
assert.ok(claimJs.includes('api.addAddress') && claimJs.includes('provinceName'), 'claim page should persist selected WeChat address for claim');
assert.ok(claimWxml.includes('微信地址') && claimWxml.includes('chooseWxAddress'), 'claim page should expose WeChat address action');

assert.ok(poolWxml.includes('上漂赠书') && !poolWxml.includes('发起漂流赠出') && poolJs.includes('goPublish'), 'pool page should provide concise publish drift entry');
assert.ok(publishJs.includes('toggleBookSelection') && publishJs.includes('shelfBooks'), 'publish page should allow choosing shelf books when no bookId is passed');
assert.ok(publishWxml.includes('选择要赠出的书') && publishWxml.includes('toggleBookSelection'), 'publish page should render a shelf-book picker');

assert.ok(appJson.pages.includes('pages/drift/guide'), 'drift guide page should be registered');
assert.ok(poolWxml.includes('漂流广场') && poolWxml.includes('玩法介绍') && poolWxml.includes('bindtap="goGuide"'), 'pool header should expose drift guide sign beside title');
assert.ok(poolWxss.includes('justify-content: flex-start') && poolWxss.includes('guide-entry') && poolWxss.includes('rotate(-2deg)'), 'pool guide entry should sit next to title as a signboard');
assert.ok(poolJs.includes('goGuide()') && poolJs.includes('/pages/drift/guide'), 'pool page should navigate to drift guide');
assert.ok(poolJs.includes('onShareAppMessage') && poolJs.includes('/pages/pool/index'), 'pool page should expose share path');
assert.ok(poolJs.includes('onCoverError'), 'pool list should recover failed cover loads');
assert.ok(apiUtils.includes('enrichPoolCovers') && apiUtils.includes('applyCoverUpdates'), 'frontend api should cache remote covers before returning pool data');
assert.ok(apiIndex.includes("'books.cacheRemoteCover'"), 'api should expose server-side remote cover cache route');
assert.ok(read('miniprogram/utils/coverRefresh.js').includes("'books.cacheRemoteCover'"), 'remote cover refresh should use server-side cache route');
assert.ok(guideWxml.includes('让一本书，去遇见下一个人') && guideWxml.includes('少一点负担，多一本好书'), 'guide should use emotional and receiver-value copy');
assert.ok(guideWxml.includes('闲置变成被需要') && guideWxml.includes('分享被看见'), 'guide should state giver emotional value');
assert.ok(guideWxml.includes('把书放入漂流池') && guideWxml.includes('等待有缘人申请接漂') && guideWxml.includes('完成一次温柔传递'), 'guide should explain the three-step flow');
assert.ok(guideWxml.includes('公益积分') && guideWxml.includes('发货前可取消') && guideWxml.includes('完成后结算'), 'guide should include soft rule explanation');
assert.ok(guideJs.includes('goPool()') && guideJs.includes('wx.switchTab') && guideWxml.includes('去看看正在漂流的书'), 'guide should provide a pool call-to-action');
assert.ok(guideWxss.includes('.hero-card') && guideWxss.includes('.step-card'), 'guide should include clear visual structure');

console.log('pool experience contract ok');
