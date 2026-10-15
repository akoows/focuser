'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

describe('Hábitos: CRUD, validação e isolamento entre usuários', { skip: h.skip }, () => {
  let app, A, B, habitA, checkInA;
  before(async () => {
    app = h.loadApp();
    A = await h.signup(app, 'userA');
    B = await h.signup(app, 'userB');
    habitA = await h.mkHabit(A, { name: 'Ler 10 páginas', frequency: 'CUSTOM', daysOfWeek: [3, 1, 5] });
    const today = h.todayKey();
    const dow = h.dates().dayOfWeek(today);
    // garante um check-in de A: cria hábito diário separado
    const daily = await h.mkHabit(A, { name: 'Meditar' });
    habitA.daily = daily;
    const ci = await A.agent.post(`/api/habits/${daily.id}/check-ins`).set(h.H).send({});
    assert.equal(ci.status, 201, `check-in de A falhou (dow=${dow})`);
    checkInA = ci.body.data.checkIn;
  });
  after(h.closeDb);

  it('CRUD completo + arquivar/reativar, sem expor userId', async () => {
    const created = await h.mkHabit(A, { name: '  Correr  ', description: 'Parque', frequency: 'DAILY' });
    assert.equal(created.name, 'Correr'); // trim
    assert.equal(created.category, 'Pessoal');
    assert.deepEqual(created.daysOfWeek, [0, 1, 2, 3, 4, 5, 6]);
    assert.equal(created.isActive, true);
    assert.equal('userId' in created, false);

    assert.equal((await A.agent.get(`/api/habits/${created.id}`)).body.data.habit.id, created.id);

    const patched = await A.agent.patch(`/api/habits/${created.id}`).set(h.H).send({ name: 'Corrida', frequency: 'CUSTOM', daysOfWeek: [6, 0] });
    assert.equal(patched.status, 200);
    assert.deepEqual(patched.body.data.habit.daysOfWeek, [0, 6]);

    const arch = await A.agent.patch(`/api/habits/${created.id}/archive`).set(h.H).send({});
    assert.equal(arch.body.data.habit.isActive, false);
    const active = await A.agent.get('/api/habits');
    assert.ok(!active.body.data.items.some((x) => x.id === created.id));
    const archived = await A.agent.get('/api/habits?status=archived');
    assert.ok(archived.body.data.items.some((x) => x.id === created.id));
    const react = await A.agent.patch(`/api/habits/${created.id}/archive`).set(h.H).send({ archived: false });
    assert.equal(react.body.data.habit.isActive, true);

    assert.equal((await A.agent.delete(`/api/habits/${created.id}`).set(h.H)).status, 200);
    assert.equal((await A.agent.get(`/api/habits/${created.id}`)).status, 404);
  });

  it('paginação limita e valida page/limit', async () => {
    const res = await A.agent.get('/api/habits?limit=1&page=1');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.items.length, 1);
    assert.ok(res.body.data.pagination.total >= 2);
    assert.equal((await A.agent.get('/api/habits?limit=1000')).status, 400);
    assert.equal((await A.agent.get('/api/habits?page=0')).status, 400);
  });

  it('validação: nome, frequência, dias, descrição, campos internos', async () => {
    for (const bad of [
      {}, { name: '' }, { name: 'N'.repeat(101) }, { name: 123 }, { name: 'x', frequency: 'WEEKLY' },
      { name: 'x', frequency: 'CUSTOM' }, { name: 'x', frequency: 'CUSTOM', daysOfWeek: [] },
      { name: 'x', frequency: 'CUSTOM', daysOfWeek: [7] }, { name: 'x', frequency: 'CUSTOM', daysOfWeek: [1, 1] },
      { name: 'x', frequency: 'CUSTOM', daysOfWeek: ['1'] }, { name: 'x', frequency: 'DAILY', daysOfWeek: [1] },
      { name: 'x', description: 'D'.repeat(501) },
      { name: 'x', userId: B.user.id }, { name: 'x', isActive: false }, { name: 'x', startDateKey: '2000-01-01' }, { name: 'x', id: 'abc' },
    ]) {
      const res = await A.agent.post('/api/habits').set(h.H).send(bad);
      assert.equal(res.status, 400, JSON.stringify(bad));
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    }
  });

  it('IDs malformados => 400; inexistentes (válidos) => 404; JSON inválido => 400; corpo grande => 413', async () => {
    assert.equal((await A.agent.get('/api/habits/abc')).status, 400);
    assert.equal((await A.agent.get('/api/habits/%24ne')).status, 400);
    const missing = await A.agent.get('/api/habits/507f1f77bcf86cd799439011');
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error.code, 'HABIT_NOT_FOUND');
    const badJson = await A.agent.post('/api/habits').set(h.H).set('Content-Type', 'application/json').send('{"name":');
    assert.equal(badJson.status, 400);
    assert.equal(badJson.body.error.code, 'INVALID_JSON');
    const big = await A.agent.post('/api/habits').set(h.H).send({ name: 'x', description: 'D'.repeat(20000) });
    assert.equal(big.status, 413);
  });

  it('query string com operadores/params desconhecidos é rejeitada', async () => {
    assert.equal((await A.agent.get('/api/habits?status[$ne]=active')).status, 400);
    assert.equal((await A.agent.get(`/api/habits?userId=${B.user.id}`)).status, 400);
    assert.equal((await A.agent.get(`/api/progress?userId=${B.user.id}`)).status, 400);
  });

  it('ISOLAMENTO: B não lê, altera, arquiva, exclui nem registra check-in nos hábitos de A', async () => {
    const id = habitA.daily.id;
    const attempts = [
      B.agent.get(`/api/habits/${id}`),
      B.agent.patch(`/api/habits/${id}`).set(h.H).send({ name: 'invadido' }),
      B.agent.patch(`/api/habits/${id}/archive`).set(h.H).send({}),
      B.agent.delete(`/api/habits/${id}`).set(h.H),
      B.agent.post(`/api/habits/${id}/check-ins`).set(h.H).send({}),
      B.agent.get(`/api/habits/${id}/check-ins`),
      B.agent.delete(`/api/habits/${id}/check-ins/${checkInA.id}`).set(h.H),
      B.agent.get(`/api/habits/${id}/progress`),
    ];
    for (const res of await Promise.all(attempts)) {
      assert.equal(res.status, 404);
      assert.equal(res.body.error.code === 'HABIT_NOT_FOUND', true);
    }
    // B não vê hábitos de A em listas, dashboard, progresso nem check-ins de hoje
    const list = await B.agent.get('/api/habits?status=all');
    assert.equal(list.body.data.items.length, 0);
    assert.equal((await B.agent.get('/api/dashboard')).body.data.totalActiveHabits, 0);
    assert.equal((await B.agent.get('/api/progress')).body.data.totals.activeHabits, 0);
    assert.equal((await B.agent.get('/api/check-ins/today')).body.data.items.length, 0);
    // dados de A permanecem intactos
    const still = await A.agent.get(`/api/habits/${id}`);
    assert.equal(still.body.data.habit.name, 'Meditar');
    const cis = await A.agent.get(`/api/habits/${id}/check-ins`);
    assert.ok(cis.body.data.items.some((c) => c.id === checkInA.id));
  });

  it('ISOLAMENTO: atribuição de userId/IDs no corpo não permite agir em nome de A', async () => {
    const res = await B.agent.post('/api/habits').set(h.H).send({ name: 'x', userId: A.user.id });
    assert.equal(res.status, 400);
    const own = await h.mkHabit(B, { name: 'Do B' });
    const bad = await B.agent.post(`/api/habits/${own.id}/check-ins`).set(h.H).send({ habitId: habitA.daily.id, userId: A.user.id });
    assert.equal(bad.status, 400);
    // check-in de A usado com habitId de B (IDs trocados na URL) => 404
    const cross = await B.agent.delete(`/api/habits/${own.id}/check-ins/${checkInA.id}`).set(h.H);
    assert.equal(cross.status, 404);
    const still = await A.agent.get(`/api/habits/${habitA.daily.id}/check-ins`);
    assert.ok(still.body.data.items.some((c) => c.id === checkInA.id));
  });

  it('perfil: cada usuário só enxerga/altera o próprio (identidade vem do token)', async () => {
    assert.equal((await A.agent.get('/api/users/me')).body.data.user.id, A.user.id);
    assert.equal((await B.agent.get('/api/users/me')).body.data.user.id, B.user.id);
    await B.agent.patch('/api/users/me').set(h.H).send({ name: 'B alterado' });
    assert.notEqual((await A.agent.get('/api/users/me')).body.data.user.name, 'B alterado');
  });

  it('exclusão remove também os check-ins do hábito (sem órfãos)', async () => {
    const hab = await h.mkHabit(A, { name: 'Temporário' });
    await A.agent.post(`/api/habits/${hab.id}/check-ins`).set(h.H).send({});
    assert.equal((await A.agent.delete(`/api/habits/${hab.id}`).set(h.H)).status, 200);
    const orphans = await h.prisma().checkIn.count({ where: { habitId: hab.id } });
    assert.equal(orphans, 0);
  });
});
