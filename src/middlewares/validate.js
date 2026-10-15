'use strict';
const AppError = require('../utils/AppError');

// validate({ params, query, body }) -> resultados em req.valid.{params,query,body}
module.exports = (schemas) => (req, res, next) => {
  const valid = {};
  for (const part of ['params', 'query', 'body']) {
    if (!schemas[part]) continue;
    const r = schemas[part].safeParse(req[part]);
    if (!r.success) {
      const details = r.error.issues.map((i) => ({ field: i.path.join('.') || part, message: i.message }));
      return next(new AppError(400, 'VALIDATION_ERROR', 'Dados inválidos.', details));
    }
    valid[part] = r.data;
  }
  req.valid = valid;
  return next();
};
