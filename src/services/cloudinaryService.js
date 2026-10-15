'use strict';
const crypto = require('node:crypto');
const config = require('../config/env');
const AppError = require('../utils/AppError');

function profileImageUploadSignature(userId, type) {
  const { cloudName, apiKey, apiSecret, folder: baseFolder } = config.cloudinary;
  const kind = type === 'banner' ? 'BANNER' : 'AVATAR';
  if (!cloudName || !apiKey || !apiSecret) {
    throw new AppError(503, `${kind}_UPLOAD_NOT_CONFIGURED`, 'O envio de imagens do perfil não está configurado no servidor.');
  }
  if (!/^[A-Za-z0-9_-]+$/.test(cloudName) || !/^[A-Za-z0-9/_-]{1,100}$/.test(baseFolder)) {
    throw new AppError(500, `${kind}_UPLOAD_MISCONFIGURED`, 'A configuração do envio de imagens do perfil está inválida.');
  }

  const folder = `${baseFolder.replace(/\/+$/, '')}/${userId}${type === 'banner' ? '/banner' : ''}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto.createHash('sha1')
    .update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`)
    .digest('hex');

  return { cloudName, apiKey, folder, timestamp, signature };
}

function registrationUploadSignature(uploadId, type) {
  const { cloudName, apiKey, apiSecret, folder: baseFolder } = config.cloudinary;
  const kind = type === 'banner' ? 'BANNER' : 'AVATAR';
  if (!cloudName || !apiKey || !apiSecret) {
    throw new AppError(503, `${kind}_UPLOAD_NOT_CONFIGURED`, 'O envio de imagens do perfil não está configurado no servidor.');
  }
  if (!/^[A-Za-z0-9_-]+$/.test(cloudName) || !/^[A-Za-z0-9/_-]{1,100}$/.test(baseFolder)) {
    throw new AppError(500, `${kind}_UPLOAD_MISCONFIGURED`, 'A configuração do envio de imagens do perfil está inválida.');
  }
  const folder = `${baseFolder.replace(/\/+$/, '')}/registration/${uploadId}${type === 'banner' ? '/banner' : ''}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto.createHash('sha1')
    .update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`)
    .digest('hex');
  return { cloudName, apiKey, folder, timestamp, signature };
}

function isAssetUrlInFolder(value, folder) {
  if (typeof value !== 'string' || !config.cloudinary.cloudName) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com' || url.search || url.hash) return false;
    const prefix = `/${config.cloudinary.cloudName}/image/upload/`;
    if (!url.pathname.startsWith(prefix)) return false;
    const assetPath = url.pathname.slice(prefix.length).replace(/^v\d+\//, '');
    return assetPath.startsWith(`${folder}/`);
  } catch {
    return false;
  }
}

const avatarUploadSignature = (userId) => profileImageUploadSignature(userId, 'avatar');
const bannerUploadSignature = (userId) => profileImageUploadSignature(userId, 'banner');

module.exports = { avatarUploadSignature, bannerUploadSignature, registrationUploadSignature, isAssetUrlInFolder };
