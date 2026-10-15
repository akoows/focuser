'use strict';
const crypto = require('node:crypto');
const prisma = require('../config/prisma');
const cloudinaryService = require('./cloudinaryService');

const TTL_MS = 30 * 60 * 1000;

async function createSignature(type) {
  const id = crypto.randomBytes(12).toString('hex');
  const signature = cloudinaryService.registrationUploadSignature(id, type);
  const now = new Date();
  await prisma.pendingProfileUpload.deleteMany({ where: { expiresAt: { lte: now } } });
  await prisma.pendingProfileUpload.create({
    data: { id, folder: signature.folder, expiresAt: new Date(now.getTime() + TTL_MS), usedAt: null },
  });
  return { ...signature, uploadId: id };
}

module.exports = { createSignature };
