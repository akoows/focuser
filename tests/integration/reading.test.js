'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

describe('Leituras: livros, sessões diárias e isolamento', { skip: h.skip }, () => {
  let app, A, B;
  before(async () => {
    app = h.loadApp();
    A = await h.signup(app, 'readingA');
    B = await h.signup(app, 'readingB');
  });
  after(h.closeDb);

  it('registra livros e normaliza ISBN para uso da Open Library Covers API', async () => {
    const created = await A.agent.post('/api/reading/books').set(h.H).send({
      title: 'The C Programming Language', author: 'Brian W. Kernighan and Dennis M. Ritchie',
      isbn: '978-0-13-110362-7', coverId: 101, coverUrl: 'https://books.google.com/books/content?id=test&printsec=frontcover&img=1&zoom=1', totalPages: 274, currentPage: 12,
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.book.isbn, '9780131103627');
    assert.equal(created.body.data.book.coverId, 101);
    assert.match(created.body.data.book.coverUrl, /^https:\/\/books\.google\.com\//);
    assert.equal(created.body.data.book.currentPage, 12);
    assert.equal('userId' in created.body.data.book, false);
    assert.equal((await A.agent.get('/api/reading/books')).body.data.items.length, 1);
  });

  it('registra páginas e minutos por leitura e retorna totais do dia no fuso do usuário', async () => {
    const book = (await A.agent.post('/api/reading/books').set(h.H).send({
      title: 'Livro sem ISBN', totalPages: 100, currentPage: 10,
    })).body.data.book;
    const logged = await A.agent.post(`/api/reading/books/${book.id}/logs`).set(h.H).send({ pagesRead: 8, minutesRead: 24 });
    assert.equal(logged.status, 201);
    assert.equal(logged.body.data.log.dateKey, h.todayKey());
    assert.equal(logged.body.data.book.currentPage, 18);
    const today = (await A.agent.get('/api/reading/today')).body.data;
    assert.equal(today.totalPages, 8);
    assert.equal(today.totalMinutes, 24);
    assert.equal(today.items[0].book.title, 'Livro sem ISBN');
  });

  it('mostra no feed somente leituras próprias e de amizades aceitas', async () => {
    const bob = await h.signup(app, 'readingFeedBob');
    const carol = await h.signup(app, 'readingFeedCarol');
    const bobRequest = await A.agent.post('/api/friends/requests').set(h.H).send({ username: bob.user.username });
    await bob.agent.post(`/api/friends/requests/${bobRequest.body.data.relationship.requestId}/accept`).set(h.H).send({});
    await A.agent.post('/api/friends/requests').set(h.H).send({ username: carol.user.username });

    const createLog = async (reader, title) => {
      const book = (await reader.agent.post('/api/reading/books').set(h.H).send({
        title, totalPages: 100,
      })).body.data.book;
      return reader.agent.post(`/api/reading/books/${book.id}/logs`).set(h.H).send({
        pagesRead: 5, minutesRead: 15,
      });
    };
    await createLog(A, 'Leitura da Alice');
    await createLog(bob, 'Leitura do Bob');
    await createLog(carol, 'Leitura da Carol');

    const feed = await A.agent.get('/api/reading/feed').set(h.H);
    assert.equal(feed.status, 200);
    assert.deepEqual(new Set(feed.body.data.items.map((item) => item.user.username)), new Set([
      A.user.username, bob.user.username,
    ]));
    assert.equal(feed.body.data.items.length, 2);
    assert.equal(feed.body.data.items.every((item) => item.minutesRead === 15), true);
  });

  it('impede exceder páginas totais e rejeita entradas inválidas', async () => {
    const book = (await A.agent.post('/api/reading/books').set(h.H).send({ title: 'Quase no fim', totalPages: 10, currentPage: 9 })).body.data.book;
    const tooMany = await A.agent.post(`/api/reading/books/${book.id}/logs`).set(h.H).send({ pagesRead: 2, minutesRead: 10 });
    assert.equal(tooMany.status, 422);
    assert.equal(tooMany.body.error.code, 'PAGES_EXCEED_BOOK');
    assert.equal((await A.agent.post(`/api/reading/books/${book.id}/logs`).set(h.H).send({ pagesRead: 1, minutesRead: 0 })).status, 400);
    for (const body of [
      { title: '', totalPages: 10 },
      { title: 'Páginas impossíveis', totalPages: 10, currentPage: 11 },
      { title: 'ISBN inválido', totalPages: 10, isbn: '12345' },
      { title: 'Capa externa inválida', totalPages: 10, coverUrl: 'https://attacker.example/cover.jpg' },
      { title: 'Extra', totalPages: 10, userId: A.user.id },
    ]) {
      assert.equal((await A.agent.post('/api/reading/books').set(h.H).send(body)).status, 400);
    }
    assert.equal((await A.agent.patch(`/api/reading/books/${book.id}`).set(h.H).send({ totalPages: 5 })).body.error.code, 'INVALID_BOOK_PAGE');
  });

  it('isola os livros entre usuários, permite arquivar/reativar e excluir', async () => {
    const book = (await A.agent.post('/api/reading/books').set(h.H).send({ title: 'Privado', totalPages: 50 })).body.data.book;
    assert.equal((await B.agent.get(`/api/reading/books/${book.id}`)).status, 404);
    assert.equal((await B.agent.post(`/api/reading/books/${book.id}/logs`).set(h.H).send({ pagesRead: 1, minutesRead: 10 })).status, 404);
    assert.equal((await A.agent.patch(`/api/reading/books/${book.id}`).set(h.H).send({ isActive: false })).body.data.book.isActive, false);
    assert.equal((await A.agent.post(`/api/reading/books/${book.id}/logs`).set(h.H).send({ pagesRead: 1, minutesRead: 10 })).body.error.code, 'READING_BOOK_ARCHIVED');
    assert.equal((await A.agent.get('/api/reading/books?status=archived')).body.data.items.length, 1);
    assert.equal((await A.agent.patch(`/api/reading/books/${book.id}`).set(h.H).send({ isActive: true })).body.data.book.isActive, true);
    assert.equal((await A.agent.delete(`/api/reading/books/${book.id}`).set(h.H)).body.data.deleted, true);
  });

  it('exige autenticação em todos os recursos de leitura', async () => {
    assert.equal((await h.request(app).get('/api/reading/today')).status, 401);
    assert.equal((await h.request(app).get('/api/reading/feed')).status, 401);
    assert.equal((await h.request(app).get('/api/reading/books')).status, 401);
    assert.equal((await h.request(app).post('/api/reading/isbn-lookup').send({ title: 'O Hobbit' })).status, 401);
  });

  it('valida a busca de edições e capas por título', async () => {
    assert.equal((await A.agent.post('/api/reading/isbn-lookup').set(h.H).send({ title: '' })).status, 400);
    assert.equal((await A.agent.post('/api/reading/isbn-lookup').set(h.H).send({ title: 'O Hobbit', extra: true })).status, 400);
  });
});
