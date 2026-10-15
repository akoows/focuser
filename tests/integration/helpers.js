'use strict';
// Infra dos testes de integração. Exige MongoDB (replica set) em TEST_DATABASE_URL.
// Sem essa variável, os testes são PULADOS (skip) — nunca contam como aprovados.
const request = require('supertest');

const TEST_URL = process.env.TEST_DATABASE_URL || '';
const HAS_DB = Boolean(TEST_URL);
if (HAS_DB && !/test/i.test(TEST_URL)) {
  throw new Error('TEST_DATABASE_URL deve conter "test" no nome do banco (proteção contra apagar dados reais).');
}

// Ambiente de teste ISOLADO: nunca usa DATABASE_URL/JWT_SECRET do .env de desenvolvimento.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = TEST_URL || 'mongodb://localhost:27017/focuser_test_placeholder';
process.env.JWT_SECRET = 'segredo-de-teste-apenas-para-testes-0123456789abcdef';
process.env.BCRYPT_COST = '4';
process.env.CORS_ORIGINS = 'http://localhost:8080';
process.env.RATE_LIMIT_GLOBAL_MAX = '100000';
process.env.RATE_LIMIT_LOGIN_MAX = '100000';
process.env.RATE_LIMIT_REGISTER_MAX = '100000';
process.env.RATE_LIMIT_AI_PER_HOUR = '100000';
process.env.GROQ_API_KEY = 'groq-test-key';

const emailService = require('../../src/services/emailService');
const sentCodes = new Map();
emailService.assertConfigured = () => {};
emailService.sendCode = async ({ to, code, purpose }) => sentCodes.set(`${to}:${purpose}`, code);

const H = { 'X-Focuser-Client': 'web' }; // cabeçalho exigido pela defesa CSRF
const TZ = 'America/Sao_Paulo';
let counter = 0;

const lazy = (p) => () => require(p);
const prisma = () => require('../../src/config/prisma');
const config = () => require('../../src/config/env');
const dates = () => require('../../src/utils/dates');
const loadApp = (opts = {}) => require('../../src/app').createApp({ rateLimits: { authCodeMax: 100000 }, ...opts });

const uniqueEmail = (label) => `${label}_${Date.now()}_${counter++}@focuser.test`.toLowerCase();
const uniqueUsername = (label) => `u${String(label).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 14)}${Date.now().toString().slice(-8)}${counter++}`.slice(0, 30);
const todayKey = (tz = TZ) => dates().dateKeyFromInstant(new Date(), tz);

async function registrationImage(app, type = 'avatar') {
  Object.assign(config().cloudinary, {
    cloudName: 'focuser-test',
    apiKey: 'test-api-key',
    apiSecret: 'test-api-secret',
    folder: 'focuser/avatars',
  });
  const response = await request(app).post(`/api/auth/registration-${type}-signature`).set(H).send({});
  if (response.status !== 200) throw new Error(`assinatura de cadastro falhou: ${response.status} ${JSON.stringify(response.body)}`);
  const signature = response.body.data;
  return {
    uploadId: signature.uploadId,
    url: `https://res.cloudinary.com/${signature.cloudName}/image/upload/v123/${signature.folder}/profile.webp`,
  };
}

async function registrationFields(app, username) {
  const avatar = await registrationImage(app);
  return { username, avatarUploadId: avatar.uploadId, avatarUrl: avatar.url };
}

async function signup(app, label, timezone = TZ) {
  const email = uniqueEmail(label);
  const username = uniqueUsername(label);
  const password = 'SenhaForte123';
  const imageFields = await registrationFields(app, username);
  const reg = await request(app).post('/api/auth/register').set(H).send({ name: `Usuario ${label}`, email, password, timezone, ...imageFields });
  if (reg.status !== 201) throw new Error(`register falhou: ${reg.status} ${JSON.stringify(reg.body)}`);
  const emailCode = sentCodes.get(`${email}:email-verification`);
  const verified = await request(app).post('/api/auth/verify-email').set(H).send({ email, code: emailCode });
  if (verified.status !== 200) throw new Error(`verificação de e-mail falhou: ${verified.status}`);
  const agent = request.agent(app);
  const login = await agent.post('/api/auth/login').set(H).send({ email, password });
  if (login.status !== 200 || !login.body.data.twoFactorRequired) throw new Error(`desafio 2FA falhou: ${login.status}`);
  const loginCode = sentCodes.get(`${email}:login`);
  const verifiedLogin = await agent.post('/api/auth/verify-login').set(H).send({ email, code: loginCode });
  if (verifiedLogin.status !== 200) throw new Error(`login 2FA falhou: ${verifiedLogin.status}`);
  const cookie = verifiedLogin.headers['set-cookie'][0].split(';')[0];
  return { agent, user: reg.body.data.user, email, password, cookie };
}

function latestCode(email, purpose) {
  return sentCodes.get(`${email}:${purpose}`);
}

async function mkHabit(u, body = { name: 'Beber água' }) {
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    if (String(url) === 'https://api.groq.com/openai/v1/chat/completions') {
      return new Response(JSON.stringify({
        choices: [{ message: { content: '{"category":"Pessoal"}' } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return originalFetch(url, options);
  };
  try {
    const res = await u.agent.post('/api/habits').set(H).send(body);
    if (res.status !== 201) throw new Error(`criar hábito falhou: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.data.habit;
  } finally {
    global.fetch = originalFetch;
  }
}

async function cleanup() {
  await prisma().pendingProfileUpload.deleteMany({});
  const p = prisma();
  const ids = (await p.user.findMany({ where: { email: { endsWith: '@focuser.test' } }, select: { id: true } })).map((u) => u.id);
  if (ids.length === 0) return;
  await p.friendship.deleteMany({ where: { OR: [{ requesterId: { in: ids } }, { addresseeId: { in: ids } }] } });
  await p.checkIn.deleteMany({ where: { userId: { in: ids } } });
  await p.habit.deleteMany({ where: { userId: { in: ids } } });
  await p.focusSession.deleteMany({ where: { userId: { in: ids } } });
  await p.goal.deleteMany({ where: { userId: { in: ids } } });
  await p.readingLog.deleteMany({ where: { userId: { in: ids } } });
  await p.readingBook.deleteMany({ where: { userId: { in: ids } } });
  await p.user.deleteMany({ where: { id: { in: ids } } });
}

async function closeDb() {
  await cleanup();
  await prisma().$disconnect();
}

module.exports = {
  HAS_DB, skip: HAS_DB ? false : 'TEST_DATABASE_URL não definido (requer MongoDB em replica set)',
  H, TZ, request, loadApp, prisma, config, dates, lazy, uniqueEmail, uniqueUsername, registrationImage, registrationFields, todayKey, signup, mkHabit, cleanup, closeDb,
  latestCode,
};
