'use strict';
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = 'dev-network-test-secret-that-is-long-enough-123456789';
process.env.DATABASE_URL = 'mongodb://localhost:27017/focuser_dev_network_test';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const config = require('../../src/config/env');
const { createApp } = require('../../src/app');

describe('Rede da API em desenvolvimento', () => {
  const app = createApp();
  const origin = 'http://26.183.22.250:4173';

  it('aceita origem de rede em CORS e em requisições de escrita', async () => {
    config.isDevelopment = true;
    const read = await request(app).get('/api/health').set('Origin', origin);
    assert.equal(read.status, 200);
    assert.equal(read.headers['access-control-allow-origin'], origin);
    assert.equal(read.headers['access-control-allow-credentials'], 'true');

    const preflight = await request(app).options('/api/auth/login')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,x-focuser-client');
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers['access-control-allow-origin'], origin);

    const readingFocusPreflight = await request(app).options('/api/users/me/reading-focus')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'PUT')
      .set('Access-Control-Request-Headers', 'content-type,x-focuser-client');
    assert.equal(readingFocusPreflight.status, 204);
    assert.match(readingFocusPreflight.headers['access-control-allow-methods'], /\bPUT\b/);

    const write = await request(app).post('/api/auth/login')
      .set('Origin', origin)
      .set('X-Focuser-Client', 'web')
      .send({});
    assert.equal(write.status, 400);
    assert.equal(write.body.error.code, 'VALIDATION_ERROR');
  });

  it('mantém origem não autorizada bloqueada fora de desenvolvimento', async () => {
    const originalIsDevelopment = config.isDevelopment;
    config.isDevelopment = false;
    try {
      const read = await request(app).get('/api/health').set('Origin', origin);
      assert.equal(read.headers['access-control-allow-origin'], undefined);

      const write = await request(app).post('/api/auth/login')
        .set('Origin', origin)
        .set('X-Focuser-Client', 'web')
        .send({});
      assert.equal(write.status, 403);
      assert.equal(write.body.error.code, 'CSRF_ORIGIN_NOT_ALLOWED');
    } finally {
      config.isDevelopment = originalIsDevelopment;
    }
  });
});
