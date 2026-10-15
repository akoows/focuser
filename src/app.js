'use strict';
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const config = require('./config/env');
const buildLimiters = require('./middlewares/rateLimit');
const requestLogger = require('./middlewares/requestLogger');
const csrfGuard = require('./middlewares/csrf');
const requireAuth = require('./middlewares/auth');
const { notFound, errorHandler } = require('./middlewares/errorHandler');
const routes = require('./routes');

// opts.rateLimits permite sobrescrever limites (usado nos testes de rate limiting).
function createApp(opts = {}) {
  const limiters = buildLimiters({ ...config.rateLimit, ...(opts.rateLimits || {}) });
  const app = express();

  app.disable('x-powered-by');
  if (config.trustProxy > 0) app.set('trust proxy', config.trustProxy);

  app.use(helmet());
  app.use(cors({
    // Em desenvolvimento, aceita qualquer origem de rede mantendo credenciais; produção continua usando allowlist.
    origin: (origin, cb) => cb(null, !origin || config.isDevelopment || config.corsOrigins.includes(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Focuser-Client'],
    maxAge: 600,
  }));
  app.use(requestLogger);
  app.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }); // respostas privadas não devem ser cacheadas
  app.use(limiters.global);
  app.use(express.json({ limit: config.bodyLimit }));
  app.use(cookieParser());
  app.use(csrfGuard);

  app.use('/api/auth/login', limiters.login);
  app.use('/api/auth/register', limiters.register);
  app.use('/api/auth/registration-avatar-signature', limiters.register);
  app.use('/api/auth/registration-banner-signature', limiters.register);
  app.use('/api/auth/login', limiters.authCode);
  app.use('/api/auth/verify-email', limiters.authCode);
  app.use('/api/auth/resend-verification', limiters.authCode);
  app.use('/api/auth/verify-login', limiters.authCode);
  app.use('/api/users/me/password-change', limiters.authCode);
  app.use('/api/ai', requireAuth, limiters.ai);
  app.use('/api/reading/isbn-lookup', requireAuth, limiters.isbnLookup);
  app.use('/api', routes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
