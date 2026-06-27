const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const shareJs = read('miniprogram/utils/share.js');
const poolJs = read('miniprogram/pages/pool/index.js');
const mineJs = read('miniprogram/pages/mine/index.js');
const mineWxml = read('miniprogram/pages/mine/index.wxml');
const shelfJs = read('miniprogram/pages/shelf/index.js');
const bookJs = read('miniprogram/pages/book/detail.js');
const poolDetailJs = read('miniprogram/pages/pool/detail.js');

assert.ok(shareJs.includes('闲置书送出去，免费童书接回家'), 'pool share title should appeal to givers and receivers');
assert.ok(shareJs.includes('清书架赠闲置，童书绘本免费漂'), 'mine invite title should mention clearing shelf and children books');
assert.ok(shareJs.includes('书架闲置清出去，童书绘本免费漂过来'), 'mine invite desc should be concise and dual-audience');
assert.ok(shareJs.includes('/assets/share/share-cover.jpg'), 'default share image should use compressed cover asset');
assert.ok(fs.existsSync(path.join(root, 'miniprogram/assets/share/share-cover.jpg')), 'share cover image file should exist');

assert.ok(poolJs.includes("require('../../utils/share')") && poolJs.includes('poolShare'), 'pool page should use centralized share helper');
assert.ok(mineJs.includes('mineInviteShare'), 'mine page should use centralized invite share helper');
assert.ok(mineWxml.includes('书架闲置清出去，童书绘本免费漂过来'), 'mine invite block should show optimized desc');
assert.ok(shelfJs.includes('shelfShare'), 'shelf page should use centralized shelf share helper');
assert.ok(bookJs.includes('bookShare'), 'book detail should use centralized book share helper');
assert.ok(poolDetailJs.includes('driftShare'), 'pool detail should support sharing a drift item');
assert.ok(poolJs.includes('share-cover-preload') || read('miniprogram/pages/pool/index.wxml').includes('share-cover-preload'), 'pool page should preload share cover asset for packaging');
assert.ok(shareJs.includes('preloadShareCover') === false, 'share helper should not preload on app launch');
assert.ok(read('project.config.json').includes('assets/share/**'), 'project config should force-include share assets');

const share = require('../miniprogram/utils/share');
const pool = share.poolShare('u1');
assert.strictEqual(pool.title, '闲置书送出去，免费童书接回家');
assert.ok(pool.path.includes('/pages/pool/index?inviterId=u1'));
assert.strictEqual(pool.imageUrl, '/assets/share/share-cover.jpg');

const drift = share.driftShare({ title: '小王子', driftId: 'd1', inviterId: 'u1', cover: 'cloud://x' });
assert.strictEqual(drift.title, '免费接漂《小王子》，邮费到付');
assert.strictEqual(drift.imageUrl, '/assets/share/share-cover.jpg');

console.log('test-share-copy-contract: ok');
