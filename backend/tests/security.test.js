jest.mock('../src/utils/sendEmail', () => ({
  sendVerificationEmail: jest.fn(), sendMagicLinkEmail: jest.fn(),
  sendPasswordResetEmail: jest.fn(), sendOrderConfirmationEmail: jest.fn(),
}));

const request = require('supertest');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const app = require('../src/app');
const User = require('../src/models/User');
const Order = require('../src/models/Order');
const Product = require('../src/models/Product');
const ResetToken = require('../src/models/ResetToken');
const MagicLink = require('../src/models/MagicLink');
const RefreshToken = require('../src/models/RefreshToken');
const { signAccessToken } = require('../src/utils/jwt');
const { releaseExpiredReservations } = require('../src/utils/orderTransitions');
const MongoRateLimitStore = require('../src/middleware/mongoRateLimitStore');

let replica, customer, admin, master, product;
let sequence = 0;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const bearer = user => `Bearer ${signAccessToken({ sub: user.id, role: user.role, ver: user.tokenVersion || 0 })}`;
const resetSecret = 'reset-token-with-sufficient-entropy-for-tests';
const magicSecret = 'magic-token-with-sufficient-entropy-for-tests';

async function makeOrder(status = 'pending_payment', overrides = {}) {
  return Order.create({
    userId: customer._id, items: [{ productId: product._id, title: 'Shirt', quantity: 2, unitPrice: 100 }],
    subtotal: 200, tax: 0, total: 200, uniquePaymentAmount: 200 + (++sequence / 100),
    status, payment: { status: status === 'awaiting_verification' ? status : 'pending' }, ...overrides,
  });
}

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, instanceOpts: [{ args: ['--nounixsocket'] }] });
  await mongoose.connect(replica.getUri());
  await Promise.all([User.init(), Order.init(), Product.init(), ResetToken.init(), MagicLink.init(), RefreshToken.init()]);
});
afterAll(async () => { await mongoose.disconnect(); await replica?.stop(); });
beforeEach(async () => {
  for (const collection of Object.values(mongoose.connection.collections)) await collection.deleteMany({});
  customer = await User.create({ email: 'customer@example.test', username: 'customer', password: await bcrypt.hash('old-password', 4), isVerified: true });
  admin = await User.create({ email: 'admin@example.test', role: 'admin', isAdmin: true, isVerified: true });
  master = await User.create({ email: 'master@example.test', role: 'master_admin', isAdmin: true, isVerified: true });
  product = await Product.create({ title: 'Shirt', description: 'A test shirt', price: 100, stock: 3 });
});

test('all payment mutation endpoints reject an ordinary admin', async () => {
  const order = await makeOrder('awaiting_verification');
  for (const [method, path] of [
    ['patch', `/api/orders/${order.id}/status`],
    ['put', `/api/admin/orders/${order.id}/status`],
    ['post', `/api/admin/orders/${order.id}/approve`],
    ['post', `/api/admin/orders/${order.id}/reject`],
  ]) {
    const response = await request(app)[method](path).set('Authorization', bearer(admin)).send({ status: 'payment_verified' });
    expect(response.status).toBe(403);
  }
  expect((await Order.findById(order.id)).status).toBe('awaiting_verification');
});

test('neither status endpoint allows unpaid fulfillment', async () => {
  const order = await makeOrder();
  for (const [method, path] of [['patch', `/api/orders/${order.id}/status`], ['put', `/api/admin/orders/${order.id}/status`]]) {
    expect((await request(app)[method](path).set('Authorization', bearer(master)).send({ status: 'shipped' })).status).toBe(409);
  }
});

test('concurrent cancellations restore inventory exactly once', async () => {
  const order = await makeOrder();
  const results = await Promise.all([1, 2].map(() => request(app).post(`/api/orders/${order.id}/cancel`).set('Authorization', bearer(customer))));
  expect(results.some(result => result.status === 200)).toBe(true);
  expect(results.every(result => [200, 409].includes(result.status))).toBe(true);
  expect((await Product.findById(product.id)).stock).toBe(5);
  expect((await Order.findById(order.id)).stockRestored).toBe(true);
});

test('approval synchronizes payment and increments sales once; fulfillment remains available', async () => {
  const order = await makeOrder('awaiting_verification');
  expect((await request(app).post(`/api/admin/orders/${order.id}/approve`).set('Authorization', bearer(master))).status).toBe(200);
  expect((await request(app).post(`/api/admin/orders/${order.id}/approve`).set('Authorization', bearer(master))).status).toBe(409);
  expect((await Product.findById(product.id)).salesCount).toBe(2);
  expect((await Order.findById(order.id)).payment.status).toBe('captured');
  expect((await request(app).patch(`/api/orders/${order.id}/status`).set('Authorization', bearer(admin)).send({ status: 'processing' })).status).toBe(200);
});

test('other customers cannot read or cancel an order', async () => {
  const other = await User.create({ email: 'other@example.test', isVerified: true });
  const order = await makeOrder();
  expect((await request(app).get(`/api/orders/${order.id}`).set('Authorization', bearer(other))).status).toBe(404);
  expect((await request(app).post(`/api/orders/${order.id}/cancel`).set('Authorization', bearer(other))).status).toBe(404);
});

