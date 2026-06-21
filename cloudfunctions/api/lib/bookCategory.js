const CLC_SHORT_NAMES = {
  A: '政治',
  B: '哲学',
  C: '社科',
  D: '政法',
  E: '军事',
  F: '经管',
  G: '文教',
  H: '语言',
  I: '文学',
  J: '艺术',
  K: '历史',
  N: '科普',
  O: '科普',
  P: '科普',
  Q: '科普',
  R: '医药',
  S: '农业',
  T: '技术',
  U: '交通',
  V: '航空',
  X: '环境',
  Z: '综合',
};

const CLASSIC_LITERATURE_RE = /红楼梦|水浒传|三国演义|西游记|儒林外史|聊斋志异|牡丹亭|桃花扇|长生殿|金瓶梅/;
const CHILD_BOOK_RE = /屁屁侦探|神奇校车|不一样的卡梅拉|小猪佩奇|米小圈|故宫里的大怪兽|猫武士|可怕的科学|查理九世|笑猫日记|沈石溪|杨红樱|少儿|儿童|童书|绘本|亲子|幼儿|0-3|3-6|6-9|9-12/;
const CATEGORY_OVERRIDES_BY_ISBN = {
  9787540587850: '社科',
  9787540487850: '社科',
};

function isClcCode(value) {
  return /^[A-Z][0-9]/i.test(String(value || '').trim());
}

function clcShortName(value) {
  const letter = String(value || '').trim().charAt(0).toUpperCase();
  return CLC_SHORT_NAMES[letter] || '';
}

function normalizeBookCategory(category, book = {}) {
  const raw = String(category || '').trim();
  const isbn = String(book.isbn || '').replace(/[^0-9X]/gi, '');
  if (CATEGORY_OVERRIDES_BY_ISBN[isbn]) return CATEGORY_OVERRIDES_BY_ISBN[isbn];
  const text = [raw, book.title, book.summary, book.ageRange].filter(Boolean).join(' ');
  if (CLASSIC_LITERATURE_RE.test(text)) return '文学';

  if (CHILD_BOOK_RE.test(text)) return '童书';
  if (isClcCode(raw)) return clcShortName(raw) || '图书';

  if (/文学|小说|诗|散文|名著/.test(text)) return '文学';
  if (/经管|经济|金融|商业|管理|创业|理财/.test(text)) return '经管';
  if (/社科|社会|心理|哲学|教育/.test(text)) return '社科';
  if (/历史|传记|地理/.test(text)) return '历史';
  if (/科普|科学|自然|技术|计算机|互联网|数学|物理|化学|生物/.test(text)) return '科普';
  if (/艺术|设计|摄影|音乐|美术/.test(text)) return '艺术';
  if (/生活|旅行|美食|家居|健康|育儿/.test(text)) return '生活';

  return raw || '图书';
}

module.exports = {
  CLC_SHORT_NAMES,
  normalizeBookCategory,
  isClcCode,
  clcShortName,
};
