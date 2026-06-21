const { normalizeIsbn } = require('./bookCatalog');

const THEMES = [
  { key: 'family', label: '亲情陪伴', audience: 'child', ageRange: '3-6', keywords: ['爸爸', '妈妈', '爷爷', '家人', '亲情', '陪伴', '我爸爸', '我妈妈'], hook: '家里最常被翻烂的，往往不是道理最大的书，而是孩子能把自己和大人都放进去的故事。' },
  { key: 'emotion', label: '情绪管理', audience: 'child', ageRange: '3-6', keywords: ['情绪', '生气', '害怕', '哭', '焦虑', '勇敢', '生气汤'], hook: '孩子闹情绪时，讲道理常常太晚了。提前读几本，反而能在关键时候省很多劲。' },
  { key: 'bedtime', label: '睡前共读', audience: 'child', ageRange: '0-6', keywords: ['睡前', '晚安', '兔', '月亮', '猜猜我有多爱你', '逃家小兔'], hook: '睡前书不用追求信息量，能让孩子慢下来、愿意靠近你，就已经很值。' },
  { key: 'picture', label: '高分绘本', audience: 'child', ageRange: '0-6', keywords: ['绘本', '图画书', '亲子共读', '大卫', '我爸爸', '我妈妈', '花婆婆'], hook: '绘本不是低龄专属。图画里藏着节奏、情绪和幽默，大人也能读出第二层。' },
  { key: 'science', label: '科普启蒙', audience: 'child', ageRange: '6-9', keywords: ['科普', '科学', '神奇校车', '自然', '宇宙', '身体', '为什么'], hook: '好科普不是把答案塞给孩子，而是让他继续追问：那后来呢？为什么？' },
  { key: 'growth', label: '成长独立', audience: 'child', ageRange: '6-12', keywords: ['成长', '独立', '上学', '勇气', '草房子', '窗边的小豆豆'], hook: '成长书不要只讲优秀，也要容得下胆小、犯错和慢慢来。' },
  { key: 'classic', label: '文学经典', audience: 'adult', ageRange: '全年龄', keywords: ['经典', '文学', '小说', '三国演义', '小王子', '文学经典', '名著'], hook: '经典不一定要端着读。找一个能进去的切口，比硬啃目录有效得多。' },
  { key: 'novel', label: '小说入坑', audience: 'adult', ageRange: '成人', keywords: ['小说', '文学', '长篇', '短篇', '故事', '虚构', '叙事'], hook: '好小说会让人暂时离开现实，又带着一点新的眼光回来。' },
  { key: 'mystery', label: '悬疑推理', audience: 'adult', ageRange: '成人', keywords: ['悬疑', '推理', '犯罪', '侦探', '谜案', '东野圭吾', '阿加莎'], hook: '推理书最迷人的地方，不只是答案，而是一路被作者牵着走的紧张感。' },
  { key: 'business', label: '商业经管', audience: 'adult', ageRange: '成人', keywords: ['经管', '商业', '管理', '创业', '增长', '产品', '组织', '财务'], hook: '经管书别贪多，能把一个判断模型用到工作里，就已经回本。' },
  { key: 'psychology', label: '心理自洽', audience: 'adult', ageRange: '成人', keywords: ['心理', '自洽', '情绪', '关系', '亲密关系', '疗愈', '内耗'], hook: '心理类书不是让人立刻变好，而是先知道自己为什么总卡在同一个地方。' },
  { key: 'history', label: '历史现场', audience: 'adult', ageRange: '成人', keywords: ['历史', '中国史', '世界史', '人物', '战争', '制度', '文明'], hook: '历史好看的时候，像站在一个很远的现场，看人怎么做选择。' },
  { key: 'biography', label: '人物传记', audience: 'adult', ageRange: '成人', keywords: ['传记', '人物', '人生', '女性', '企业家', '作家', '科学家'], hook: '传记的价值不在鸡血，而在看到一个人怎么穿过自己的时代。' },
  { key: 'female', label: '女性写作', audience: 'adult', ageRange: '成人', keywords: ['女性', '女性写作', '她们', '成长', '家庭', '职场', '身体'], hook: '女性写作常常把那些说不清的日常，写得又准又狠。' },
  { key: 'poetry', label: '诗歌散文', audience: 'adult', ageRange: '成人', keywords: ['诗', '散文', '随笔', '生活', '自然', '文字', '审美'], hook: '诗和散文适合放慢读，不一定追求读懂，先让句子在心里停一下。' },
  { key: 'workplace', label: '职场成长', audience: 'adult', ageRange: '成人', keywords: ['职场', '沟通', '效率', '表达', '写作', '汇报', '工作'], hook: '职场书要挑能落地的，读完能改一个动作，比收藏十个方法更实际。' },
  { key: 'finance', label: '理财认知', audience: 'adult', ageRange: '成人', keywords: ['理财', '投资', '财商', '基金', '股票', '经济', '金钱'], hook: '理财书先看底层常识，别一上来就追技巧，钱的事最怕心急。' },
  { key: 'life', label: '生活方式', audience: 'adult', ageRange: '成人', keywords: ['生活', '独处', '整理', '旅行', '饮食', '家', '日常'], hook: '生活方式类书读得好，会让人想把房间、时间和心情都重新收拾一下。' },
  { key: 'social', label: '社会观察', audience: 'adult', ageRange: '成人', keywords: ['社会', '社会学', '纪实', '城市', '教育', '家庭', '结构'], hook: '社会观察类书能把很多“个人问题”，放回更大的生活现场里看。' },
  { key: 'healing', label: '低压治愈', audience: 'adult', ageRange: '成人', keywords: ['治愈', '低压', '轻松', '睡前', '咖啡', '书店', '日常'], hook: '有些书不负责解决问题，只负责让人今晚先松一口气。' },
];

