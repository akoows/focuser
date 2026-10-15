'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const h = require('./helpers');

describe('Autenticação', { skip: h.skip }, () => {
  let app;
  before(() => { app = h.loadApp(); });
  after(h.closeDb);
  const post = (url, body) => h.request(app).post(url).set(h.H).send(body);

  it('cadastro: 201, e-mail normalizado, sem dados sensíveis', async () => {
    const email = h.uniqueEmail('Reg');
    const username = h.uniqueUsername('Ana');
    const image = await h.registrationFields(app, username);
    const banner = await h.registrationImage(app, 'banner');
    const res = await post('/api/auth/register', {
      name: 'Ana', email: email.toUpperCase(), password: 'SenhaForte123',
      ...image, bannerUploadId: banner.uploadId, bannerUrl: banner.url,
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.user.email, email);
    assert.equal(res.body.data.user.username, username);
    assert.ok(res.body.data.user.avatarUrl);
    assert.ok(res.body.data.user.bannerUrl);
    assert.equal(res.body.data.emailVerificationRequired, true);
    const text = JSON.stringify(res.body).toLowerCase();
    for (const k of ['password', 'passwordhash', 'tokenversion']) assert.ok(!text.includes(k), `vazou ${k}`);
    assert.equal(res.headers['set-cookie'], undefined); // cadastro não inicia sessão
    const replay = await post('/api/auth/register', {
      name: 'Ana 2', username: h.uniqueUsername('replay'), email: h.uniqueEmail('replay'), password: 'SenhaForte123', ...image,
    });
    assert.equal(replay.status, 400);
    assert.equal(replay.body.error.code, 'PROFILE_IMAGE_UPLOAD_INVALID');
  });

  it('domínio focuser.dev: cadastro e login não exigem confirmação ou código por e-mail em desenvolvimento/teste', async () => {
    const email = `teste_${Date.now()}@focuser.dev`;
    const password = 'SenhaForte123';
    const image = await h.registrationFields(app, h.uniqueUsername('dev'));
    const reg = await post('/api/auth/register', { name: 'Teste Local', email, password, ...image });
    assert.equal(reg.status, 201);
    assert.equal(reg.body.data.emailVerificationRequired, false);
    assert.equal(h.latestCode(email, 'email-verification'), undefined);

    const login = await post('/api/auth/login', { email, password });
    assert.equal(login.status, 200);
    assert.equal(login.body.data.user.email, email);
    assert.equal(login.body.data.twoFactorRequired, undefined);
    assert.match(login.headers['set-cookie'][0], /HttpOnly/i);
    assert.equal(h.latestCode(email, 'login'), undefined);
  });

  it('domínio focuser.dev: bypass fica desativado em produção', async () => {
    const previousEnv = h.config().env;
    h.config().env = 'production';
    try {
      const email = `prod_${Date.now()}@focuser.dev`;
      const image = await h.registrationFields(app, h.uniqueUsername('prod'));
      const reg = await post('/api/auth/register', { name: 'Teste Produção', email, password: 'SenhaForte123', ...image });
      assert.equal(reg.status, 201);
      assert.ok(h.latestCode(email, 'email-verification'));
    } finally {
      h.config().env = previousEnv;
    }
  });

  it('cadastro: e-mail duplicado (inclusive com caixa diferente) => 409', async () => {
    const email = h.uniqueEmail('dup');
    const usernameA = h.uniqueUsername('dupa');
    const firstImage = await h.registrationFields(app, usernameA);
    assert.equal((await post('/api/auth/register', { name: 'A', email, password: 'SenhaForte123', ...firstImage })).status, 201);
    const secondImage = await h.registrationFields(app, h.uniqueUsername('dupb'));
    const res = await post('/api/auth/register', { name: 'B', email: email.toUpperCase(), password: 'SenhaForte123', ...secondImage });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'EMAIL_IN_USE');
  });

  it('cadastro: validações (senha curta, >72 bytes, e-mail inválido, campos extras, fuso inválido)', async () => {
    const base = {
      name: 'X', username: h.uniqueUsername('validation'), email: h.uniqueEmail('val'), password: 'SenhaForte123',
      avatarUploadId: '507f1f77bcf86cd799439011',
      avatarUrl: 'https://res.cloudinary.com/focuser-test/image/upload/v1/focuser/avatars/registration/507f1f77bcf86cd799439011/profile.webp',
    };
    for (const bad of [
      { ...base, password: 'curta' },
      { ...base, password: 'á'.repeat(40) }, // 80 bytes
      { ...base, email: 'nao-e-email' },
      { ...base, name: '' },
      { ...base, name: 'N'.repeat(81) },
      { ...base, role: 'admin' },
      { ...base, tokenVersion: 99 },
      { ...base, timezone: 'Marte/Base' },
      { ...base, email: { $ne: null } },
      { ...base, code: 'not-a-code' },
    ]) {
      const res = await post('/api/auth/register', bad);
      assert.equal(res.status, 400, JSON.stringify(bad));
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    }
    const missingProfile = await post('/api/auth/register', { name: 'X', email: h.uniqueEmail('missing'), password: 'SenhaForte123' });
    assert.equal(missingProfile.status, 400);
    assert.equal(missingProfile.body.error.code, 'VALIDATION_ERROR');
  });

  it('cadastro: nome de usuário já usado => 409 USERNAME_IN_USE', async () => {
    const username = h.uniqueUsername('unique');
    const first = await h.registrationFields(app, username);
    assert.equal((await post('/api/auth/register', {
      name: 'Primeira', email: h.uniqueEmail('usera'), password: 'SenhaForte123', ...first,
    })).status, 201);
    const second = await h.registrationFields(app, username);
    const response = await post('/api/auth/register', {
      name: 'Segunda', email: h.uniqueEmail('userb'), password: 'SenhaForte123', ...second,
    });
    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, 'USERNAME_IN_USE');
  });

  it('login: exige código de e-mail antes de emitir cookie httpOnly', async () => {
    const u = await h.signup(app, 'login');
    const challenge = await post('/api/auth/login', { email: u.email, password: u.password });
    assert.equal(challenge.status, 200);
    assert.equal(challenge.body.data.twoFactorRequired, true);
    assert.equal(challenge.headers['set-cookie'], undefined);
    const res = await post('/api/auth/verify-login', { email: u.email, code: h.latestCode(u.email, 'login') });
    assert.equal(res.status, 200);
    const cookie = res.headers['set-cookie'][0];
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    assert.ok(!JSON.stringify(res.body).includes('eyJ'), 'token no corpo');
    assert.equal(res.body.data.user.email, u.email);
  });

  it('cadastro: exige verificação de e-mail; códigos são de uso único e o login exige segundo fator', async () => {
    const email = h.uniqueEmail('2fa');
    const password = 'SenhaForte123';
    const image = await h.registrationFields(app, h.uniqueUsername('twofa'));
    const reg = await post('/api/auth/register', { name: 'Teste 2FA', email, password, ...image });
    assert.equal(reg.status, 201);
    assert.equal(reg.headers['set-cookie'], undefined);
    const unverifiedLogin = await post('/api/auth/login', { email, password });
    assert.equal(unverifiedLogin.body.data.emailVerificationRequired, true);

    const emailCode = h.latestCode(email, 'email-verification');
    assert.equal((await post('/api/auth/verify-email', { email, code: '000000' })).status, 400);
    assert.equal((await post('/api/auth/verify-email', { email, code: emailCode })).status, 200);
    assert.equal((await post('/api/auth/verify-email', { email, code: emailCode })).status, 400);

    const challenge = await post('/api/auth/login', { email, password });
    assert.equal(challenge.body.data.twoFactorRequired, true);
    assert.equal(challenge.headers['set-cookie'], undefined);
    const code = h.latestCode(email, 'login');
    assert.equal((await post('/api/auth/verify-login', { email, code: '000000' })).status, 400);
    const verified = await post('/api/auth/verify-login', { email, code });
    assert.equal(verified.status, 200);
    assert.match(verified.headers['set-cookie'][0], /HttpOnly/i);
    assert.equal((await post('/api/auth/verify-login', { email, code })).status, 400);
  });

  it('login: credenciais inválidas retornam a MESMA resposta (sem enumerar contas)', async () => {
    const u = await h.signup(app, 'enum');
    const wrongPass = await post('/api/auth/login', { email: u.email, password: 'errada-errada' });
    const noUser = await post('/api/auth/login', { email: h.uniqueEmail('naoexiste'), password: 'errada-errada' });
    assert.equal(wrongPass.status, 401);
    assert.equal(noUser.status, 401);
    assert.deepEqual(wrongPass.body, noUser.body);
    assert.equal(wrongPass.body.error.code, 'INVALID_CREDENTIALS');
  });

  it('login: injeção NoSQL via operadores é rejeitada', async () => {
    const res = await post('/api/auth/login', { email: { $ne: null }, password: { $ne: null } });
    assert.equal(res.status, 400);
  });

  it('rotas privadas: sem cookie, cookie malformado, expirado, alg=none, usuário inexistente => 401', async () => {
    const u = await h.signup(app, 'tok');
    const secret = process.env.JWT_SECRET;
    const get = (cookie) => { const r = h.request(app).get('/api/auth/me'); return cookie ? r.set('Cookie', `focuser_token=${cookie}`) : r; };
    assert.equal((await get()).status, 401);
    assert.equal((await get('lixo')).status, 401);
    assert.equal((await get(jwt.sign({ tv: 0 }, secret, { subject: u.user.id, expiresIn: -10 }))).status, 401);
    assert.equal((await get(jwt.sign({ tv: 0 }, '', { algorithm: 'none', subject: u.user.id }))).status, 401);
    assert.equal((await get(jwt.sign({ tv: 0 }, 'outro-segredo-qualquer-0123456789abcdef', { subject: u.user.id }))).status, 401);
    assert.equal((await get(jwt.sign({ tv: 0 }, secret, { subject: '507f1f77bcf86cd799439011' }))).status, 401);
    for (const url of ['/api/habits', '/api/dashboard', '/api/progress', '/api/progress/history', '/api/check-ins/today', '/api/users/me']) {
      assert.equal((await h.request(app).get(url)).status, 401, url);
    }
    assert.equal((await h.request(app).post('/api/ai/analyze').set(h.H).send({})).status, 401);
  });

  it('/auth/me e /users/me retornam dados públicos do usuário autenticado', async () => {
    const u = await h.signup(app, 'me');
    for (const url of ['/api/auth/me', '/api/users/me']) {
      const res = await u.agent.get(url);
      assert.equal(res.status, 200);
      assert.equal(res.body.data.user.id, u.user.id);
      assert.equal(res.body.data.user.accentColor, '#ffffff');
      assert.ok(!JSON.stringify(res.body).toLowerCase().includes('passwordhash'));
    }
  });

  it('logout revoga o token (reuso do cookie antigo => 401)', async () => {
    const u = await h.signup(app, 'logout');
    assert.equal((await h.request(app).get('/api/auth/me').set('Cookie', u.cookie)).status, 200);
    const out = await h.request(app).post('/api/auth/logout').set(h.H).set('Cookie', u.cookie);
    assert.equal(out.status, 200);
    assert.equal((await h.request(app).get('/api/auth/me').set('Cookie', u.cookie)).status, 401);
  });

  it('perfil: atualiza nome, fuso e cor; rejeita campos desconhecidos e cores inválidas', async () => {
    const u = await h.signup(app, 'perfil');
    const ok = await u.agent.patch('/api/users/me').set(h.H).send({ name: 'Novo Nome', timezone: 'UTC', accentColor: '#c4b5fd' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.data.user.name, 'Novo Nome');
    assert.equal(ok.body.data.user.timezone, 'UTC');
    assert.equal(ok.body.data.user.accentColor, '#c4b5fd');
    const persisted = await u.agent.get('/api/auth/me');
    assert.equal(persisted.body.data.user.accentColor, '#c4b5fd');
    for (const bad of [
      { email: 'x@y.com' },
      { id: '507f1f77bcf86cd799439011' },
      { passwordHash: 'x' },
      {},
      { timezone: 'Marte/Base' },
      { name: '' },
      { accentColor: 'red' },
      { accentColor: '#fff' },
      { accentColor: '#12345678' },
    ]) {
      assert.equal((await u.agent.patch('/api/users/me').set(h.H).send(bad)).status, 400, JSON.stringify(bad));
    }
  });

  it('força bruta: login bloqueado (429) após exceder tentativas falhas', async () => {
    const strict = h.loadApp({ rateLimits: { loginMax: 3 } });
    const body = { email: h.uniqueEmail('bf'), password: 'errada-errada' };
    for (let i = 0; i < 3; i++) assert.equal((await h.request(strict).post('/api/auth/login').set(h.H).send(body)).status, 401);
    const blocked = await h.request(strict).post('/api/auth/login').set(h.H).send(body);
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error.code, 'RATE_LIMITED');
  });
});
