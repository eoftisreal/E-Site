const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const MongoRateLimitStore = require('./mongoRateLimitStore');
const persistentStore = prefix => process.env.NODE_ENV === 'test' ? {} : { store: new MongoRateLimitStore(prefix) };

const skipPreflight = (req, res) => {
  return req.method === 'OPTIONS';
};

/**
 * Rate limiter configurations
 */
const createRateLimitHandler = (message) => (req, res) => {
  res.status(429).json({
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message
    }
  });
};

/**
 * Strict rate limiter for auth endpoints
 */
const authLimiter = rateLimit({
  ...persistentStore('authLimiter'),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per window
  skip: skipPreflight,
  skipSuccessfulRequests: false,
  handler: createRateLimitHandler('Too many login attempts, please try again later.'),
});

/**
 * Rate limiter for image uploads
 */
const uploadLimiter = rateLimit({
  ...persistentStore('uploadLimiter'),
  windowMs: 60 * 1000, // 1 minute
  max: 15, // 15 requests per minute
  skip: skipPreflight,
  handler: createRateLimitHandler('Too many image uploads from this IP, please try again later.'),
});

/**
 * Rate limiter for read operations (GET)
 */
const readOperationLimiter = rateLimit({
  ...persistentStore('readOperationLimiter'),
  windowMs: 60 * 1000, // 1 minute
  max: 1000, // 1000 requests per minute
  skip: skipPreflight,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Too many read requests from this IP, please try again later.'),
});

/**
 * Rate limiter for write operations (POST, PUT, DELETE, PATCH)
 */
const writeOperationLimiter = rateLimit({
  ...persistentStore('writeOperationLimiter'),
  windowMs: 60 * 1000, // 1 minute
  max: 1000, // 1000 requests per minute
  skip: skipPreflight,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Too many write requests from this IP, please try again later.'),
});

/**
 * Relaxed rate limiter for general API
 */
const apiLimiter = rateLimit({
  ...persistentStore('apiLimiter'),
  windowMs: 60 * 1000, // 1 minute
  max: 1000, // 1000 requests per minute
  skip: skipPreflight,
  handler: createRateLimitHandler('Too many requests, please try again later.'),
});

const globalLimiter = rateLimit({
  ...persistentStore('globalLimiter'),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10000,
  skip: skipPreflight,
  handler: createRateLimitHandler('Too many requests from this IP, please try again later.'),
});

const accountLimiter = rateLimit({
  ...persistentStore('account'), windowMs: 15 * 60 * 1000, max: 20,
  skip(req) {
    return req.method !== 'POST' || !['/login', '/forgot-password', '/magic-link/request'].includes(req.path)
      || typeof (req.body?.identifier || req.body?.email) !== 'string';
  },
  keyGenerator(req) {
    return crypto.createHash('sha256').update((req.body.identifier || req.body.email).trim().toLowerCase()).digest('hex');
  },
  handler: createRateLimitHandler('Too many attempts for this account, please try again later.'),
});

module.exports = { accountLimiter, authLimiter, uploadLimiter, apiLimiter, readOperationLimiter, writeOperationLimiter, globalLimiter, skipPreflight };
