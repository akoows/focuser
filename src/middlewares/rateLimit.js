'use strict';
const rateLimit = require('express-rate-limit');
const AppError = require('../utils/AppError');

const handler = (req, res, next) => next(new AppError(429, 'RATE_LIMITED', 'Muitas requisições. Tente novamente mais tarde.'));
const base = { standardHeaders: 'draft-7', legacyHeaders: false, handler };

// Armazenamento em memória (por processo). Em produção com várias instâncias, use um store compartilhado.
module.exports = (limits) => ({
  global: rateLimit({ ...base, windowMs: 15 * 60 * 1000, limit: limits.globalMax }),
  // Conta apenas tentativas FALHAS: protege contra força bruta sem punir logins legítimos.
  login: rateLimit({ ...base, windowMs: 15 * 60 * 1000, limit: limits.loginMax, skipSuccessfulRequests: true }),
  register: rateLimit({ ...base, windowMs: 60 * 60 * 1000, limit: limits.registerMax }),
  authCode: rateLimit({ ...base, windowMs: 15 * 60 * 1000, limit: limits.authCodeMax }),
  // Por usuário autenticado (precisa rodar depois do auth): protege custos do provedor de IA.
  ai: rateLimit({ ...base, windowMs: 60 * 60 * 1000, limit: limits.aiMax, keyGenerator: (req) => `ai:${req.user.id}` }),
  isbnLookup: rateLimit({ ...base, windowMs: 60 * 60 * 1000, limit: limits.isbnLookupMax, keyGenerator: (req) => `isbn:${req.user.id}` }),
});
