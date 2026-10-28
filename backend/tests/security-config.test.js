const express = require('express');
const helmet = require('helmet');
const request = require('supertest');

let security;
beforeAll(() => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  jest.isolateModules(() => { security = require('../src/config/security'); });
  process.env.NODE_ENV = previous;
});

test('production CSP blocks external scripts and unsafe embedding', async () => {
  const app = express(); app.use(helmet({ contentSecurityPolicy: security.csp }));
  app.get('/', (_req, res) => res.send('ok'));
  const response = await request(app).get('/');
  expect(response.headers['content-security-policy']).toContain("script-src 'self'");
  expect(response.headers['content-security-policy']).toContain("object-src 'none'");
  expect(response.headers['content-security-policy']).toContain("base-uri 'none'");
});

test('unconfigured proxy trust ignores spoofed client IP headers', async () => {
  const app = express(); app.set('trust proxy', security.trustProxy);
  app.get('/', (req, res) => res.json({ ip: req.ip }));
  const response = await request(app).get('/').set('X-Forwarded-For', '203.0.113.12');
  expect(response.body.ip).not.toBe('203.0.113.12');
});