const SCENES = [
  { key: 'weekend', label: '周末翻书', title: '周末想读点不累的' },
  { key: 'night', label: '夜读', title: '晚上关灯前读几页' },
  { key: 'commute', label: '通勤路上', title: '通勤路上适合读的书' },
  { key: 'rainy-day', label: '下雨天', title: '下雨天窝着看的书' },
  { key: 'bookstore', label: '书店闲逛', title: '书店里容易被忽略的角落' },
  { key: 'new-start', label: '重新开始', title: '想重新整理自己时' },
  { key: 'gift', label: '送礼不踩雷', title: '送书不想显得太用力' },
  { key: 'vacation', label: '假期慢读', title: '假期不赶进度的读法' },
  { key: 'parent-child', label: '亲子共读', title: '陪孩子读，也别忘了自己' },
  { key: 'library', label: '图书馆借阅', title: '去图书馆不知道拿什么' },
];

const TONES = [
  { key: 'note', label: '随手记', opener: '这几本不是那种非读不可的清单，更像某个阶段刚好能接住人的书。' },
  { key: 'friend', label: '朋友安利', opener: '如果朋友问我最近读什么顺手，我会先从这一组里挑。门槛不高，但读完会留下些什么。' },
  { key: 'editor', label: '编辑口吻', opener: '这一组放在一起看，重点不是题材相同，而是它们都能把一个问题讲得有温度。' },
  { key: 'diary', label: '生活日记', opener: '有些书适合在很普通的一天打开。水烧着，窗外有风，读几页就够了。' },
  { key: 'pitfall', label: '踩坑复盘', opener: '以前挑书总想一步到位，后来发现读得下去才最要紧。这组就是按这个标准留下来的。' },
];

const COVER_VARIANTS = Array.from({ length: 60 }, (_, index) => `reading-scene-${String(index + 1).padStart(2, '0')}`);

