'use strict';
require('dotenv').config();

const str = (name, def = '') => (process.env[name] === undefined || process.env[name] === '' ? def : process.env[name]);
const int = (name, def) => {
  const raw = str(name, '');
  if (raw === '') return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${name} deve ser um inteiro >= 0`);
  return n;
};

const env = str('NODE_ENV', 'development');
const isProd = env === 'production';
const isTest = env === 'test';
const isDevelopment = env === 'development';

// Falha rápida: sem segredo forte ou banco, o servidor não sobe.
const jwtSecret = str('JWT_SECRET');
if (jwtSecret.length < 32) throw new Error('JWT_SECRET é obrigatório e deve ter pelo menos 32 caracteres');
if (!str('DATABASE_URL')) throw new Error('DATABASE_URL é obrigatório');

if (isProd && !str('CORS_ORIGINS')) throw new Error('CORS_ORIGINS é obrigatório em produção');
const corsOrigins = str('CORS_ORIGINS', 'http://localhost:8080,http://127.0.0.1:8080,http://localhost:5173')
  .split(',').map((s) => s.trim()).filter(Boolean);
if (corsOrigins.includes('*')) throw new Error('CORS_ORIGINS não pode conter "*"');

const sameSite = str('COOKIE_SAMESITE', 'lax').toLowerCase();
if (!['lax', 'strict'].includes(sameSite)) throw new Error('COOKIE_SAMESITE deve ser "lax" ou "strict"');

const bcryptCost = int('BCRYPT_COST', 12);
if (!isTest && bcryptCost < 10) throw new Error('BCRYPT_COST deve ser >= 10 fora do ambiente de teste');

module.exports = {
  env, isProd, isTest, isDevelopment,
  port: int('PORT', 3000),
  trustProxy: int('TRUST_PROXY', 0),
  bodyLimit: '10kb',
  corsOrigins,
  bcryptCost,
  jwt: { secret: jwtSecret, expiresInDays: int('JWT_EXPIRES_IN_DAYS', 7) },
  cookie: { name: 'focuser_token', secure: str('COOKIE_SECURE', isProd ? 'true' : 'false') === 'true', sameSite },
  resend: {
    apiKey: str('RESEND_API_KEY'),
    from: str('RESEND_FROM'),
  },
  cloudinary: {
    cloudName: str('CLOUDINARY_CLOUD_NAME'),
    apiKey: str('CLOUDINARY_API_KEY'),
    apiSecret: str('CLOUDINARY_API_SECRET'),
    folder: str('CLOUDINARY_FOLDER', 'focuser/avatars'),
  },
  rateLimit: {
    globalMax: int('RATE_LIMIT_GLOBAL_MAX', 300),
    loginMax: int('RATE_LIMIT_LOGIN_MAX', 10),
    registerMax: int('RATE_LIMIT_REGISTER_MAX', 10),
    authCodeMax: int('RATE_LIMIT_AUTH_CODE_MAX', 10),
    aiMax: int('RATE_LIMIT_AI_PER_HOUR', 5),
    isbnLookupMax: int('RATE_LIMIT_ISBN_LOOKUP_PER_HOUR', 20),
  },
  groq: {
    apiKey: str('GROQ_API_KEY'),
    model: str('GROQ_MODEL', 'qwen/qwen3.8-27b'),
    timeoutMs: int('GROQ_TIMEOUT_MS', 15000),
  },
  googleBooks: {
    apiKey: str('GOOGLE_BOOKS_API_KEY'),
    timeoutMs: int('GOOGLE_BOOKS_TIMEOUT_MS', 12000),
  },
};
