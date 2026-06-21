const cloud = require('wx-server-sdk');

const DEFAULT_SCENE = 2;
const IMAGE_MEDIA_TYPE = 2;
const MAX_TEXT_LENGTH = 2500;

class ContentRiskError extends Error {
  constructor(message) {
    super(message);
    this.code = 'CONTENT_RISK';
  }
}

class ContentCheckError extends Error {
  constructor(message) {
    super(message);
    this.code = 'CONTENT_CHECK_FAILED';
  }
}

function normalizeText(value) {
  return String(value || '').trim();
}

function splitText(content) {
  const chunks = [];
  for (let index = 0; index < content.length; index += MAX_TEXT_LENGTH) {
    chunks.push(content.slice(index, index + MAX_TEXT_LENGTH));
  }
  return chunks;
}

// strict=true 时，review（建议复审）也视为风险并拦截；默认仅 risky 拦截。
// 注意：微信 msgSecCheck v2 中 label=100 表示「正常」，不能当作风险。
function isRisky(result = {}, strict = false) {
  const data = result.result || result;
  const suggest = data.suggest;
  if (suggest === 'risky') return true;
  if (strict && suggest === 'review') return true;
  // 87014：内容含有违法违规内容（错误码层面的命中）
  if (data.errCode === 87014 || data.errcode === 87014) return true;
  return false;
}

function assertOpenApi(method, name) {
  if (typeof method !== 'function') {
    throw new ContentCheckError(`内容安全接口 ${name} 不可用，请重新上传云函数`);
  }
}

async function checkText(openid, content, scene = DEFAULT_SCENE, strict = false) {
  assertOpenApi(cloud.openapi && cloud.openapi.security && cloud.openapi.security.msgSecCheck, 'msgSecCheck');
  const chunks = splitText(content);
  for (const chunk of chunks) {
    const result = await cloud.openapi.security.msgSecCheck({
      version: 2,
      openid,
      scene,
      content: chunk,
    });
    if (isRisky(result, strict)) throw new ContentRiskError('内容安全检测未通过，请修改后再提交');
  }
}

// options.strict=true：对面向他人展示的内容从严（review 也拦截）；
// 默认宽松：昵称/书架名等短标识字段仅 risky 拦截。
async function assertSafeTextFields(openid, fields = {}, options = {}) {
  const scene = options.scene || DEFAULT_SCENE;
  const strict = options.strict === true;
  const entries = Object.entries(fields)
    .map(([name, value]) => [name, normalizeText(value)])
    .filter(([, value]) => value);
  for (const [, value] of entries) {
    await checkText(openid, value, scene, strict);
  }
}

async function toMediaUrl(fileID) {
  if (!String(fileID || '').startsWith('cloud://')) return '';
  const { fileList } = await cloud.getTempFileURL({ fileList: [fileID] });
  return ((fileList || [])[0] || {}).tempFileURL || '';
}

async function checkMedia(openid, mediaUrl, scene = DEFAULT_SCENE) {
  assertOpenApi(cloud.openapi && cloud.openapi.security && cloud.openapi.security.mediaCheckAsync, 'mediaCheckAsync');
  const result = await cloud.openapi.security.mediaCheckAsync({
    version: 2,
    openid,
    scene,
    mediaUrl,
    mediaType: IMAGE_MEDIA_TYPE,
  });
  if (isRisky(result, false)) throw new ContentRiskError('图片安全检测未通过，请更换后再提交');
}

async function assertSafeMediaFiles(openid, fileIDs = [], options = {}) {
  const scene = options.scene || DEFAULT_SCENE;
  const uniqueFileIDs = [...new Set((fileIDs || []).filter(Boolean))];
  for (const fileID of uniqueFileIDs) {
    const mediaUrl = await toMediaUrl(fileID);
    if (mediaUrl) await checkMedia(openid, mediaUrl, scene);
  }
}

module.exports = {
  assertSafeTextFields,
  assertSafeMediaFiles,
  ContentRiskError,
  ContentCheckError,
};
