'use strict';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'mongodb://localhost:27017/focuser_test';
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-config-123';
process.env.RESEND_API_KEY = 're_test_key';
process.env.RESEND_FROM = 'Focuser <noreply@example.com>';

const assert = require('node:assert/strict');
const test = require('node:test');
const config = require('../../src/config/env');
const emailService = require('../../src/services/emailService');

test('sends authentication codes through the Resend API', async (t) => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true, status: 200 };
  };

  emailService.assertConfigured();
  await emailService.sendCode({ to: 'person@example.com', code: '123456', purpose: 'login' });

  assert.equal(request.url, 'https://api.resend.com/emails');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers.Authorization, 'Bearer re_test_key');
  const payload = JSON.parse(request.options.body);
  assert.equal(payload.from, 'Focuser <noreply@example.com>');
  assert.deepEqual(payload.to, ['person@example.com']);
  assert.equal(payload.subject, 'Seu código de acesso ao Focuser');
  assert.match(payload.text, /123456/);
});

test('reports missing Resend configuration explicitly', () => {
  const apiKey = config.resend.apiKey;
  const from = config.resend.from;
  config.resend.apiKey = '';
  config.resend.from = '';
  try {
    assert.throws(emailService.assertConfigured, (error) => error.code === 'EMAIL_NOT_CONFIGURED' && error.status === 503);
  } finally {
    config.resend.apiKey = apiKey;
    config.resend.from = from;
  }
});

test('maps Resend API errors to the standard delivery error', async (t) => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async () => ({ ok: false, status: 422 });

  await assert.rejects(
    emailService.sendCode({ to: 'person@example.com', code: '123456', purpose: 'login' }),
    (error) => error.code === 'EMAIL_DELIVERY_FAILED' && error.status === 503,
  );
});
