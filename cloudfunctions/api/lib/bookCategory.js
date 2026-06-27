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
  social: '社科',
  business: '经管',
  science: '科普',
  life: '生活',
  art: '艺术',
  other: '其他',
};

const CLC_TO_SHELF_KEY = {
  A: 'social',
  B: 'social',
  C: 'social',
  D: 'social',
  E: 'social',
  F: 'business',
  G: 'social',
  H: 'social',
  I: 'literature',
  J: 'art',
  K: 'social',
  N: 'science',
  O: 'science',
  P: 'science',
  Q: 'science',
  R: 'science',
  S: 'science',
  T: 'science',
  U: 'science',
  V: 'science',
  X: 'science',
  Z: 'other',
};

const CLASSIC_LITERATURE_RE = /红楼梦|水浒传|三国演义|西游记|儒林外史|聊斋志异|牡丹亭|桃花扇|长生殿|金瓶梅/;
const CHILD_BOOK_RE = /屁屁侦探|神奇校车|不一样的卡梅拉|小猪佩奇|米小圈|故宫里的大怪兽|猫武士|可怕的科学|查理九世|笑猫日记|沈石溪|杨红樱|大黑狗|月亮的味道|猜猜我有多爱你|萝卜回来了|叶罗丽|好朋友|好疼呀|好疼|绘本|童话|童谣|注音|拼音|亲子共读|少儿|儿童|童书|幼儿|低幼|0-3|3-6|6-9|9-12/;
const CHILD_CLC_RE = /^I28/i;
const CHILD_PUBLISHER_RE = /少年儿童|明天出版社|接力出版社|21世纪出版社|河北少年儿童|湖南少年儿童|海豚出版社|新蕾出版社|信谊|蒲蒲兰|爱心树|国开童媒|安徽少年儿童|浙江少年儿童|江苏少年儿童|北京少年儿童|长江少年儿童|广西师范大学.*童|外研社.*少儿|天天出版社|低幼|童书|绘本馆|连环画/;
const CATEGORY_ALIAS_TO_KEY = {
  文学: 'literature',
  小说: 'literature',
  社科: 'social',
  历史: 'social',
  经济管理: 'business',
  科普: 'science',
  童书: 'child',
  图书: 'other',
  未分类: 'other',
};
const CATEGORY_OVERRIDES_BY_ISBN = {
  9787540587850: 'social',
  9787540487850: 'social',
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

function clcShelfCategoryKey(value) {
  const raw = String(value || '').trim();
  if (CHILD_CLC_RE.test(raw)) return 'child';
  const letter = raw.charAt(0).toUpperCase();
  return CLC_TO_SHELF_KEY[letter] || 'other';
}

function childPublisherMatch(text = '') {
  return CHILD_PUBLISHER_RE.test(text);
}

function shelfCategoryFromMetadata(text = '') {
  if (/童书|绘本|儿童|亲子|0-3|3-6|6-9|9-12/.test(text)) return 'child';
  if (/文学|小说|诗|散文|名著|传记/.test(text)) return 'literature';
  if (/社科|社会|历史|心理|哲学|政治|法律|教育|地理/.test(text)) return 'social';
  if (/经管|经济|金融|商业|管理|创业|理财/.test(text)) return 'business';
  if (/科普|科学|自然|技术|计算机|互联网|数学|物理|化学|生物|医学|工业/.test(text)) return 'science';
  if (/艺术|设计|摄影|音乐|美术/.test(text)) return 'art';
  if (/生活|旅行|美食|家居|健康|育儿/.test(text)) return 'life';
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

  if (sourceClc && CHILD_CLC_RE.test(sourceClc)) {
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
