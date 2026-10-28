// Test-only defaults; production still requires externally supplied secrets.
process.env.JWT_ACCESS_SECRET = 'kapdakraft-test-access-secret';
process.env.JWT_REFRESH_SECRET = 'kapdakraft-test-refresh-secret';
process.env.NODE_ENV = 'test';
