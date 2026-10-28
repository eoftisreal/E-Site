const env = require('./env');

const allowedOrigins = new Set([
  new URL(env.appUrl).origin,
  'https://kapdakraft.live', 'https://www.kapdakraft.live',
  ...(process.env.CORS_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean),
]);

// Explicitly configure only a verified proxy chain. Never trust all incoming hops.
const trustProxy = process.env.TRUST_PROXY
  ? process.env.TRUST_PROXY.split(',').map(value => value.trim()).filter(Boolean)
  : false;

module.exports = {
  trustProxy,
  cors: {
    origin(origin, callback) { callback(null, !origin || allowedOrigins.has(origin)); },
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    maxAge: 86400,
  },
  csp: env.nodeEnv === 'production' ? {
    directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'https:', 'data:', 'blob:'],
      connectSrc: ["'self'", ...allowedOrigins, ...(process.env.CSP_CONNECT_ORIGINS || '').split(',').filter(Boolean)],
      workerSrc: ["'self'", 'blob:'], objectSrc: ["'none'"],
      baseUri: ["'none'"], formAction: ["'self'"], frameAncestors: ["'self'"],
      upgradeInsecureRequests: [],
    },
  } : false,
};
