/**
 * HTTP Cache headers middleware
 * Implements smart caching strategy
 */
const cacheMiddleware = (req, res, next) => {
  // Dynamic responses and missing assets must not survive a deployment.
  // The static-file handler explicitly opts successful assets into caching.
  res.set('Cache-Control', 'no-store');

  next();
};

module.exports = cacheMiddleware;
