'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

describe('Perfil', { skip: h.skip }, () => {
  let app;
  let user;

  before(async () => {
    app = h.loadApp();
    user = await h.signup(app, 'profile');
  });
  after(h.closeDb);

  it('expõe apenas os dados escolhidos no perfil público por username', async () => {
    const profile = await h.signup(app, 'public-profile');
    const created = await profile.agent.post('/api/reading/books').set(h.H).send({
      title: 'Livro público',
      author: 'Autor',
      totalPages: 200,
    });
    assert.equal(created.status, 201);
    const bookId = created.body.data.book.id;
    await profile.agent.patch('/api/users/me').set(h.H).send({
      bio: 'Gosto de ler e criar hábitos.',
      currentBookId: bookId,
      favoriteBookId: bookId,
      accentColor: '#c4b5fd',
    });

    const response = await h.request(app).get(`/api/users/by-username/${profile.user.username}`);
    assert.equal(response.status, 200);
    assert.equal(response.body.data.profile.username, profile.user.username);
    assert.equal(response.body.data.profile.name, profile.user.name);
    assert.equal(response.body.data.profile.bio, 'Gosto de ler e criar hábitos.');
    assert.equal(response.body.data.profile.accentColor, '#c4b5fd');
    assert.equal(response.body.data.profile.currentBook.title, 'Livro público');
    assert.equal(response.body.data.profile.favoriteBook.title, 'Livro público');
    assert.equal(Object.hasOwn(response.body.data.profile, 'email'), false);

    const missing = await h.request(app).get('/api/users/by-username/nao.existe');
    assert.equal(missing.status, 404);
  });

  it('expõe o histórico recente de livros e duração no perfil público', async () => {
    const profile = await h.signup(app, 'public-reading-history');
    const created = await profile.agent.post('/api/reading/books').set(h.H).send({
      title: 'Livro do histórico',
      author: 'Autora',
      totalPages: 200,
    });
    assert.equal(created.status, 201);
    const bookId = created.body.data.book.id;
    const logged = await profile.agent.post(`/api/reading/books/${bookId}/logs`).set(h.H).send({
      pagesRead: 12,
      minutesRead: 35,
    });
    assert.equal(logged.status, 201);

    const response = await h.request(app).get(`/api/users/by-username/${profile.user.username}`);
    assert.equal(response.status, 200);
    assert.equal(response.body.data.profile.readingHistory.length, 1);
    assert.equal(response.body.data.profile.readingHistory[0].book.title, 'Livro do histórico');
    assert.equal(response.body.data.profile.readingHistory[0].minutesRead, 35);
    assert.equal(response.body.data.profile.readingHistory[0].pagesRead, 12);
    assert.equal(typeof response.body.data.profile.readingHistory[0].loggedAt, 'string');
  });

  it('expõe o status de foco enquanto a sessão está em andamento', async () => {
    const profile = await h.signup(app, 'public-focus-status');
    const book = await profile.agent.post('/api/reading/books').set(h.H).send({
      title: 'Livro em foco',
      author: 'Autora',
      totalPages: 180,
    });
    assert.equal(book.status, 201);
    await profile.agent.patch('/api/users/me').set(h.H).send({ currentBookId: book.body.data.book.id });

    const getPublicProfile = () => h.request(app).get(`/api/users/by-username/${profile.user.username}`);
    assert.equal((await getPublicProfile()).body.data.profile.status, null);

    const started = await profile.agent.post('/api/focus-sessions').set(h.H).send({ title: 'Estudar', plannedMinutes: 25 });
    assert.equal(started.status, 201);
    let response = await getPublicProfile();
    assert.equal(response.body.data.profile.status, 'FOCUS');
    assert.equal(response.body.data.profile.currentBook.title, 'Livro em foco');

    await profile.agent.post(`/api/focus-sessions/${started.body.data.session.id}/pause`).set(h.H);
    assert.equal((await getPublicProfile()).body.data.profile.status, null);

    await profile.agent.post(`/api/focus-sessions/${started.body.data.session.id}/resume`).set(h.H);
    response = await getPublicProfile();
    assert.equal(response.body.data.profile.status, 'FOCUS');

    await profile.agent.post(`/api/focus-sessions/${started.body.data.session.id}/complete`).set(h.H);
    assert.equal((await getPublicProfile()).body.data.profile.status, null);
  });

  it('publica e limpa o status da sessão de leitura em foco', async () => {
    const profile = await h.signup(app, 'public-reading-focus');
    const created = await profile.agent.post('/api/reading/books').set(h.H).send({
      title: 'Livro da sessão em foco',
      author: 'Autora',
      totalPages: 210,
    });
    assert.equal(created.status, 201);
    const bookId = created.body.data.book.id;
    const sessionId = '4eb8a320-78c7-47c2-b2a8-4af8a6254df8';
    const setStatus = await profile.agent.put('/api/users/me/reading-focus').set(h.H).send({ bookId, sessionId });
    assert.equal(setStatus.status, 200);
    assert.equal(setStatus.body.data.status, 'FOCUS');

    const publicProfile = () => h.request(app).get(`/api/users/by-username/${profile.user.username}`);
    let response = await publicProfile();
    assert.equal(response.body.data.profile.status, 'FOCUS');
    assert.equal(response.body.data.profile.currentBook.title, 'Livro da sessão em foco');

    const wrongSession = await profile.agent.delete('/api/users/me/reading-focus').set(h.H).send({
      sessionId: 'da251387-ea29-41e8-a037-c99b03d3bd11',
    });
    assert.equal(wrongSession.status, 200);
    assert.equal((await publicProfile()).body.data.profile.status, 'FOCUS');

    const cleared = await profile.agent.delete('/api/users/me/reading-focus').set(h.H).send({ sessionId });
    assert.equal(cleared.status, 200);
    response = await publicProfile();
    assert.equal(response.body.data.profile.status, null);
    assert.equal(response.body.data.profile.currentBook, null);
  });

  it('atualiza nome de usuário e rejeita nomes duplicados', async () => {
    const first = await user.agent.patch('/api/users/me').set(h.H).send({ username: 'meu.usuario' });
    assert.equal(first.status, 200);
    assert.equal(first.body.data.user.username, 'meu.usuario');

    const second = await h.signup(app, 'profile2');
    const conflict = await second.agent.patch('/api/users/me').set(h.H).send({ username: 'meu.usuario' });
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.error.code, 'USERNAME_IN_USE');
  });

  it('salva bio e livros do próprio usuário como leitura e favorito', async () => {
    const created = await user.agent.post('/api/reading/books').set(h.H).send({
      title: 'Livro de perfil',
      author: 'Autoria',
      totalPages: 240,
    });
    assert.equal(created.status, 201);
    const bookId = created.body.data.book.id;

    const response = await user.agent.patch('/api/users/me').set(h.H).send({
      bio: 'Leitora e entusiasta de hábitos.',
      currentBookId: bookId,
      favoriteBookId: bookId,
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.data.user.bio, 'Leitora e entusiasta de hábitos.');
    assert.equal(response.body.data.user.currentBookId, bookId);
    assert.equal(response.body.data.user.favoriteBookId, bookId);

    const otherUser = await h.signup(app, 'profile-book-owner');
    const foreignBook = await otherUser.agent.patch('/api/users/me').set(h.H).send({ favoriteBookId: bookId });
    assert.equal(foreignBook.status, 404);
    assert.equal(foreignBook.body.error.code, 'FAVORITE_BOOK_NOT_FOUND');

    const archived = await user.agent.patch(`/api/reading/books/${bookId}`).set(h.H).send({ isActive: false });
    assert.equal(archived.status, 200);
    const archivedProfile = await user.agent.get('/api/users/me');
    assert.equal(archivedProfile.body.data.user.currentBookId, null);
    assert.equal(archivedProfile.body.data.user.favoriteBookId, bookId);
    const reactivated = await user.agent.patch(`/api/reading/books/${bookId}`).set(h.H).send({ isActive: true });
    assert.equal(reactivated.status, 200);
    await user.agent.patch('/api/users/me').set(h.H).send({ currentBookId: bookId });

    const deleted = await user.agent.delete(`/api/reading/books/${bookId}`).set(h.H);
    assert.equal(deleted.status, 200);
    const clearedProfile = await user.agent.get('/api/users/me');
    assert.equal(clearedProfile.body.data.user.currentBookId, null);
    assert.equal(clearedProfile.body.data.user.favoriteBookId, null);
  });

  it('gera assinatura de upload limitada à pasta do usuário', async () => {
    const config = h.config();
    const original = { ...config.cloudinary };
    Object.assign(config.cloudinary, {
      cloudName: 'focuser-test',
      apiKey: 'test-api-key',
      apiSecret: 'test-api-secret',
      folder: 'focuser/avatars',
    });
    try {
      const response = await user.agent.post('/api/users/me/avatar-signature').set(h.H).send({});
      assert.equal(response.status, 200);
      assert.equal(response.body.data.cloudName, 'focuser-test');
      assert.equal(response.body.data.folder, `focuser/avatars/${user.user.id}`);
      assert.ok(response.body.data.signature);
      assert.ok(!JSON.stringify(response.body).includes('test-api-secret'));

      const banner = await user.agent.post('/api/users/me/banner-signature').set(h.H).send({});
      assert.equal(banner.status, 200);
      assert.equal(banner.body.data.folder, `focuser/avatars/${user.user.id}/banner`);
      assert.ok(banner.body.data.signature);

      const updatedBanner = await user.agent.patch('/api/users/me').set(h.H).send({
        bannerUrl: `https://res.cloudinary.com/focuser-test/image/upload/v123/focuser/avatars/${user.user.id}/banner/profile.jpg`,
      });
      assert.equal(updatedBanner.status, 200);
      assert.equal(updatedBanner.body.data.user.bannerUrl, `https://res.cloudinary.com/focuser-test/image/upload/v123/focuser/avatars/${user.user.id}/banner/profile.jpg`);
      const invalidBanner = await user.agent.patch('/api/users/me').set(h.H).send({
        bannerUrl: `https://res.cloudinary.com/focuser-test/image/upload/v123/focuser/avatars/${user.user.id}/profile.jpg`,
      });
      assert.equal(invalidBanner.status, 400);
      assert.equal(invalidBanner.body.error.code, 'INVALID_BANNER_URL');
    } finally {
      Object.assign(config.cloudinary, original);
    }
  });

  it('altera senha somente com código de e-mail e revoga sessões antigas', async () => {
    const originalCookie = user.cookie;
    const start = await user.agent.post('/api/users/me/password-change').set(h.H).send({
      currentPassword: user.password,
      newPassword: 'SenhaNovaForte456',
    });
    assert.equal(start.status, 200);
    const code = h.latestCode(user.email, 'password-change');
    assert.match(code, /^\d{6}$/);

    const invalid = await user.agent.post('/api/users/me/password-change/verify').set(h.H).send({
      code: code === '000000' ? '000001' : '000000',
      newPassword: 'SenhaNovaForte456',
    });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.error.code, 'INVALID_OR_EXPIRED_CODE');

    const verified = await user.agent.post('/api/users/me/password-change/verify').set(h.H).send({
      code,
      newPassword: 'SenhaNovaForte456',
    });
    assert.equal(verified.status, 200);
    assert.equal(verified.body.data.user.email, user.email);
    assert.equal((await user.agent.get('/api/auth/me')).status, 200);
    assert.equal((await h.request(app).get('/api/auth/me').set('Cookie', originalCookie)).status, 401);

    const oldPassword = await h.request(app).post('/api/auth/login').set(h.H).send({ email: user.email, password: user.password });
    assert.equal(oldPassword.status, 401);
  });
});
