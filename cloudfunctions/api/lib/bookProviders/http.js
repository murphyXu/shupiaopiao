const https = require('https');

function request(url, timeoutMs = 1200, transport = https, headers = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let req = null;

    function finish(fn, value) {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimer);
      fn(value);
    }

    const hardTimer = setTimeout(() => {
      const err = new Error('REQUEST_TIMEOUT');
      if (req && typeof req.destroy === 'function') req.destroy(err);
      finish(reject, err);
    }, timeoutMs);

    req = transport.get(url, {
      headers: {
        'User-Agent': 'shupiaopiao-cloud/1.0',
        Accept: '*/*',
        ...headers,
      },
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          finish(reject, new Error(`HTTP_${res.statusCode}`));
          return;
        }
        finish(resolve, body);
      });
    });
    req.setTimeout(timeoutMs, () => {
      const err = new Error('REQUEST_TIMEOUT');
      req.destroy(err);
      finish(reject, err);
    });
    req.on('error', (err) => finish(reject, err));
  });
}

function getJson(url, timeoutMs = 1200, transport = https, headers = {}) {
  return request(url, timeoutMs, transport, { Accept: 'application/json', ...headers })
    .then((body) => {
      try {
        return JSON.parse(body);
      } catch (err) {
        throw new Error('INVALID_JSON');
      }
    });
}

function getText(url, timeoutMs = 1200, transport = https, headers = {}) {
  return request(url, timeoutMs, transport, headers);
}

module.exports = { getJson, getText };
