'use strict';
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');
const config = require('../config/env');
const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const emailService = require('./emailService');
const { OBJECT_ID_REGEX } = require('../utils/constants');
const cloudinaryService = require('./cloudinaryService');

// Hash "isca": usado quando o e-mail não existe, para o tempo de resposta do login não revelar contas.
const DUMMY_HASH = bcrypt.hashSync('senha-isca-para-tempo-constante', config.bcryptCost);

const PUBLIC_SELECT = {
  id: true, name: true, email: true, username: true, bio: true, avatarUrl: true, bannerUrl: true,
  currentBookId: true, favoriteBookId: true, timezone: true, accentColor: true, createdAt: true, updatedAt: true,
};
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const publicUsername = (value) => typeof value === 'string' && !value.startsWith('~unset:') ? value : null;
const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  username: publicUsername(u.username),
  bio: u.bio || null,
  avatarUrl: u.avatarUrl || null,
  bannerUrl: u.bannerUrl || null,
  currentBookId: u.currentBookId || null,
  favoriteBookId: u.favoriteBookId || null,
  timezone: u.timezone,
  accentColor: u.accentColor || '#ffffff',
  createdAt: u.createdAt,
  updatedAt: u.updatedAt,
});

function createCodeHash(purpose, userId, code) {
  return crypto.createHmac('sha256', config.jwt.secret).update(`${purpose}:${userId}:${code}`).digest('hex');
}

function createCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function matchesCode(purpose, userId, code, codeHash) {
  const actual = Buffer.from(createCodeHash(purpose, userId, code), 'hex');
  const expected = Buffer.from(codeHash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function bypassEmailAuth(email) {
  return (config.env === 'development' || config.env === 'test') && email.toLowerCase().endsWith('@focuser.dev');
}

function createSession(user) {
  const token = jwt.sign({ tv: user.tokenVersion }, config.jwt.secret, {
    algorithm: 'HS256', subject: user.id, expiresIn: `${config.jwt.expiresInDays}d`,
  });
  return { user: publicUser(user), token };
}

async function sendCode(user, purpose) {
  const code = createCode();
  const isLogin = purpose === 'login';
  const fields = isLogin
    ? { loginCodeHash: createCodeHash(purpose, user.id, code), loginCodeExpiresAt: new Date(Date.now() + CODE_TTL_MS), loginCodeAttempts: 0 }
    : { emailVerificationCodeHash: createCodeHash(purpose, user.id, code), emailVerificationExpiresAt: new Date(Date.now() + CODE_TTL_MS), emailVerificationAttempts: 0 };
  await prisma.user.update({ where: { id: user.id }, data: fields });
  await emailService.sendCode({ to: user.email, code, purpose });
}

async function claimRegistrationUpload(tx, uploadId, imageUrl, type) {
  const upload = await tx.pendingProfileUpload.findUnique({ where: { id: uploadId } });
  const expectedFolder = upload?.folder;
  const validFolder = typeof expectedFolder === 'string'
    && expectedFolder.endsWith(`/registration/${uploadId}${type === 'banner' ? '/banner' : ''}`);
  if (!upload || upload.usedAt || upload.expiresAt <= new Date() || !validFolder
    || !cloudinaryService.isAssetUrlInFolder(imageUrl, expectedFolder)) {
    throw new AppError(400, 'PROFILE_IMAGE_UPLOAD_INVALID', 'A imagem selecionada expirou ou não foi enviada pelo fluxo de cadastro. Selecione-a novamente.');
  }
  const used = await tx.pendingProfileUpload.updateMany({
    where: { id: uploadId, usedAt: null, expiresAt: { gt: new Date() }, folder: expectedFolder },
    data: { usedAt: new Date() },
  });
  if (used.count !== 1) {
    throw new AppError(400, 'PROFILE_IMAGE_UPLOAD_INVALID', 'A imagem selecionada expirou ou já foi usada em outro cadastro.');
  }
  return imageUrl;
}

async function register({ name, username, email, password, timezone, avatarUploadId, avatarUrl, bannerUploadId, bannerUrl }) {
  const skipEmailAuth = bypassEmailAuth(email);
  if (!skipEmailAuth) emailService.assertConfigured();
  const passwordHash = await bcrypt.hash(password, config.bcryptCost);
  try {
    const user = await prisma.$transaction(async (tx) => {
      const verifiedAvatarUrl = await claimRegistrationUpload(tx, avatarUploadId, avatarUrl, 'avatar');
      const verifiedBannerUrl = bannerUploadId
        ? await claimRegistrationUpload(tx, bannerUploadId, bannerUrl, 'banner')
        : null;
      return tx.user.create({
        data: {
          name, username, email, passwordHash, avatarUrl: verifiedAvatarUrl, bannerUrl: verifiedBannerUrl,
          activeFocusSessionId: null, ...(skipEmailAuth ? { emailVerified: true } : {}), ...(timezone ? { timezone } : {}),
        },
        select: PUBLIC_SELECT,
      });
    });
    if (!skipEmailAuth) await sendCode(user, 'email-verification');
    return { user, emailVerificationRequired: !skipEmailAuth };
  } catch (err) {
    if (err.code === 'P2002') {
      const usernameCollision = await prisma.user.findUnique({ where: { username }, select: { id: true } });
      if (usernameCollision) throw new AppError(409, 'USERNAME_IN_USE', 'Este nome de usuário já está em uso.');
      throw new AppError(409, 'EMAIL_IN_USE', 'E-mail já cadastrado.');
    }
    throw err;
  }
}

async function login({ email, password }) {
  let user = await prisma.user.findUnique({ where: { email } });
  const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !ok) throw new AppError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha incorretos.'); // mensagem única
  if (bypassEmailAuth(user.email)) {
    if (!user.emailVerified) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerified: true,
          emailVerificationCodeHash: null,
          emailVerificationExpiresAt: null,
          emailVerificationAttempts: 0,
        },
      });
    }
    return createSession(user);
  }
  if (!user.emailVerified) {
    await sendCode(user, 'email-verification');
    return { emailVerificationRequired: true };
  }
  await sendCode(user, 'login');
  return { twoFactorRequired: true };
}

