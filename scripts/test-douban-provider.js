const assert = require('assert');
const {
  parseSuggestItems,
  parseSubjectPage,
  normalizeDoubanCover,
} = require('../cloudfunctions/api/lib/bookProviders/douban');

const suggestHtml = `
<script>
window.__DATA__ = {"items":[
  {"tpl_name":"search_subject","id":1019568,"title":"三国演义（全二册）","url":"https://book.douban.com/subject/1019568/","cover_url":"https://img3.doubanio.com/view/subject/m/public/s1024407.jpg","abstract":"[明] 罗贯中 / 人民文学出版社 / 1998-05 / 39.50元"},
  {"tpl_name":"search_more","url":"https://book.douban.com/series/search?q=三国演义"},
  {"tpl_name":"search_subject","id":1483894,"title":"三国演义","url":"https://book.douban.com/subject/1483894/","cover_url":"https://img2.doubanio.com/view/subject/m/public/s1661101.jpg","abstract":"罗贯中 / 岳麓书社 / 1986-6-1 / 13.0"}
]};
</script>`;

const items = parseSuggestItems(suggestHtml);
assert.strictEqual(items.length, 2);
assert.strictEqual(items[0].id, '1019568');
assert.strictEqual(items[0].title, '三国演义（全二册）');
assert.strictEqual(items[0].author, '[明] 罗贯中');
assert.strictEqual(items[0].publisher, '人民文学出版社');
assert.strictEqual(items[0].pubDate, '1998-05');
assert.strictEqual(items[0].coverRemote, 'https://img3.doubanio.com/view/subject/l/public/s1024407.jpg');

const subjectHtml = `
<div id="mainpic"><a class="nbg" href="https://img3.doubanio.com/view/subject/l/public/s1024407.jpg"></a></div>
<div id="info">
<span class="pl"> 作者</span>: <a>[明] 罗贯中</a><br/>
<span class="pl">出版社:</span> 人民文学出版社<br/>
<span class="pl">出版年:</span> 1998-05<br/>
<span class="pl">ISBN:</span> 9787020008728<br/>
</div>
<span>内容简介</span>
<div class="intro"><p>《三国演义》是我国小说史上最著名的长篇章回体历史小说。</p></div>`;

const detail = parseSubjectPage(subjectHtml);
assert.strictEqual(detail.isbn, '9787020008728');
assert.strictEqual(detail.author, '[明] 罗贯中');
assert.strictEqual(detail.publisher, '人民文学出版社');
assert.strictEqual(detail.pubDate, '1998-05');
assert.ok(detail.summary.includes('三国演义'));
assert.strictEqual(normalizeDoubanCover('https://img3.doubanio.com/view/subject/s/public/s1024407.jpg'), 'https://img3.doubanio.com/view/subject/l/public/s1024407.jpg');

console.log('douban provider ok');
