'use strict';
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

exports.notFound = (req, res, next) => next(new AppError(404, 'ROUTE_NOT_FOUND', 'Rota não encontrada.'));

// eslint-disable-next-line no-unused-vars
exports.errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Erro interno do servidor.';
  let details;

  if (err instanceof AppError) ({ status, code, message, details } = err);
  else if (err.type === 'entity.parse.failed') [status, code, message] = [400, 'INVALID_JSON', 'JSON inválido.'];
  else if (err.type === 'entity.too.large') [status, code, message] = [413, 'PAYLOAD_TOO_LARGE', 'Corpo da requisição excede o limite.'];
  else if (err.code === 'P2002') [status, code, message] = [409, 'CONFLICT', 'Registro já existe.'];
  else if (err.code === 'P2023') [status, code, message] = [400, 'VALIDATION_ERROR', 'Identificador inválido.'];
  else if (err.code === 'P2025') [status, code, message] = [404, 'NOT_FOUND', 'Recurso não encontrado.'];

  if (status >= 500) logger.error('request_failed', err);

  // Nunca devolve stack trace nem mensagens internas (apenas código e mensagem controlados).
  return res.status(status).json({ success: false, error: { code, message, ...(details ? { details } : {}) } });
};