const THEME_STORY = {
  family: { pain: '有些家里的小别扭', promise: '读完会想抱抱家里人', object: '亲情故事', hook: '把爱说得不肉麻' },
  emotion: { pain: '情绪快要爆掉的时候', promise: '先把那口气接住', object: '情绪书', hook: '不讲大道理，也能松一口气' },
  bedtime: { pain: '晚上越哄越清醒的时候', promise: '把睡前节奏慢慢降下来', object: '睡前书', hook: '适合灯光暗一点时翻' },
  picture: { pain: '只想读点轻一点的时候', promise: '从图画里重新靠近故事', object: '绘本', hook: '大人也会被击中的几页' },
  science: { pain: '孩子一直追问为什么的时候', promise: '把好奇心越读越亮', object: '科普书', hook: '答案之外还有新的问题' },
  growth: { pain: '长大这件事有点慌的时候', promise: '让胆小和犯错都有位置', object: '成长书', hook: '不急着优秀，也可以慢慢来' },
  classic: { pain: '经典名著总是读不进去的时候', promise: '找到一个不硬啃的入口', object: '文学经典', hook: '不是为了完成任务才读' },
  novel: { pain: '现实太吵，想躲进故事里的时候', promise: '跟着人物过另一种人生', object: '小说', hook: '读完会带着一点余温回来' },
  mystery: { pain: '想被一个故事拽住的时候', promise: '一路追到真相背后的人心', object: '悬疑推理', hook: '谜底之外还有后劲' },
  business: { pain: '工作里总觉得判断不够稳的时候', promise: '换一种看问题的方式', object: '经管书', hook: '少一点概念，多一点能用的判断' },
  psychology: { pain: '内耗又开始循环的时候', promise: '看见自己为什么卡住', object: '心理书', hook: '不是治好你，是先理解你' },
  history: { pain: '只记年份会觉得历史很远的时候', promise: '看见人在时代里怎么选择', object: '历史书', hook: '远处的事突然变近了' },
  biography: { pain: '想看一个人怎么穿过低谷的时候', promise: '把人生放回真实的时间里', object: '传记', hook: '不鸡血，但很有支撑感' },
  female: { pain: '很多话说不清又咽不下的时候', promise: '在别人的句子里认出自己', object: '女性写作', hook: '日常里的刺，被写得很准' },
  poetry: { pain: '脑子太满，想让文字慢一点的时候', promise: '让一句话停在心里', object: '诗歌散文', hook: '不必读懂，也能被安静地接住' },
  workplace: { pain: '工作卡在沟通和表达里的时候', promise: '先改一个能落地的小动作', object: '职场书', hook: '读完能马上少绕一点路' },
  finance: { pain: '一谈钱就容易心急的时候', promise: '把常识先放在技巧前面', object: '理财书', hook: '少几个冲动决定就很值' },
  life: { pain: '日子乱到想重新收拾的时候', promise: '把房间、时间和心情理一理', object: '生活方式书', hook: '读完会想动手整理一点什么' },
  social: { pain: '总把问题怪到自己身上的时候', promise: '把个人困惑放回更大的现场', object: '社会观察', hook: '很多事不是你一个人的问题' },
  healing: { pain: '今晚只想先缓一缓的时候', promise: '让人从紧绷里退出来', object: '治愈读物', hook: '不解决所有事，但能陪你过今晚' },
};

const TONE_STORY = {
  note: { angle: '我后来才发现', relation: '像一条随手记下的便签' },
  friend: { angle: '如果朋友问我怎么选', relation: '像坐在对面认真安利' },
  editor: { angle: '把这一组放在一起看', relation: '像一组被仔细排过顺序的稿子' },
  diary: { angle: '某个很普通的晚上', relation: '像日记里突然亮起来的一段' },
  pitfall: { angle: '以前踩过几次坑之后', relation: '像把绕远的路折回来重走' },
};

let cachedPool = null;

function hashText(value) {
  let hash = 0;
  String(value || '').split('').forEach((char) => {
    hash = ((hash << 5) - hash) + char.charCodeAt(0);
    hash |= 0;
  });
  return Math.abs(hash);
}

