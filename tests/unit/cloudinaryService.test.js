'use strict';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'mongodb://localhost:27017/focuser_test';
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-config-123';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const config = require('../../src/config/env');
const cloudinaryService = require('../../src/services/cloudinaryService');

test('signs an avatar upload scoped to the user folder', () => {
  const previous = { ...config.cloudinary };
  Object.assign(config.cloudinary, {
    cloudName: 'test-cloud',
    apiKey: 'test-api-key',
    apiSecret: 'test-api-secret',
    folder: 'focuser/avatars',
  });
  try {
    const upload = cloudinaryService.avatarUploadSignature('user123');
    assert.equal(upload.cloudName, 'test-cloud');
    assert.equal(upload.apiKey, 'test-api-key');
    assert.equal(upload.folder, 'focuser/avatars/user123');
    assert.ok(Number.isInteger(upload.timestamp));
    const expected = crypto.createHash('sha1')
      .update(`folder=${upload.folder}&timestamp=${upload.timestamp}test-api-secret`)
      .digest('hex');
    assert.equal(upload.signature, expected);
    assert.ok(!JSON.stringify(upload).includes('test-api-secret'));
  } finally {
    Object.assign(config.cloudinary, previous);
  }
});

test('requires Cloudinary credentials before signing uploads', () => {
  const previous = { ...config.cloudinary };
  Object.assign(config.cloudinary, { cloudName: '', apiKey: '', apiSecret: '' });
  try {
    assert.throws(
      () => cloudinaryService.avatarUploadSignature('user123'),
      (error) => error.code === 'AVATAR_UPLOAD_NOT_CONFIGURED' && error.status === 503,
    );
  } finally {
    Object.assign(config.cloudinary, previous);
  }
});

test('signs a banner upload in a separate user-scoped folder', () => {
  const previous = { ...config.cloudinary };
  Object.assign(config.cloudinary, {
    cloudName: 'test-cloud',
    apiKey: 'test-api-key',
    apiSecret: 'test-api-secret',
    folder: 'focuser/avatars',
  });
  try {
    const upload = cloudinaryService.bannerUploadSignature('user123');
    assert.equal(upload.folder, 'focuser/avatars/user123/banner');
    const expected = crypto.createHash('sha1')
      .update(`folder=${upload.folder}&timestamp=${upload.timestamp}test-api-secret`)
      .digest('hex');
    assert.equal(upload.signature, expected);
  } finally {
    Object.assign(config.cloudinary, previous);
  }
});
