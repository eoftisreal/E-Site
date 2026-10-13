const { test } = require('node:test');
const assert = require('node:assert/strict');
const { staticCacheControl } = require('../src/utils/staticCacheControl');
const cacheMiddleware = require('../src/middleware/cache');

test('dynamic and missing-file responses default to no-store', () => {
  for (const method of ['GET', 'HEAD', 'POST']) {
    let called = false;
    const headers = {};
    cacheMiddleware({ method, path: '/missing.js' }, {
      set(name, value) { headers[name] = value; },
    }, () => { called = true; });
    assert.equal(headers['Cache-Control'], 'no-store');
    assert.equal(called, true);
  }
});

test('HTML and service-worker scripts cannot retain a previous deployment', () => {
  for (const file of ['index.html', 'index.html.br', 'sw.js', 'sw.js.gz', 'registerSW.js']) {
    assert.equal(staticCacheControl(file), 'no-store', file);
  }
});

test('only content-hashed build outputs get immutable caching', () => {
  for (const file of ['js/index-ABcd1234.js', 'css/index-ABcd1234.css.br', 'images/logo-ABcd1234.png']) {
    assert.equal(staticCacheControl(file), 'public, max-age=31536000, immutable', file);
  }
  for (const file of ['icons/user.png', 'logo.png', 'manifest.webmanifest', 'js/app.js', 'missing.js']) {
    assert.equal(staticCacheControl(file), 'public, max-age=0, must-revalidate', file);
  }
});