test('profile and master export never contain credentials or internal codes', async () => {
  customer.verificationToken = 'internal-verification-hash'; customer.masterAccessCode = 'internal-code'; await customer.save();
  const profile = await request(app).put('/api/auth/profile').set('Authorization', bearer(customer)).send({ name: 'Updated' });
  expect(profile.status).toBe(200);
  await makeOrder();
  const exported = await request(app).get('/api/admin/orders/export').set('Authorization', bearer(master));
  expect(exported.status).toBe(200);
  const users = await request(app).get('/api/admin/users').set('Authorization', bearer(master));
  expect(users.status).toBe(200);
  expect(users.body.find(user => user.email === customer.email)._id).toBe(customer.id);
  for (const object of [profile.body, exported.body[0].userId, customer.toJSON()]) {
    for (const field of ['password', 'verificationToken', 'masterAccessCode', 'tokenVersion']) expect(object).not.toHaveProperty(field);
  }
});

test('password reset revokes stolen access/refresh tokens, /me renewal, and outstanding links', async () => {
  const login = await request(app).post('/api/auth/login').send({ identifier: customer.email, password: 'old-password' });
  expect(login.status).toBe(200);
  await ResetToken.create({ userId: customer.id, tokenHash: hash(resetSecret) });
  await MagicLink.create({ userId: customer.id, tokenHash: hash(magicSecret) });
  const reset = await request(app).post('/api/auth/reset-password').send({ token: resetSecret, newPassword: 'new-password' });
  expect(reset.status).toBe(200);
  expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${login.body.accessToken}`)).status).toBe(401);
  expect((await request(app).post('/api/auth/refresh').send({ refreshToken: login.body.refreshToken })).status).toBe(401);
  expect(await MagicLink.countDocuments({ userId: customer.id })).toBe(0);
  expect(await RefreshToken.countDocuments({ userId: customer.id })).toBe(0);
  const freshLogin = await request(app).post('/api/auth/login').send({ identifier: customer.email, password: 'new-password' });
  expect(freshLogin.status).toBe(200);
  expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${freshLogin.body.accessToken}`)).status).toBe(200);
});

test('expired recovery links are rejected while documents still exist', async () => {
  await ResetToken.create({ userId: customer.id, tokenHash: hash(resetSecret), expiresAt: new Date(Date.now() - 61 * 60 * 1000) });
  await MagicLink.create({ userId: customer.id, tokenHash: hash(magicSecret), expiresAt: new Date(Date.now() - 16 * 60 * 1000) });
  expect((await request(app).post('/api/auth/reset-password').send({ token: resetSecret, newPassword: 'new-password' })).status).toBe(400);
  expect((await request(app).post('/api/auth/magic-link/verify').send({ token: magicSecret })).status).toBe(400);
});

test('simultaneous reset-link use succeeds once', async () => {
  await ResetToken.create({ userId: customer.id, tokenHash: hash(resetSecret) });
  const results = await Promise.all([1, 2].map(() => request(app).post('/api/auth/reset-password').send({ token: resetSecret, newPassword: 'new-password' })));
  expect(results.map(result => result.status).sort()).toEqual([200, 400]);
  expect((await User.findById(customer.id)).tokenVersion).toBe(1);
});

test('simultaneous magic-link use succeeds once', async () => {
  await MagicLink.create({ userId: customer.id, tokenHash: hash(magicSecret) });
  const results = await Promise.all([1, 2].map(() => request(app).post('/api/auth/magic-link/verify').send({ token: magicSecret })));
  expect(results.map(result => result.status).sort()).toEqual([200, 400]);
});

test('refresh-token rotation consumes a token only once', async () => {
  const login = await request(app).post('/api/auth/login').send({ identifier: customer.email, password: 'old-password' });
  const results = await Promise.all([1, 2].map(() => request(app).post('/api/auth/refresh').send({ refreshToken: login.body.refreshToken })));
  expect(results.map(result => result.status).sort()).toEqual([200, 401]);
  expect(results.find(result => result.status === 200).body.refreshToken).not.toBe(login.body.refreshToken);
});

test('abandoned unpaid reservations are released once by cleanup', async () => {
  const order = await makeOrder('pending_payment', { createdAt: new Date(Date.now() - 31 * 60 * 1000) });
  await releaseExpiredReservations();
  await releaseExpiredReservations();
  expect((await Order.findById(order.id)).status).toBe('cancelled');
  expect((await Product.findById(product.id)).stock).toBe(5);
});

test('concurrent checkouts cannot exceed the per-user unpaid-order cap', async () => {
  await makeOrder(); await makeOrder();
  const body = { checkoutMode: 'buy_now', directBuyItem: { productId: product.id, quantity: 1 },
    shippingAddress: { line1: 'Test street', city: 'Patna', state: 'Bihar', postalCode: '800001', country: 'India' } };
  const results = await Promise.all([1, 2].map(() => request(app).post('/api/checkout/create').set('Authorization', bearer(customer)).send(body)));
  expect(results.map(result => result.status).sort()).toEqual([201, 409]);
  expect(await Order.countDocuments({ userId: customer.id })).toBe(3);
  expect((await Product.findById(product.id)).stock).toBe(2);
});

test('separate rate limiter instances share atomic database counters', async () => {
  const first = new MongoRateLimitStore('test'), second = new MongoRateLimitStore('test');
  first.init({ windowMs: 60000 }); second.init({ windowMs: 60000 });
  const results = await Promise.all([first.increment('client'), second.increment('client')]);
  expect(results.map(result => result.totalHits).sort()).toEqual([1, 2]);
});

test('CORS rejects an unrelated origin and allows the storefront', async () => {
  expect((await request(app).get('/api/health').set('Origin', 'https://audit.invalid')).headers['access-control-allow-origin']).toBeUndefined();
  expect((await request(app).get('/api/health').set('Origin', 'https://kapdakraft.live')).headers['access-control-allow-origin']).toBe('https://kapdakraft.live');
});