function normalizeText(value) {
  return String(value || '').toLowerCase().replace(/[\s,，.。:：;；'"“”‘’《》<>【】\[\]()（）\-_=＝/\\|]+/g, '');
}

function coverImageFor(template) {
  return `/assets/booklist-covers/${template}.jpg`;
}

function pickCoverTemplate(theme, scene, toneIndex, themeIndex, sceneIndex) {
  return COVER_VARIANTS[(themeIndex * SCENES.length * TONES.length + sceneIndex * TONES.length + toneIndex) % COVER_VARIANTS.length];
}

function compactTitle(scene, theme, toneIndex, themeIndex, sceneIndex) {
  const story = THEME_STORY[theme.key] || THEME_STORY.life;
  const variants = [
    `${scene.label}：${story.pain}`,
    `${story.object}清单，${scene.label}先看`,
    `${story.hook}｜${scene.label}`,
    `${scene.label}想读${theme.label}`,
    `${theme.label}有后劲的几本｜${scene.label}`,
  ];
  const title = variants[toneIndex % variants.length];
  return title.length > 32 ? `${title.slice(0, 31)}…` : title;
}

function buildOne(tone, theme, scene, index, toneIndex, themeIndex, sceneIndex) {
  const isCurated = themeIndex < 12 && sceneIndex < 2;
  const coverTemplate = pickCoverTemplate(theme, scene, toneIndex, themeIndex, sceneIndex);
  const cardTitle = compactTitle(scene, theme, toneIndex, themeIndex, sceneIndex);
  return {
    id: `gen-${tone.key}-${theme.key}-${scene.key}`,
    title: cardTitle,
    cardTitle,
    description: theme.hook,
    type: 'generated',
    themeKey: theme.key,
    theme: theme.label,
    audience: theme.audience,
    scene: scene.label,
    sceneKey: scene.key,
    tone: tone.label,
    toneKey: tone.key,
    ageRange: theme.ageRange,
    keywords: theme.keywords,
    coverTemplate,
    coverImage: coverImageFor(coverTemplate),
    qualityTier: isCurated ? '精选长文' : '主题变体',
    editorialWeight: isCurated ? 80 : 20,
    toneIndex,
    themeIndex,
    sceneIndex,
    index,
  };
}

function getGeneratedBooklists() {
  if (cachedPool) return cachedPool;
  const list = [];
  TONES.forEach((tone, toneIndex) => {
    THEMES.forEach((theme, themeIndex) => {
      SCENES.forEach((scene, sceneIndex) => {
        list.push(buildOne(tone, theme, scene, list.length, toneIndex, themeIndex, sceneIndex));
      });
    });
  });
  cachedPool = list;
  return cachedPool;
}

function plainBook(book = {}) {
  const raw = book.book || book;
  const isbn = normalizeIsbn(raw.isbn);
  return {
    id: raw.id || raw._id || isbn || '',
    isbn,
    title: raw.title || '',
    author: raw.author || '',
    category: raw.category || '',
    ageRange: raw.ageRange || '',
    summary: raw.summary || '',
    cover: raw.cover || (isbn ? `local:${isbn}` : ''),
    coverRemote: raw.coverRemote || '',
  };
}

function collectSignalText({ shelfBooks = [], signals = {} } = {}) {
  const parts = [];
  shelfBooks.forEach((item) => {
    const book = plainBook(item);
    parts.push(book.title, book.author, book.category, book.ageRange, book.summary);
  });
  (signals.keywords || []).forEach((keyword) => parts.push(keyword));
  (signals.books || []).forEach((book) => {
    const normalized = plainBook(book);
    parts.push(normalized.title, normalized.author, normalized.category, normalized.ageRange);
  });
  (signals.listThemes || []).forEach((theme) => parts.push(theme));
  return normalizeText(parts.filter(Boolean).join(' '));
}

function matchesTheme(item, signalText) {
  if (!signalText) return 0;
  return item.keywords.reduce((score, keyword) => (
    signalText.includes(normalizeText(keyword)) ? score + 1 : score
  ), 0);
}

function scoreItem(item, signalText, hasShelf, hasBehavior) {
  let score = item.editorialWeight;
  const matchScore = matchesTheme(item, signalText);
  if (matchScore) score += matchScore * (hasShelf ? 70 : 48);
  if (!hasShelf && !hasBehavior && ['classic', 'novel', 'business', 'psychology', 'emotion', 'picture', 'healing', 'mystery'].includes(item.themeKey)) {
    score += 90;
  }
  if (item.qualityTier === '精选长文') score += 24;
  score += (hashText(item.id) % 1000) / 1000;
  score -= item.index * 0.00001;
  return score;
}

function buildBooklistFeed({
  page = 1,
  size = 20,
  books = [],
  shelfBooks = [],
  signals = {},
} = {}) {
  const safePage = Math.max(Number(page) || 1, 1);
  const safeSize = Math.min(Math.max(Number(size) || 20, 1), 50);
  const signalText = collectSignalText({ shelfBooks, signals });
  const hasShelf = shelfBooks.length > 0;
  const hasBehavior = !!signalText && !hasShelf;
  const scored = getGeneratedBooklists()
    .map((item) => ({ ...item, score: scoreItem(item, signalText, hasShelf, hasBehavior) }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const start = (safePage - 1) * safeSize;
  const pageItems = scored.slice(start, start + safeSize);
  const usedCovers = new Set();
  function uniqueCover(item) {
    let coverTemplate = item.coverTemplate;
    if (usedCovers.has(coverTemplate)) {
      const seed = hashText(item.id);
      for (let offset = 0; offset < COVER_VARIANTS.length; offset += 1) {
        const candidate = COVER_VARIANTS[(seed + offset) % COVER_VARIANTS.length];
        if (!usedCovers.has(candidate)) {
          coverTemplate = candidate;
          break;
        }
      }
    }
    usedCovers.add(coverTemplate);
    return { coverTemplate, coverImage: coverImageFor(coverTemplate) };
  }
  return {
    list: pageItems.map((item) => {
      const cover = uniqueCover(item);
      return {
        id: item.id,
        title: item.title,
        cardTitle: item.cardTitle,
        theme: item.theme,
        themeKey: item.themeKey,
        audience: item.audience,
        scene: item.scene,
        tone: item.tone,
        ageRange: item.ageRange,
        coverTemplate: cover.coverTemplate,
        coverImage: cover.coverImage,
        qualityTier: item.qualityTier,
      };
    }),
    total: scored.length,
    page: safePage,
    size: safeSize,
    hasMore: start + safeSize < scored.length,
    source: hasShelf ? 'shelf' : (hasBehavior ? 'behavior' : 'cold_start'),
    bookCount: books.length,
  };
}

function bookThemeScore(book, item) {
  const text = normalizeText([book.title, book.author, book.category, book.ageRange, book.summary].join(' '));
  const score = matchesTheme(item, text);
  if (item.ageRange && book.ageRange && item.ageRange.includes(book.ageRange)) return score + 2;
  return score;
}

function pickBooks(item, books = [], count = 5) {
  const normalized = books.map(plainBook).filter((book) => book.title);
  if (!normalized.length) return [];
  const sorted = normalized
    .map((book) => ({ book, score: bookThemeScore(book, item) }))
    .sort((a, b) => b.score - a.score || ((hashText(item.id + a.book.title) % 1000) - (hashText(item.id + b.book.title) % 1000)));
  const primary = sorted.filter((entry) => entry.score > 0).map((entry) => entry.book);
  if (item.audience === 'adult') {
    const acceptsAllAgeBooks = ['classic', 'poetry', 'life', 'healing'].includes(item.themeKey);
    return primary.filter((book) => acceptsAllAgeBooks || !book.ageRange || book.ageRange === '成人').slice(0, count);
  }
  const fallback = sorted.map((entry) => entry.book);
  const map = new Map();
  primary.concat(fallback).forEach((book) => {
    if (!map.has(book.isbn || book.title)) map.set(book.isbn || book.title, book);
  });
  return [...map.values()].slice(0, count);
}

function paragraphSet(item, tone, theme, scene) {
  const story = THEME_STORY[theme.key] || THEME_STORY.life;
  const toneStory = TONE_STORY[tone.key] || TONE_STORY.note;
  const sceneCopy = {
    weekend: `周末读书最怕安排得太满。留一点空白，读两章停下来发会儿呆，反而更容易记住。`,
    night: `夜里读书别挑太吵的。台灯一开，手机放远一点，几页纸就能把一天的噪音压下去。`,
    commute: `通勤路上读书要短平快，能随时合上，也能在下一站重新接上情绪。`,
    'rainy-day': `下雨天很适合读有气味的书：木头、纸页、茶水、旧街道，慢慢把人带进去。`,
    bookstore: `逛书店时不要只盯畅销榜。有些书封很安静，翻开两页，反而会让人停很久。`,
    'new-start': `想重新开始时，不一定要读很燃的书。有时候先把心放稳，比立刻改变更重要。`,
    gift: `送礼不踩雷这件事，太用力会尴尬，太随便又没记忆点。选气质稳一点的，通常更安全。`,
    vacation: `假期读书不用赶进度。带一本能慢慢翻的，路上、窗边、饭后都能接着看。`,
    'parent-child': `陪孩子读书时，大人也会暴露自己的节奏。慢一点，孩子常常比我们更会发现细节。`,
    library: `图书馆最好的地方，是不用立刻买下什么。一本不合适，放回去，再换一本。`,
  };
  return [
    `${toneStory.angle}，${story.pain}，硬逼自己读一本“应该读”的书通常没用。真正能读下去的，往往是先把人当下的那点别扭接住。`,
    `这篇想聊的不是一份标准答案，而是${scene.label}时可以顺手打开的${story.object}。它们的共同点，是不把人往前推得太猛。`,
    sceneCopy[scene.key] || sceneCopy.weekend,
    `${story.promise}，这件事听起来很小，但很多时候人愿意继续读，就是因为先被理解了一下。`,
    `我会把这类书分成几种气质：一本负责把问题说清，一本负责给你画面，一本负责把情绪放软。${toneStory.relation}，比一口气堆十本更有效。`,
    `如果你刚好处在${scene.label}的状态里，可以先挑目录最顺眼的那一本。读书不是考试，入口越小，越容易真的开始。`,
    `读到中途如果想停，也不用有负担。有些书的价值不是立刻读完，而是某一句话在过两天突然回来找你。`,
    `我把相关的书放在文里和文末。你不用全收，先点开一本最有感觉的，看作者怎么开头，基本就知道它是不是你的那一本。`,
  ];
}

function buildSections(item, books) {
  const tone = TONES.find((entry) => entry.key === item.toneKey) || TONES[0];
  const theme = THEMES.find((entry) => entry.key === item.themeKey) || THEMES[0];
  const scene = SCENES.find((entry) => entry.key === item.sceneKey) || SCENES[0];
  const paragraphs = paragraphSet(item, tone, theme, scene);
  const sections = [];
  paragraphs.forEach((text, index) => {
    sections.push({ type: 'paragraph', text });
    if (books[index % 2 === 1 ? Math.floor(index / 2) : -1]) {
      const book = books[Math.floor(index / 2)];
      sections.push({
        type: 'book',
        title: `可以顺手翻翻《${book.title}》`,
        text: `如果你正好想读${item.theme}，这本可以先看开头几页。合不合适不用猜，语气通常很快就会告诉你。`,
        book,
      });
    }
  });
  return sections;
}

function buildGeneratedBooklistDetail(id, books = []) {
  const item = getGeneratedBooklists().find((entry) => entry.id === id);
  if (!item) return null;
  const pickedBooks = pickBooks(item, books, 5);
  const relatedLists = getGeneratedBooklists()
    .filter((entry) => entry.id !== id && (entry.themeKey === item.themeKey || entry.audience === item.audience))
    .slice(0, 6)
    .map((entry) => ({
      id: entry.id,
      title: entry.title,
      cardTitle: entry.cardTitle,
      theme: entry.theme,
      ageRange: entry.ageRange,
      audience: entry.audience,
      coverTemplate: entry.coverTemplate,
      coverImage: entry.coverImage,
    }));
  return {
    id: item.id,
    title: item.title,
    cardTitle: item.cardTitle,
    description: item.description,
    type: 'generated',
    theme: item.theme,
    themeKey: item.themeKey,
    audience: item.audience,
    scene: item.scene,
    tone: item.tone,
    ageRange: item.ageRange,
    coverTemplate: item.coverTemplate,
    coverImage: item.coverImage,
    article: {
      lead: `${item.scene} · ${item.theme}`,
      sections: buildSections(item, pickedBooks),
    },
    books: pickedBooks,
    relatedLists,
  };
}

module.exports = {
  THEMES,
  SCENES,
  TONES,
  getGeneratedBooklists,
  buildBooklistFeed,
  buildGeneratedBooklistDetail,
  pickBooks,
};
