'use strict';
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const emailService = require('./emailService');
const { PUBLIC_SELECT, publicUser } = require('./authService');
const cloudinaryService = require('./cloudinaryService');

const PASSWORD_CODE_TTL_MS = 10 * 60 * 1000;
const MAX_PASSWORD_CODE_ATTEMPTS = 5;

function passwordCodeHash(userId, code) {
  return crypto.createHmac('sha256', config.jwt.secret).update(`password-change:${userId}:${code}`).digest('hex');
}

function matchesPasswordCode(userId, code, hash) {
  const actual = Buffer.from(passwordCodeHash(userId, code), 'hex');
  const expected = Buffer.from(hash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function isProfileImageUrlForUser(value, userId, type) {
  if (value === null) return true;
  const folder = `${config.cloudinary.folder.replace(/\/+$/, '')}/${userId}${type === 'banner' ? '/banner' : ''}`;
  return cloudinaryService.isAssetUrlInFolder(value, folder);
}

async function update(userId, data) {
  if (Object.hasOwn(data, 'avatarUrl') && !isProfileImageUrlForUser(data.avatarUrl, userId, 'avatar')) {
    throw new AppError(400, 'INVALID_AVATAR_URL', 'O avatar precisa ser uma imagem enviada para a pasta Cloudinary da sua conta.');
  }
  if (Object.hasOwn(data, 'bannerUrl') && !isProfileImageUrlForUser(data.bannerUrl, userId, 'banner')) {
    throw new AppError(400, 'INVALID_BANNER_URL', 'O banner precisa ser uma imagem enviada para a pasta Cloudinary da sua conta.');
  }
  const bookChecks = [];
  if (data.currentBookId) {
    bookChecks.push(prisma.readingBook.findFirst({
      where: { id: data.currentBookId, userId, isActive: true },
      select: { id: true },
    }).then((book) => {
      if (!book) throw new AppError(404, 'CURRENT_BOOK_NOT_FOUND', 'O livro em leitura não foi encontrado entre os livros ativos da sua conta.');
    }));
  }
  if (data.favoriteBookId) {
    bookChecks.push(prisma.readingBook.findFirst({
      where: { id: data.favoriteBookId, userId },
      select: { id: true },
    }).then((book) => {
      if (!book) throw new AppError(404, 'FAVORITE_BOOK_NOT_FOUND', 'O livro favorito não foi encontrado entre os livros da sua conta.');
    }));
  }
  await Promise.all(bookChecks);
  const storedData = Object.hasOwn(data, 'username') && data.username === null
    ? { ...data, username: `~unset:${userId}` }
    : data;
  try {
    return await prisma.user.update({ where: { id: userId }, data: storedData, select: PUBLIC_SELECT });
  } catch (error) {
    if (error.code === 'P2002' && Object.hasOwn(data, 'username')) {
      throw new AppError(409, 'USERNAME_IN_USE', 'Este nome de usuário já está em uso.');
    }
    throw error;
  }
}

async function updateReadingFocus(userId, { bookId, sessionId }) {
  const book = await prisma.readingBook.findFirst({
    where: { id: bookId, userId, isActive: true },
    select: { id: true },
  });
  if (!book) {
    throw new AppError(404, 'READING_BOOK_NOT_FOUND', 'O livro da sessão de foco não foi encontrado entre os livros ativos da sua conta.');
  }

  const now = new Date();
  const result = await prisma.user.updateMany({
    where: {
      id: userId,
      OR: [
        { readingFocusSessionId: sessionId },
        { readingFocusUpdatedAt: null },
        { readingFocusUpdatedAt: { isSet: false } },
        { readingFocusUpdatedAt: { lt: new Date(now.getTime() - 2 * 60 * 1000) } },
      ],
    },
    data: {
      readingFocusBookId: book.id,
      readingFocusSessionId: sessionId,
      readingFocusUpdatedAt: now,
    },
  });
  if (result.count !== 1) {
    throw new AppError(409, 'READING_FOCUS_ALREADY_ACTIVE', 'Já existe outra sessão de leitura em foco ativa nesta conta.');
  }
  return { status: 'FOCUS' };
}

async function clearReadingFocus(userId, sessionId) {
  await prisma.user.updateMany({
    where: { id: userId, readingFocusSessionId: sessionId },
    data: {
      readingFocusBookId: null,
      readingFocusSessionId: null,
      readingFocusUpdatedAt: null,
    },
  });
}

async function publicProfile(username) {
  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true, name: true, username: true, bio: true, avatarUrl: true, bannerUrl: true,
      currentBookId: true, favoriteBookId: true, accentColor: true, activeFocusSessionId: true,
      readingFocusBookId: true, readingFocusUpdatedAt: true, createdAt: true,
    },
  });
  if (!user || user.username?.startsWith('~unset:')) {
    throw new AppError(404, 'PUBLIC_PROFILE_NOT_FOUND', 'Este perfil público não foi encontrado.');
  }

  const [profileBook, favoriteBook, activeFocusSession, readingFocusBook, readingHistory] = await Promise.all([
    user.currentBookId
      ? prisma.readingBook.findFirst({
        where: { id: user.currentBookId, userId: user.id, isActive: true },
        select: { id: true, title: true, author: true, coverId: true, coverUrl: true, currentPage: true, totalPages: true },
      })
      : null,
    user.favoriteBookId
      ? prisma.readingBook.findFirst({
        where: { id: user.favoriteBookId, userId: user.id },
        select: { id: true, title: true, author: true, coverId: true, coverUrl: true },
      })
      : null,
    user.activeFocusSessionId
      ? prisma.focusSession.findFirst({
        where: { id: user.activeFocusSessionId, userId: user.id },
        select: { status: true },
      })
      : null,
    user.readingFocusBookId && user.readingFocusUpdatedAt && user.readingFocusUpdatedAt.getTime() >= Date.now() - 2 * 60 * 1000
      ? prisma.readingBook.findFirst({
        where: { id: user.readingFocusBookId, userId: user.id, isActive: true },
        select: { id: true, title: true, author: true, coverId: true, coverUrl: true, currentPage: true, totalPages: true },
      })
      : null,
    prisma.readingLog.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        pagesRead: true,
        minutesRead: true,
        loggedAt: true,
        book: { select: { id: true, title: true, author: true } },
      },
      orderBy: { loggedAt: 'desc' },
      take: 20,
    }),
  ]);

  return {
    id: user.id,
    name: user.name,
    username: user.username,
    bio: user.bio || null,
    avatarUrl: user.avatarUrl || null,
    bannerUrl: user.bannerUrl || null,
    accentColor: user.accentColor || '#ffffff',
    status: activeFocusSession?.status === 'RUNNING' || Boolean(readingFocusBook) ? 'FOCUS' : null,
    currentBook: readingFocusBook || profileBook,
    favoriteBook,
    readingHistory,
    createdAt: user.createdAt,
  };
}

