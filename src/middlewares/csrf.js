'use strict';
// Defesa CSRF para cookies de sessão: (1) SameSite no cookie; (2) em métodos que alteram estado,
// exige o cabeçalho customizado X-Focuser-Client (formulários cross-site não conseguem enviá-lo e
// requisições cross-origin com ele exigem preflight CORS, que só autoriza origens da lista);
// (3) em produção, se houver Origin, precisa estar na lista permitida; em desenvolvimento, aceita qualquer origem.
const config = require('../config/env');
const AppError = require('../utils/AppError');

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

module.exports = (req, res, next) => {
  if (SAFE.has(req.method)) return next();
  const origin = req.get('origin');
  if (origin && !config.isDevelopment && !config.corsOrigins.includes(origin)) return next(new AppError(403, 'CSRF_ORIGIN_NOT_ALLOWED', 'Origem não permitida.'));
  if (req.get('x-focuser-client') !== 'web') return next(new AppError(403, 'CSRF_HEADER_MISSING', 'Cabeçalho X-Focuser-Client ausente.'));
  return next();
};
