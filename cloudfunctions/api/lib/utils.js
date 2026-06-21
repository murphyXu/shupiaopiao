function uid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function ok(data) {
  return { code: 0, msg: 'ok', data };
}

function fail(code, msg, data = null) {
  return { code, msg, data };
}

function nowIso() {
  return new Date().toISOString();
}

module.exports = { uid, ok, fail, nowIso };
