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

const SHELF_CATEGORY_LABELS = {
  child: '童书',
  literature: '文学',
  business: '经管',
  other: '其他',
};

const CLC_TO_SHELF_KEY = {
  A: 'literature',
  B: 'literature',
  C: 'literature',
  D: 'literature',
  E: 'literature',
  F: 'business',
  G: 'literature',
  H: 'literature',
  I: 'literature',
  J: 'literature',
  K: 'literature',
  N: 'business',
  O: 'business',
  P: 'business',
  Q: 'business',
  R: 'business',
  S: 'business',
  T: 'business',
  U: 'business',
  V: 'business',
  X: 'business',
  Z: 'other',
};

const CLASSIC_LITERATURE_RE = /红楼梦|水浒传|三国演义|西游记|儒林外史|聊斋志异|牡丹亭|桃花扇|长生殿|金瓶梅/;
const CHILD_PICTURE_BOOK_RE = /海底\d*层|10000层|100层|一万层|岩井俊雄/;
const CHILD_BOOK_RE = /屁屁侦探|神奇校车|不一样的卡梅拉|小猪佩奇|米小圈|故宫里的大怪兽|猫武士|可怕的科学|查理九世|笑猫日记|沈石溪|杨红樱|大黑狗|月亮的味道|猜猜我有多爱你|萝卜回来了|叶罗丽|好朋友|好疼呀|好疼|绘本|童话|童谣|注音|拼音|亲子共读|少儿|儿童|童书|幼儿|低幼|0-3|3-6|6-9|9-12|海底\d*层|10000层|100层|一万层|岩井俊雄/;
const CHILD_CLC_RE = /^I28/i;
const FOREIGN_CHILD_CLC_RE = /^I712/i;
const CHILD_PUBLISHER_RE = /少年儿童|明天出版社|接力出版社|21世纪出版社|河北少年儿童|湖南少年儿童|海豚出版社|新蕾出版社|信谊|蒲蒲兰|爱心树|国开童媒|安徽少年儿童|浙江少年儿童|江苏少年儿童|北京少年儿童|长江少年儿童|广西师范大学.*童|外研社.*少儿|天天出版社|低幼|童书|绘本馆|连环画/;
const CATEGORY_ALIAS_TO_KEY = {
  child: 'child',
  children: 'child',
  literature: 'literature',
  business: 'business',
  other: 'other',
  文学: 'literature',
  小说: 'literature',
  社科: 'literature',
  历史: 'literature',
  艺术: 'literature',
  语言: 'literature',
  哲学: 'literature',
  政法: 'literature',
  文教: 'literature',
  经济管理: 'business',
  经管: 'business',
  科普: 'business',
  科学: 'business',
  技术: 'business',
  医药: 'business',
  童书: 'child',
  图书: 'other',
  生活: 'other',
  未分类: 'other',
  social: 'literature',
  science: 'business',
  art: 'literature',
  life: 'other',
};
const CATEGORY_OVERRIDES_BY_ISBN = {
  9787540587850: 'literature',
  9787540487850: 'literature',
};

function isClcCode(value) {
  const raw = String(value || '').trim();
  if (!raw) return false;
  return /^[A-Z]\d/.test(raw) || /^[A-Z]{2}\d/i.test(raw);
}

function extractSourceClc(book = {}) {
  const explicit = String(book.sourceClc || '').trim();
  if (isClcCode(explicit)) return explicit;
  const raw = String(book.category || '').trim();
  if (isClcCode(raw)) return raw;
  return '';
}

function buildBookSignals(book = {}) {
  const sourceClc = extractSourceClc(book);
  const rawCategory = String(book.category || '').trim();
  const metadataText = [book.title, book.summary, book.ageRange, book.publisher].filter(Boolean).join(' ');
  return { sourceClc, rawCategory, metadataText };
}

function shelfResult(key) {
  return { key, label: SHELF_CATEGORY_LABELS[key] || SHELF_CATEGORY_LABELS.other };
}

function clcShortName(value) {
  const letter = String(value || '').trim().charAt(0).toUpperCase();
  return CLC_SHORT_NAMES[letter] || '';
}

function isChildClc(value) {
  const raw = String(value || '').trim();
  return CHILD_CLC_RE.test(raw) || FOREIGN_CHILD_CLC_RE.test(raw);
}

function clcShelfCategoryKey(value) {
  const raw = String(value || '').trim();
  if (isChildClc(raw)) return 'child';
  const letter = raw.charAt(0).toUpperCase();
  return CLC_TO_SHELF_KEY[letter] || 'other';
}

function childPublisherMatch(text = '') {
  return CHILD_PUBLISHER_RE.test(text);
}

function shelfCategoryFromMetadata(text = '') {
  if (/童书|绘本|儿童|亲子|0-3|3-6|6-9|9-12/.test(text) || CHILD_PICTURE_BOOK_RE.test(text)) return 'child';
  if (/文学|小说|诗|散文|名著|传记/.test(text)) return 'literature';
  if (/社科|社会|历史|心理|哲学|政治|法律|教育|地理|艺术|设计|摄影|音乐|美术/.test(text)) return 'literature';
  if (/经管|经济|金融|商业|管理|创业|理财/.test(text)) return 'business';
  if (/科普|科学|技术|计算机|互联网|数学|物理|化学|生物|医学|工业/.test(text)) return 'business';
  if (/生活|旅行|美食|家居|健康|育儿/.test(text)) return 'other';
  return '';
}

function resolveShelfCategory(book = {}) {
  const isbn = String(book.isbn || '').replace(/[^0-9X]/gi, '');
  if (CATEGORY_OVERRIDES_BY_ISBN[isbn]) {
    return shelfResult(CATEGORY_OVERRIDES_BY_ISBN[isbn]);
  }

  const { sourceClc, rawCategory, metadataText } = buildBookSignals(book);

  if (CLASSIC_LITERATURE_RE.test(metadataText)) {
    return shelfResult('literature');
  }

  if (sourceClc && isChildClc(sourceClc)) {
    return shelfResult('child');
  }

  if (CHILD_BOOK_RE.test(metadataText) || childPublisherMatch(metadataText)) {
    return shelfResult('child');
  }

  if (sourceClc) {
    return shelfResult(clcShelfCategoryKey(sourceClc));
  }

  if (isClcCode(rawCategory)) {
    return shelfResult(clcShelfCategoryKey(rawCategory));
  }

  const fromMetadata = shelfCategoryFromMetadata(metadataText);
  if (fromMetadata) {
    return shelfResult(fromMetadata);
  }

  if (CATEGORY_ALIAS_TO_KEY[rawCategory]) {
    return shelfResult(CATEGORY_ALIAS_TO_KEY[rawCategory]);
  }

  if (Object.values(SHELF_CATEGORY_LABELS).includes(rawCategory)) {
    const key = Object.keys(SHELF_CATEGORY_LABELS).find((entry) => SHELF_CATEGORY_LABELS[entry] === rawCategory) || 'other';
    return { key, label: rawCategory };
  }

  return shelfResult('other');
}

function resolveShelfBookClass(book = {}) {
  return resolveShelfCategory(book).key;
}

function normalizeBookCategory(category, book = {}) {
  return resolveShelfCategory({ ...book, category }).label;
}

module.exports = {
  CLC_SHORT_NAMES,
  SHELF_CATEGORY_LABELS,
  normalizeBookCategory,
  resolveShelfCategory,
  resolveShelfBookClass,
  extractSourceClc,
  isClcCode,
  clcShortName,
};
