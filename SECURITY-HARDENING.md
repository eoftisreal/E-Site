# Security hardening — October 2026

This change addresses the audit's application-level findings while retaining Express, MongoDB, Cloudflare R2, and Appwrite hosting.

## Behavior changes

- All order status endpoints share one role/transition policy. Payment approval and rejection require `master_admin`; fulfillment requires captured payment. Stock release, payment status, sales counters and history writes are transactional.
- Customer cancellation and admin rejection/cancellation restore stock once. Pending, unpaid reservations expire after 30 minutes; catalogue requests and checkout release expired reservations in bounded batches. At most three pending/awaiting-verification orders per customer are allowed, including concurrent checkouts. Awaiting-verification orders remain reserved for manual payment review.
- Password reset increments an authentication version and removes outstanding refresh, reset, and magic-link records in one transaction. Existing access tokens, refresh tokens and `/me` renewal fail after reset. Legacy tokens remain usable until their existing expiry or a password reset.
- Recovery links have explicit lifetime checks and atomic consumption. The existing `expiresAt = issue time` plus TTL-offset convention is preserved, so no TTL migration is necessary. Magic-link issuance/consumption and password reset require replica-set transactions, as checkout already does.
- Profile and admin user responses use field allowlists; order exports populate only contact fields. Schema JSON serialization also strips credentials and internal authentication fields.
- Production CSP restricts scripts to the site itself, blocks object embedding, and limits framing/forms. Product description HTML is sanitized after parsing.
- CORS accepts the storefront, `APP_URL`, and explicit extra origins; credentialed cross-origin access is disabled because authentication uses Bearer headers.
- Rate counters persist in MongoDB across Appwrite containers; account-based limits supplement IP limits. Multipart uploads have limits on fields, nesting and parts as well as file bytes. HTTP logs omit query strings.
- The browser saves rotated refresh tokens. Excel export retains `.xlsx` output using an export-only writer instead of the vulnerable `xlsx` package. The rich-text editor uses the maintained React Quill fork, and the router/dependency lockfiles are updated.

## Before deploying

1. Confirm `APP_URL` is the canonical HTTPS storefront URL. Add required additional browser origins to `CORS_ORIGINS`; for a separately hosted API also add its origin to `CSP_CONNECT_ORIGINS`.
2. **Verify proxy identity configuration.** `TRUST_PROXY` is empty by default, so client-supplied forwarding headers are ignored. Behind Appwrite this can group users under the loopback/proxy address and make strict IP limits shared. Set only verified proxy CIDRs/names after confirming that the upstream removes attacker-supplied forwarding headers. Do not set trust-all or guess a hop count. Account limits remain independent of IP.
3. MongoDB must support transactions and the app's database user must be able to create the `rate_limits.resetAt` TTL index. The index is created when connecting. Do not put rate-limit data in a public Appwrite collection.
4. Confirm the 30-minute pending-payment window matches store policy. Cleanup is request-driven: without traffic it runs on the next catalogue/checkout request, rather than at an exact wall-clock deadline. A backlog larger than 25 orders drains over subsequent requests.
5. Review historical stock before reconciliation. Already-cancelled/rejected orders are not automatically restocked because their inventory may already have been manually adjusted. New transitions and pending-order expiry are protected from duplicate restoration.
6. Review existing orders with inconsistent payment/status history separately. The new policy deliberately rejects fulfillment without `payment.status = captured`; it does not infer that payment occurred from a historical UI label.
7. Smoke-test storefront, login/reset, admin editor, checkout and Excel download on an Appwrite preview before merging/deploying. No Cloudflare account settings were changed.

## Validation

- `cd backend && npm ci && npm test`: 26 tests covering real MongoDB replica-set transactions, concurrent cancellation/checkout, role bypass regression, credential serialization, expired/single-use links, refresh rotation, session revocation, shared limiter counters, CSP, proxy trust and CORS.
- `node --test backend/test-appwrite/*.test.cjs`: 4 Appwrite adapter/static-cache tests.
- `cd frontend && npm ci && npm run build`: TypeScript and production bundle build.
- An automated Chromium browser smoke test was attempted but could not run because the browser download returned an invalid archive. Browser interactions (especially the editor, Excel download and production CSP) still need preview verification.
- `npm audit --omit=dev`: backend has no flagged production package entries; frontend has two low-rated entries (`quill` and its React wrapper), with no moderate/high/critical production entries at the time of validation. This is advisory matching, not a claim of complete security.

## Remaining work

- Refresh tokens are still stored in browser localStorage. Moving them to HttpOnly cookies requires coordinated CSRF, CORS and multi-origin decisions; CSP and sanitization reduce exposure but do not eliminate this residual risk.
- The remaining Quill advisory concerns HTML export. This application does not call that export feature and sanitizes displayed product HTML, but the dependency alert remains. Replacing the rich-text editor or adopting a patched compatible release is follow-up work.
- Development/build dependencies still have advisory matches. No forced downgrade of the PWA/tooling stack was applied. Review those separately before accepting untrusted build input.
- Cloudflare WAF, TLS mode, DNS proxy status, bot controls, R2 IAM/bucket privacy and direct-origin access require an authenticated account review. These repository changes do not establish their configuration.
- Approval emails remain synchronous after the committed transition. Duplicate approval requests are rejected, but a mail-provider failure after commit still needs operator follow-up; a transactional outbox would improve delivery reliability.
