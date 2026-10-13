// Only Vite's content-hashed build outputs are safe to cache indefinitely.
// Stable URLs (HTML, service workers, public icons) can change at deployment.
function staticCacheControl(relativePath) {
  const original = relativePath.replace(/\\/g, '/').replace(/\.(br|gz)$/, '');
  if (/\.html$/i.test(original) || /^(sw\.js|registerSW\.js)$/.test(original)) {
    return 'no-store';
  }
  if (/^(js|css|images|fonts|assets)\/[^/]+-[A-Za-z0-9_-]{8,}\.[^/]+$/.test(original)) {
    return 'public, max-age=31536000, immutable';
  }
  return 'public, max-age=0, must-revalidate';
}

module.exports = { staticCacheControl };
