'use strict';
// Logger mínimo em JSON. NUNCA registre corpos de requisição, cookies, tokens ou senhas.
const write = (level, msg, meta) =>
  console[level === 'error' ? 'error' : 'log'](JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta }));

exports.info = (msg, meta) => write('info', msg, meta);
exports.warn = (msg, meta) => write('warn', msg, meta);

// Erros do Prisma carregam argumentos da query na mensagem (ex.: passwordHash, e-mail).
// Por isso, para esses erros, registramos apenas nome e código.
exports.error = (msg, err) => {
  const meta = { errName: err?.name, errCode: err?.code };
  const isPrisma = String(err?.name).startsWith('Prisma');
  if (err && !isPrisma) {
    meta.errMessage = err.message;
    if (process.env.NODE_ENV !== 'production') meta.stack = err.stack;
  }
  write('error', msg, meta);
};
