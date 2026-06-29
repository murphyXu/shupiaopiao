const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const navBarJs = read('miniprogram/components/custom-nav-bar/index.js');
const navBarWxml = read('miniprogram/components/custom-nav-bar/index.wxml');
const navBarWxss = read('miniprogram/components/custom-nav-bar/index.wxss');
const systemJs = read('miniprogram/utils/system.js');

const tabPages = [
  { path: 'miniprogram/pages/pool/index', title: '书漂漂' },
  { path: 'miniprogram/pages/shelf/index', title: '书架' },
  { path: 'miniprogram/pages/mine/index', title: '我的' },
];

assert.ok(systemJs.includes('navBarHeight'), 'system metrics should expose navBarHeight for custom nav alignment');
assert.ok(navBarJs.includes('getSystemMetrics'), 'custom nav bar should read system metrics');
assert.ok(navBarWxml.includes('custom-nav-bar__title') && navBarWxml.includes('{{title}}'), 'custom nav bar should render a centered title');
assert.ok(navBarWxss.includes('position: fixed') && navBarWxss.includes('justify-content: center'), 'custom nav bar should stay fixed and center the title');
assert.ok(navBarWxss.includes('background: #ffffff'), 'custom nav bar should use a solid white background when content scrolls underneath');

tabPages.forEach(({ path: pagePath, title }) => {
  const json = JSON.parse(read(`${pagePath}.json`));
  const wxml = read(`${pagePath}.wxml`);

  assert.strictEqual(json.navigationStyle, 'custom', `${pagePath} should keep custom navigation`);
  assert.ok(json.usingComponents && json.usingComponents['custom-nav-bar'], `${pagePath} should register custom-nav-bar`);
  assert.ok(wxml.includes(`<custom-nav-bar title="${title}"`), `${pagePath} should render tab nav title ${title}`);
  assert.strictEqual(json.navigationBarTitleText, title, `${pagePath} json title should match ${title}`);
});

console.log('tab nav title contract ok');
