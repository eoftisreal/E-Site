// Run without installing dependencies: node --test backend/test-appwrite/*.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');

test('scheduled ticks bypass HTTP routing while HTTP requests retain their semantics', async (t) => {
  const servers = [];
  const agents = [];
  const requests = [];
  let dbConnections = 0;
  const filename = path.join(__dirname, '../src/appwrite-entry.js');
  const moduleStub = { exports: {} };
  const app = (req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, body: Buffer.concat(chunks).toString() });
      res.statusCode = req.method === 'POST' && req.url === '/' ? 404 : 200;
      res.end(req.url === '/' ? 'homepage' : Buffer.concat(chunks));
    });
  };
  t.after(async () => {
    agents.forEach((agent) => agent.destroy());
    await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
  });
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module: moduleStub, Buffer, setTimeout, clearTimeout,
    require(id) {
      if (id === './app') return app;
      if (id === './config/db') return async () => { dbConnections++; };
      assert.equal(id, 'http');
      return {
        ...http,
        Agent: class extends http.Agent {
          constructor(options) { super(options); agents.push(this); }
        },
        createServer(handler) {
          const server = http.createServer(handler);
          servers.push(server);
          return server;
        },
      };
    },
  }, { filename });
  const invoke = (req) => moduleStub.exports({
    req: { method: 'POST', path: '/', headers: {}, ...req },
    res: {
      json: (body, status) => ({ body: JSON.stringify(body), status }),
      binary: (body, status) => ({ body: body.toString(), status }),
      text: (body, status) => ({ body, status }),
    },
    log() {}, error(message) { assert.fail(message); },
  });

  const scheduled = await invoke({ headers: { 'x-appwrite-trigger': 'schedule' } });
  assert.equal(scheduled.status, 200);
  assert.deepEqual(JSON.parse(scheduled.body), { ok: true, trigger: 'schedule' });
  assert.equal(requests.length, 0, 'scheduled POST must not reach Express');
  assert.equal(dbConnections, 1);

  assert.equal((await invoke({ headers: { 'x-appwrite-trigger': 'http' } })).status, 404);
  assert.equal((await invoke({})).status, 404);
  assert.equal((await invoke({ method: 'GET' })).body, 'homepage');
  const body = '{"item":"example"}';
  const api = await invoke({ path: '/api/cart', queryString: 'test=1', bodyBinary: Buffer.from(body) });
  assert.equal(api.status, 200);
  assert.equal(api.body, body);
  assert.deepEqual(requests.at(-1), { method: 'POST', url: '/api/cart?test=1', body });
  assert.equal(dbConnections, 1, 'warm invocations reuse the DB connection');
  assert.equal(servers.length, 1, 'warm invocations reuse the HTTP server');
});
