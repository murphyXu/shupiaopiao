const { isRemoteCover } = require('./cover');

const DEFAULT_SHARE_IMAGE = '/assets/share/share-cover.jpg';

const COPY = {
  poolTitle: '闲置书送出去，免费童书接回家',
  mineInviteTitle: '清书架赠闲置，童书绘本免费漂',
  mineInviteDesc: '书架闲置清出去，童书绘本免费漂过来。',
  shelfOwnTitle: '来看看我的书架，童书可免费接漂',
  shelfViewTitle: (name) => `${name}的书架，童书绘本免费漂`,
  bookTitle: (title) => `《${title}》正在漂，免费申请接回家`,
  driftTitle: (title) => `免费接漂《${title}》，邮费到付`,
};

function withInviter(path, inviterId) {
  const id = inviterId || '';
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}inviterId=${id}`;
}

function resolveShareImage(cover) {
  if (typeof cover === 'string' && (cover.startsWith('/') || isRemoteCover(cover))) {
    return cover;
  }
  return DEFAULT_SHARE_IMAGE;
}

function poolShare(inviterId) {
  return {
    title: COPY.poolTitle,
    path: withInviter('/pages/pool/index', inviterId),
    imageUrl: DEFAULT_SHARE_IMAGE,
  };
}

function mineInviteShare(inviterId) {
  return {
    title: COPY.mineInviteTitle,
    path: withInviter('/pages/shelf/index', inviterId),
    imageUrl: DEFAULT_SHARE_IMAGE,
  };
}

function shelfShare({ shelfName, shareUserId, owner, shareMode }) {
  const shareId = shareUserId || '';
  const title = shareMode && owner
    ? COPY.shelfViewTitle(shelfName || '好友')
    : COPY.shelfOwnTitle;
  return {
    title,
    path: `/pages/shelf/index?shareUserId=${shareId}&inviterId=${shareId}`,
    imageUrl: DEFAULT_SHARE_IMAGE,
  };
}

function bookShare({ title, bookId, inviterId, cover }) {
  return {
    title: COPY.bookTitle(title || '一本书'),
    path: withInviter(`/pages/book/catalog?id=${bookId || ''}`, inviterId),
    imageUrl: resolveShareImage(cover),
  };
}

function driftShare({ title, driftId, inviterId, cover }) {
  return {
    title: COPY.driftTitle(title || '一本书'),
    path: withInviter(`/pages/pool/detail?id=${driftId || ''}`, inviterId),
    imageUrl: resolveShareImage(cover),
  };
}

module.exports = {
  COPY,
  DEFAULT_SHARE_IMAGE,
  poolShare,
  mineInviteShare,
  shelfShare,
  bookShare,
  driftShare,
  resolveShareImage,
};
