const assert = require('assert');
const { getJson } = require('../cloudfunctions/api/lib/bookProviders/http');

function createHangingTransport() {
  let destroyed = false;
  return {
    get(url, options, callback) {
      assert.strictEqual(url, 'https://example.test/hang');
      assert.strictEqual(options.headers.Accept, 'application/json');
      return {
        setTimeout() {},
        on() {},
        destroy(err) {
          destroyed = true;
          assert.strictEqual(err.message, 'REQUEST_TIMEOUT');
        },
      };
    },
    wasDestroyed() {
      return destroyed;
    },
  };
}

(async () => {
  const transport = createHangingTransport();
  const startedAt = Date.now();
  try {
    await getJson('https://example.test/hang', 50, transport);
    throw new Error('expected timeout');
  } catch (err) {
    const elapsed = Date.now() - startedAt;
    assert.strictEqual(err.message, 'REQUEST_TIMEOUT');
    assert.ok(elapsed < 500, `timeout took ${elapsed}ms`);
    assert.ok(transport.wasDestroyed(), 'request should be destroyed on hard timeout');
  }
  console.log('http hard timeout ok');
})();
