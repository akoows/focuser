'use strict';
const logger = require('../utils/logger');
const config = require('../config/env');

// Loga somente método, caminho (sem query string), status e duração. Nada de corpo/cookies/cabeçalhos.
module.exports = (req, res, next) => {
  if (config.isTest) return next();
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    logger.info('http', { method: req.method, path: req.path, status: res.statusCode, ms: Number((process.hrtime.bigint() - start) / 1000000n) });
  });
  return next();
};