async function verifyEmail({ email, code }) {
  const user = await prisma.user.findUnique({ where: { email } });
  const genericError = () => new AppError(400, 'INVALID_OR_EXPIRED_CODE', 'Código inválido ou expirado.');
  if (!user || user.emailVerified || !user.emailVerificationCodeHash || !user.emailVerificationExpiresAt
    || user.emailVerificationExpiresAt <= new Date() || user.emailVerificationAttempts >= MAX_CODE_ATTEMPTS) {
    throw genericError();
  }
  if (!matchesCode('email-verification', user.id, code, user.emailVerificationCodeHash)) {
    const data = user.emailVerificationAttempts + 1 >= MAX_CODE_ATTEMPTS
      ? { emailVerificationCodeHash: null, emailVerificationExpiresAt: null, emailVerificationAttempts: 0 }
      : { emailVerificationAttempts: { increment: 1 } };
    const result = await prisma.user.updateMany({
      where: { id: user.id, emailVerificationCodeHash: user.emailVerificationCodeHash, emailVerified: false },
      data,
    });
    if (!result.count) throw genericError();
    throw genericError();
  }
  const result = await prisma.user.updateMany({
    where: { id: user.id, emailVerificationCodeHash: user.emailVerificationCodeHash, emailVerified: false, emailVerificationExpiresAt: { gt: new Date() } },
    data: { emailVerified: true, emailVerificationCodeHash: null, emailVerificationExpiresAt: null, emailVerificationAttempts: 0 },
  });
  if (!result.count) throw genericError();
  return { verified: true };
}

async function resendEmailVerification({ email }) {
  if (bypassEmailAuth(email)) {
    return { message: 'Se a conta existir e precisar de verificação, enviaremos um novo código.' };
  }
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, emailVerified: true } });
  if (user && !user.emailVerified) await sendCode(user, 'email-verification');
  return { message: 'Se a conta existir e precisar de verificação, enviaremos um novo código.' };
}

async function verifyLogin({ email, code }) {
  const user = await prisma.user.findUnique({ where: { email } });
  const genericError = () => new AppError(400, 'INVALID_OR_EXPIRED_CODE', 'Código inválido ou expirado.');
  if (!user || !user.emailVerified || !user.loginCodeHash || !user.loginCodeExpiresAt
    || user.loginCodeExpiresAt <= new Date() || user.loginCodeAttempts >= MAX_CODE_ATTEMPTS) {
    throw genericError();
  }
  if (!matchesCode('login', user.id, code, user.loginCodeHash)) {
    const data = user.loginCodeAttempts + 1 >= MAX_CODE_ATTEMPTS
      ? { loginCodeHash: null, loginCodeExpiresAt: null, loginCodeAttempts: 0 }
      : { loginCodeAttempts: { increment: 1 } };
    const result = await prisma.user.updateMany({
      where: { id: user.id, loginCodeHash: user.loginCodeHash, emailVerified: true },
      data,
    });
    if (!result.count) throw genericError();
    throw genericError();
  }
  const result = await prisma.user.updateMany({
    where: { id: user.id, loginCodeHash: user.loginCodeHash, emailVerified: true, loginCodeExpiresAt: { gt: new Date() } },
    data: { loginCodeHash: null, loginCodeExpiresAt: null, loginCodeAttempts: 0 },
  });
  if (!result.count) throw genericError();
  return createSession(user);
}

// Logout REAL: incrementa tokenVersion, invalidando todos os JWTs emitidos antes (o middleware compara tv).
async function logout(token) {
  if (!token || typeof token !== 'string') return;
  try {
    const p = jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] });
    if (typeof p.sub !== 'string' || !OBJECT_ID_REGEX.test(p.sub) || !Number.isInteger(p.tv)) return;
    await prisma.user.updateMany({ where: { id: p.sub, tokenVersion: p.tv }, data: { tokenVersion: { increment: 1 } } });
  } catch {
    /* token inválido/expirado: nada a revogar */
  }
}

module.exports = { register, login, verifyEmail, resendEmailVerification, verifyLogin, logout, publicUser, PUBLIC_SELECT };