async function startPasswordChange(userId, { currentPassword, newPassword }) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, passwordHash: true },
  });
  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'A senha atual está incorreta.');
  }
  if (!(await bcrypt.compare(newPassword, user.passwordHash))) {
    emailService.assertConfigured();
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordChangeCodeHash: passwordCodeHash(userId, code),
        passwordChangeCodeExpiresAt: new Date(Date.now() + PASSWORD_CODE_TTL_MS),
        passwordChangeCodeAttempts: 0,
      },
    });
    await emailService.sendCode({ to: user.email, code, purpose: 'password-change' });
  } else {
    throw new AppError(400, 'PASSWORD_UNCHANGED', 'A nova senha deve ser diferente da senha atual.');
  }
  return { message: 'Enviamos um código para confirmar a alteração da senha.' };
}

async function verifyPasswordChange(userId, { code, newPassword }) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, passwordChangeCodeHash: true, passwordChangeCodeExpiresAt: true, passwordChangeCodeAttempts: true },
  });
  const invalidCode = () => new AppError(400, 'INVALID_OR_EXPIRED_CODE', 'Código inválido ou expirado.');
  if (!user || !user.passwordChangeCodeHash || !user.passwordChangeCodeExpiresAt
    || user.passwordChangeCodeExpiresAt <= new Date() || user.passwordChangeCodeAttempts >= MAX_PASSWORD_CODE_ATTEMPTS) {
    throw invalidCode();
  }
  if (!matchesPasswordCode(userId, code, user.passwordChangeCodeHash)) {
    const data = user.passwordChangeCodeAttempts + 1 >= MAX_PASSWORD_CODE_ATTEMPTS
      ? { passwordChangeCodeHash: null, passwordChangeCodeExpiresAt: null, passwordChangeCodeAttempts: 0 }
      : { passwordChangeCodeAttempts: { increment: 1 } };
    const result = await prisma.user.updateMany({
      where: { id: userId, passwordChangeCodeHash: user.passwordChangeCodeHash },
      data,
    });
    if (!result.count) throw invalidCode();
    throw invalidCode();
  }

  const passwordHash = await bcrypt.hash(newPassword, config.bcryptCost);
  const updated = await prisma.user.updateMany({
    where: {
      id: userId,
      passwordChangeCodeHash: user.passwordChangeCodeHash,
      passwordChangeCodeExpiresAt: { gt: new Date() },
      passwordChangeCodeAttempts: { lt: MAX_PASSWORD_CODE_ATTEMPTS },
    },
    data: {
      passwordHash,
      tokenVersion: { increment: 1 },
      passwordChangeCodeHash: null,
      passwordChangeCodeExpiresAt: null,
      passwordChangeCodeAttempts: 0,
      loginCodeHash: null,
      loginCodeExpiresAt: null,
      loginCodeAttempts: 0,
    },
  });
  if (!updated.count) throw invalidCode();

  const refreshedUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { ...PUBLIC_SELECT, tokenVersion: true },
  });
  const token = jwt.sign({ tv: refreshedUser.tokenVersion }, config.jwt.secret, {
    algorithm: 'HS256',
    subject: userId,
    expiresIn: `${config.jwt.expiresInDays}d`,
  });
  return { user: publicUser(refreshedUser), token };
}

module.exports = { update, updateReadingFocus, clearReadingFocus, publicProfile, startPasswordChange, verifyPasswordChange };
