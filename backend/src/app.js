const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const healthRoutes = require('./routes/health');
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const cartRoutes = require('./routes/cart');
const checkoutRoutes = require('./routes/checkout');
const orderRoutes = require('./routes/orders');
const adminRoutes = require('./routes/admin');
const masterRoutes = require('./routes/master');
const wishlistRoutes = require('./routes/wishlist');
const sitemapRoutes = require('./routes/sitemap');
const masterDataRoutes = require('./routes/master-data');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const path = require('path');
const { staticCacheControl } = require('./utils/staticCacheControl');

const compressionMiddleware = require('./middleware/compression');
const cacheMiddleware = require('./middleware/cache');
const queryOptimizationMiddleware = require('./middleware/queryOptimization');

const { accountLimiter, globalLimiter, authLimiter, uploadLimiter, readOperationLimiter, writeOperationLimiter } = require('./middleware/rateLimiter');

const app = express();

const security = require('./config/security');
app.set('trust proxy', security.trustProxy);
app.use(helmet({
  contentSecurityPolicy: security.csp,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(cors(security.cors));

// Health check should bypass DB check if it doesn't strictly need it, or we can just mount dbCheck after it
// Wait, the user specifically said: "Keep database-independent liveness routes accessible."
// Health check is at /api/health

// We should exclude health from dbCheck.
const dbCheck = require('./middleware/dbCheck');
app.use('/api', (req, res, next) => {
  if (req.path === '/health' || req.path === '/health/') {
    return next();
  }
  return dbCheck(req, res, next);
});

// Compression and caching middleware
app.use(compressionMiddleware());
app.use(cacheMiddleware);
app.use(queryOptimizationMiddleware);

const responseCacheMiddleware = require('./middleware/responseCache');
app.use('/api/', responseCacheMiddleware);

// API rate limiting
app.use('/api/', (req, res, next) => {
  if (req.method === 'OPTIONS' || req.path.replace(/\/$/, '') === '/health') return next();
  if (req.method === 'GET') {
    return readOperationLimiter(req, res, next);
  }
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    return writeOperationLimiter(req, res, next);
  }
  next();
});
// Parse bounded JSON before account-based throttling.
app.use(express.json({ limit: '2mb' }));
app.use('/api/auth/login', authLimiter);
app.use('/api/auth', accountLimiter);
app.use('/api/auth/signup', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/reset-password', authLimiter);
app.use('/api/auth/magic-link', authLimiter);
app.use('/api/auth/verify-email', authLimiter);
app.use('/api/checkout', authLimiter);
app.use('/api/products/upload-custom', uploadLimiter);
app.use('/api/admin/upload', uploadLimiter);


// Logging
const customLogger = require('./middleware/logger');
if (process.env.NODE_ENV === 'production') {
  app.use(customLogger);
} else {
  app.use(morgan('dev'));
}

// Global rate limiting
app.use('/api', (req, res, next) => req.path.replace(/\/$/, '') === '/health' ? next() : globalLimiter(req, res, next));

// API Routes
app.use('/api', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/checkout', checkoutRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/master', masterRoutes);
app.use('/api/master-data', masterDataRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api', sitemapRoutes);

// ========================================
// SERVE FRONTEND STATIC FILES
// ========================================
// In production (including Appwrite), serve the built frontend
if (process.env.NODE_ENV === 'production' || process.env.SERVE_FRONTEND === 'true') {
  const frontendPath = path.join(__dirname, '../../frontend/dist');

  const precompressed = require('./middleware/precompressed');
  app.use(precompressed(frontendPath));

  // Serve static files with caching
  app.use(express.static(frontendPath, {
    maxAge: '1d',
    etag: false,
    // Only cache assets, not HTML
    setHeaders: (res, pathStr) => {
      res.setHeader('Cache-Control', staticCacheControl(path.relative(frontendPath, pathStr)));
    }
  }));

  // SPA fallback: For all non-API routes that don't match files, serve index.html
  app.get('*', (req, res, next) => {
    // Skip API routes (let them hit the 404 handler below)
    if (req.path.startsWith('/api')) {
      return next();
    }

    // Skip requests for files that don't exist (images, etc.)
    const filePath = path.join(frontendPath, req.path);
    if (path.extname(filePath) && filePath.includes('.')) {
      return next();
    }

    // Serve index.html for all other routes (SPA routing)
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(frontendPath, 'index.html'), (err) => {
      if (err) {
        next(err);
      }
    });
  });
}

// ========================================
// ERROR HANDLING
// ========================================
app.use(notFound);
app.use(errorHandler);

module.exports = app;
