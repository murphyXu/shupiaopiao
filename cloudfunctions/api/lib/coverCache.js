const http = require('http');
const https = require('https');
const { normalizeIsbn, isValidIsbn } = require('./bookCatalog');

const MAX_REMOTE_COVER_BYTES = 3 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 8000;
const ALLOWED_REMOTE_COVER_HOSTS = [
  'static.tanshuapi.com',
  'books.google.com',
  'covers.openlibrary.org',
  'doubanio.com',
  'booklibimg.kfzimg.com',
];

function isCloudCover(cover) {
  return typeof cover === 'string' && cover.startsWith('cloud://');
}

function isRemoteCover(cover) {
  return typeof cover === 'string' && /^https?:\/\//.test(cover);
}

function normalizeRemoteCoverUrl(url) {
  const value = String(url || '').trim();
  if (!isRemoteCover(value)) return '';
  return value.replace(/^http:\/\//, 'https://');
}

function isAllowedCoverUrl(url) {
  try {
    const { hostname, protocol } = new URL(url);
    if (protocol !== 'https:') return false;
    const host = hostname.toLowerCase();
    return ALLOWED_REMOTE_COVER_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  } catch (e) {
    return false;
  }
}

function remoteCoverUrlFor(book = {}, data = {}) {
  return normalizeRemoteCoverUrl(book.coverRemote)
    || normalizeRemoteCoverUrl(isRemoteCover(book.cover) ? book.cover : '')
    || normalizeRemoteCoverUrl(data.coverRemote || data.cover);
}

function cloudCoverPath(isbn, url) {
  const clean = normalizeIsbn(isbn);
  const extMatch = String(url || '').split('?')[0].match(/\.(png|jpe?g)$/i);
  const ext = extMatch ? extMatch[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg';
  return `book-covers/${clean}.${ext}`;
}

function isSupportedContentType(contentType) {
  const type = String(contentType || '').split(';')[0].trim().toLowerCase();
  return !type || ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(type);
}

function requestClientFor(url) {
  return url.startsWith('http://') ? http : https;
}

function downloadRemoteCover(url, redirectCount = 0) {
  if (redirectCount > 3) return Promise.reject(new Error('COVER_REDIRECT_LIMIT'));
  if (!isAllowedCoverUrl(url)) return Promise.reject(new Error('COVER_URL_NOT_ALLOWED'));

  return new Promise((resolve, reject) => {
    const req = requestClientFor(url).get(url, {
      timeout: DOWNLOAD_TIMEOUT_MS,
      headers: { 'User-Agent': 'shupiaopiao-cloud/1.0' },
    }, (res) => {
      const statusCode = Number(res.statusCode) || 0;
      if ([301, 302, 303, 307, 308].includes(statusCode) && res.headers.location) {
        res.resume();
        const nextUrl = normalizeRemoteCoverUrl(new URL(res.headers.location, url).toString());
        downloadRemoteCover(nextUrl, redirectCount + 1).then(resolve).catch(reject);
        return;
      }
      if (statusCode >= 400) {
        res.resume();
        reject(new Error(`COVER_DOWNLOAD_${statusCode}`));
        return;
      }
      if (!isSupportedContentType(res.headers['content-type'])) {
        res.resume();
        reject(new Error('COVER_CONTENT_TYPE_UNSUPPORTED'));
        return;
      }

      let total = 0;
      const chunks = [];
      res.on('data', (chunk) => {
        total += chunk.length;
        if (total > MAX_REMOTE_COVER_BYTES) {
          req.destroy(new Error('COVER_TOO_LARGE'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => {
        resolve({ buffer: Buffer.concat(chunks), contentType: res.headers['content-type'] || '' });
      });
    });
    req.on('timeout', () => req.destroy(new Error('COVER_DOWNLOAD_TIMEOUT')));
    req.on('error', reject);
  });
}

function getCloudClient() {
  return require('wx-server-sdk');
}

async function cacheRemoteBookCover(db, data = {}, deps = {}) {
  const isbn = normalizeIsbn(data.isbn);
  if (!isValidIsbn(isbn)) throw new Error('INVALID_ISBN');

  const { data: rows } = await db.collection('books').where({ isbn }).limit(1).get();
  const book = rows[0];
  if (!book) throw new Error('BOOK_NOT_FOUND');
  if (isCloudCover(book.cover)) return { isbn, cover: book.cover, cached: false };

  const coverUrl = remoteCoverUrlFor(book, data);
  if (!coverUrl || !isAllowedCoverUrl(coverUrl)) throw new Error('COVER_URL_NOT_ALLOWED');

  const download = deps.downloadRemoteCover || downloadRemoteCover;
  const cloudClient = deps.cloud || getCloudClient();
  const { buffer } = await download(coverUrl);
  if (!buffer || !buffer.length) throw new Error('COVER_EMPTY');

  const upload = await cloudClient.uploadFile({
    cloudPath: cloudCoverPath(isbn, coverUrl),
    fileContent: buffer,
  });
  if (!upload || !isCloudCover(upload.fileID)) throw new Error('COVER_UPLOAD_FAILED');

  const patch = { cover: upload.fileID };
  if (!book.coverRemote) patch.coverRemote = coverUrl;
  await db.collection('books').doc(book._id).update({ data: patch });
  return { isbn, cover: upload.fileID, cached: true };
}

module.exports = {
  MAX_REMOTE_COVER_BYTES,
  ALLOWED_REMOTE_COVER_HOSTS,
  normalizeRemoteCoverUrl,
  isAllowedCoverUrl,
  remoteCoverUrlFor,
  cloudCoverPath,
  isSupportedContentType,
  downloadRemoteCover,
  cacheRemoteBookCover,
};
