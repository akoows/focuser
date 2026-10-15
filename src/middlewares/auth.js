'use strict';
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { OBJECT_ID_REGEX } = require('../utils/constants');

const unauth = (code, msg) => new AppError(401, code, msg);

// O usuário é SEMPRE identificado pelo token validado (cookie httpOnly). Nunca por userId do cliente.
module.exports = asyncHandler(async (req, res, next) => {
  const token = req.cookies?.[config.cookie.name];
  if (!token || typeof token !== 'string') throw unauth('UNAUTHENTICATED', 'Autenticação necessária.');

  let payload;
  try {
    payload = jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] }); // 'none' e outros algoritmos rejeitados
  } catch {
    throw unauth('INVALID_TOKEN', 'Sessão inválida ou expirada.');
  }
  if (typeof payload.sub !== 'string' || !OBJECT_ID_REGEX.test(payload.sub)) throw unauth('INVALID_TOKEN', 'Sessão inválida ou expirada.');

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true, name: true, email: true, username: true, bio: true, avatarUrl: true, bannerUrl: true,
      currentBookId: true, favoriteBookId: true, timezone: true, accentColor: true,
      tokenVersion: true, createdAt: true, updatedAt: true,
    },
  });
  // tokenVersion diferente => logout já ocorreu: token revogado.
  if (!user || user.tokenVersion !== payload.tv) throw unauth('INVALID_TOKEN', 'Sessão inválida ou expirada.');

  req.user = user;
  next();
});
