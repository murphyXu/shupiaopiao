/** 内置书目（不依赖外网 Open Library，体验版/云函数 3s 内可用） */
const BOOK_CATALOG = [
  { isbn: '9787533256739', title: '猜猜我有多爱你', author: '山姆·麦克布雷尼', summary: '经典亲子绘本，表达爱的温暖故事。', category: '绘本', ageRange: '0-3' },
  { isbn: '9787506282174', title: '好饿的毛毛虫', author: '艾瑞·卡尔', summary: '洞洞书经典，帮助孩子认识数字和星期。', category: '绘本', ageRange: '0-3' },
  { isbn: '9787533251413', title: '我爸爸', author: '安东尼·布朗', summary: '描绘爸爸形象的温暖绘本。', category: '绘本', ageRange: '3-6' },
  { isbn: '9787533251420', title: '我妈妈', author: '安东尼·布朗', summary: '描绘妈妈形象的温暖绘本。', category: '绘本', ageRange: '3-6' },
  { isbn: '9787533251437', title: '大卫，不可以', author: '大卫·香农', summary: '调皮大卫的成长故事。', category: '绘本', ageRange: '3-6' },
  { isbn: '9787506282181', title: '爷爷一定有办法', author: '菲比·吉尔曼', summary: '祖孙情深的经典绘本。', category: '绘本', ageRange: '3-6' },
  { isbn: '9787533251444', title: '逃家小兔', author: '玛格丽特·怀兹·布朗', summary: '母子之间爱的追逐游戏。', category: '绘本', ageRange: '0-3' },
  { isbn: '9787506282198', title: '彩虹色的花', author: '麦克·格雷涅茨', summary: '关于分享与生命的绘本。', category: '绘本', ageRange: '3-6' },
  { isbn: '9787111544937', title: '小王子', author: '圣埃克苏佩里', summary: '永恒的童话经典。', category: '文学', ageRange: '9-12' },
  { isbn: '9787020002207', title: '西游记', author: '吴承恩', summary: '中国古典四大名著之一。', category: '文学', ageRange: '9-12' },
  { isbn: '9787532747735', title: '夏洛的网', author: 'E·B·怀特', summary: '关于友谊与生命的儿童文学。', category: '文学', ageRange: '6-9' },
  { isbn: '9787506282204', title: '神奇校车', author: '乔安娜·柯尔', summary: '科普启蒙经典系列。', category: '科普', ageRange: '6-9' },
  { isbn: '9787544258560', title: '哈利·波特与魔法石', author: 'J.K.罗琳', summary: '魔法世界冒险故事。', category: '文学', ageRange: '9-12' },
  { isbn: '9787539172768', title: '不一样的卡梅拉', author: '克利斯提昂·约里波瓦', summary: '勇敢小鸡卡梅拉的奇幻冒险。', category: '绘本', ageRange: '3-6' },
  { isbn: '9787533254368', title: '鳄鱼怕怕 牙医怕怕', author: '五味太郎', summary: '幽默绘本，缓解看牙医恐惧。', category: '绘本', ageRange: '3-6' },
  { isbn: '9787505615556', title: '鼠小弟', author: '中江嘉男', summary: '小老鼠与朋友的温馨故事。', category: '绘本', ageRange: '0-3' },
  { isbn: '9787535046123', title: '花婆婆', author: '芭芭拉·库尼', summary: '传递美好与希望的绘本。', category: '绘本', ageRange: '3-6' },
  { isbn: '9787533258687', title: '生气汤', author: '贝西·艾芙瑞', summary: '帮助孩子管理情绪的绘本。', category: '绘本', ageRange: '3-6' },
  { isbn: '9787544727099', title: '窗边的小豆豆', author: '黑柳彻子', summary: '巴学园里的童年故事。', category: '文学', ageRange: '6-9' },
  { isbn: '9787532748388', title: '草房子', author: '曹文轩', summary: '成长主题儿童文学经典。', category: '文学', ageRange: '9-12' },
];

const byIsbnMap = new Map();
BOOK_CATALOG.forEach((b) => {
  byIsbnMap.set(b.isbn, b);
});

function normalizeIsbn(raw) {
  return String(raw || '').replace(/[^0-9X]/gi, '');
}

function isValidIsbn(isbn) {
  const clean = normalizeIsbn(isbn);
  return clean.length >= 10 && clean.length <= 13;
}

function findInCatalog(isbn) {
  const clean = normalizeIsbn(isbn);
  if (!clean) return null;
  if (byIsbnMap.has(clean)) return { ...byIsbnMap.get(clean), isbn: clean };
  return null;
}

function searchCatalog(keyword, limit = 20) {
  const kw = String(keyword || '').trim().toLowerCase();
  if (!kw) return [];
  return BOOK_CATALOG.filter((b) =>
    b.title.toLowerCase().includes(kw)
    || b.author.toLowerCase().includes(kw)
    || b.isbn.includes(kw)
  ).slice(0, limit).map((b) => ({ ...b, isbn: b.isbn, cover: `local:${b.isbn}` }));
}

function stubForIsbn(isbn) {
  const clean = normalizeIsbn(isbn);
  if (!isValidIsbn(clean)) return null;
  return {
    isbn: clean,
    title: `图书（${clean.slice(-6)}）`,
    author: '待补充',
    summary: '扫码录入的图书，可在详情中补充信息。',
    category: '童书',
    ageRange: '',
    cover: `local:${clean}`,
  };
}

module.exports = {
  BOOK_CATALOG,
  normalizeIsbn,
  isValidIsbn,
  findInCatalog,
  searchCatalog,
  stubForIsbn,
};
