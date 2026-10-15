'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

describe('Metas e sessões de foco: persistência, estados e isolamento', { skip: h.skip }, () => {
  let app, A, B;
  before(async () => {
    app = h.loadApp();
    A = await h.signup(app, 'goalfocusA');
    B = await h.signup(app, 'goalfocusB');
  });
  after(h.closeDb);

  it('cria, lista, edita, atualiza progresso, arquiva e exclui metas', async () => {
    const created = await A.agent.post('/api/goals').set(h.H).send({
      name: 'Ler livros', description: 'Leitura diária', category: 'Pessoal',
      targetValue: 12, unit: 'livros', period: 'YEARLY',
    });
    assert.equal(created.status, 400);
    const res = await A.agent.post('/api/goals').set(h.H).send({
      name: 'Ler livros', description: 'Leitura diária', category: 'Pessoal',
      targetValue: 12, unit: 'livros', period: 'MONTHLY',
    });
    assert.equal(res.status, 201);
    const goal = res.body.data.goal;
    assert.equal(goal.currentValue, 0);
    assert.equal('userId' in goal, false);

    const added = await A.agent.post(`/api/goals/${goal.id}/progress`).set(h.H).send({ amount: 2 });
    assert.equal(added.body.data.goal.currentValue, 2);
    const updated = await A.agent.patch(`/api/goals/${goal.id}`).set(h.H).send({ targetValue: 10, description: null });
    assert.equal(updated.body.data.goal.targetValue, 10);
    assert.equal(updated.body.data.goal.description, null);
    assert.equal((await A.agent.get('/api/goals')).body.data.items.length, 1);

    assert.equal((await A.agent.patch(`/api/goals/${goal.id}`).set(h.H).send({ isActive: false })).body.data.goal.isActive, false);
    assert.equal((await A.agent.post(`/api/goals/${goal.id}/progress`).set(h.H).send({ amount: 1 })).body.error.code, 'GOAL_ARCHIVED');
    assert.equal((await A.agent.get('/api/goals')).body.data.items.length, 0);
    assert.equal((await A.agent.get('/api/goals?status=all')).body.data.items.length, 1);
    assert.equal((await A.agent.delete(`/api/goals/${goal.id}`).set(h.H)).body.data.deleted, true);
    assert.equal((await A.agent.get(`/api/goals/${goal.id}`)).status, 404);
  });

  it('rejeita valores e campos inválidos em metas e progresso', async () => {
    for (const body of [
      { name: 'x', targetValue: 0, unit: 'vezes' },
      { name: 'x', targetValue: 1, unit: 'vezes', userId: A.user.id },
      { name: 'x', targetValue: 1, unit: 'vezes', currentValue: -1 },
      { name: 'x', targetValue: 1, unit: 'vezes', period: 'YEARLY' },
    ]) {
      const res = await A.agent.post('/api/goals').set(h.H).send(body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    }
    assert.equal((await A.agent.patch('/api/goals/507f1f77bcf86cd799439011').set(h.H).send({})).status, 400);
    assert.equal((await A.agent.post('/api/goals/507f1f77bcf86cd799439011/progress').set(h.H).send({ amount: -1 })).status, 400);
  });

  it('executa iniciar, pausar, retomar, concluir e cancelar sessões com tempo persistido', async () => {
    const goal = (await A.agent.post('/api/goals').set(h.H).send({ name: 'Estudar', targetValue: 5, unit: 'horas' })).body.data.goal;
    const started = await A.agent.post('/api/focus-sessions').set(h.H).send({ title: 'Estudar matemática', plannedMinutes: 1, goalId: goal.id });
    assert.equal(started.status, 201);
    const session = started.body.data.session;
    assert.equal(session.status, 'RUNNING');
    assert.equal(session.goalId, goal.id);
    assert.equal((await A.agent.get('/api/focus-sessions/active')).body.data.session.id, session.id);

    const paused = await A.agent.post(`/api/focus-sessions/${session.id}/pause`).set(h.H);
    assert.equal(paused.body.data.session.status, 'PAUSED');
    assert.ok(paused.body.data.session.elapsedSeconds >= 0);
    assert.equal((await A.agent.post(`/api/focus-sessions/${session.id}/pause`).set(h.H)).body.error.code, 'INVALID_FOCUS_SESSION_STATE');

    const resumed = await A.agent.post(`/api/focus-sessions/${session.id}/resume`).set(h.H);
    assert.equal(resumed.body.data.session.status, 'RUNNING');
    const completed = await A.agent.post(`/api/focus-sessions/${session.id}/complete`).set(h.H);
    assert.equal(completed.body.data.session.status, 'COMPLETED');
    assert.ok(completed.body.data.session.endedAt);
    assert.equal((await A.agent.get('/api/focus-sessions/active')).body.data.session, null);
    assert.equal((await A.agent.get('/api/focus-sessions?status=COMPLETED')).body.data.items.length, 1);
    await A.agent.delete(`/api/goals/${goal.id}`).set(h.H);
    assert.equal((await A.agent.get(`/api/focus-sessions/${session.id}`)).body.data.session.goalId, null);

    const cancelled = await A.agent.post('/api/focus-sessions').set(h.H).send({});
    assert.equal(cancelled.body.data.session.plannedMinutes, 25);
    const cancelResult = await A.agent.post(`/api/focus-sessions/${cancelled.body.data.session.id}/cancel`).set(h.H);
    assert.equal(cancelResult.body.data.session.status, 'CANCELLED');
  });

  it('impede sessões simultâneas e valida IDs, duração e metas de outros usuários', async () => {
    const foreignGoal = (await B.agent.post('/api/goals').set(h.H).send({ name: 'Meta privada', targetValue: 1, unit: 'x' })).body.data.goal;
    const foreign = await A.agent.post('/api/focus-sessions').set(h.H).send({ goalId: foreignGoal.id });
    assert.equal(foreign.status, 404);
    assert.equal(foreign.body.error.code, 'GOAL_NOT_FOUND');
    assert.equal((await A.agent.post('/api/focus-sessions').set(h.H).send({ plannedMinutes: 241 })).status, 400);

    const created = await A.agent.post('/api/focus-sessions').set(h.H).send({});
    const id = created.body.data.session.id;
    assert.equal((await A.agent.post('/api/focus-sessions').set(h.H).send({})).body.error.code, 'FOCUS_SESSION_ALREADY_ACTIVE');
    assert.equal((await B.agent.get(`/api/focus-sessions/${id}`)).status, 404);
    assert.equal((await B.agent.post(`/api/focus-sessions/${id}/cancel`).set(h.H)).status, 404);
    assert.equal((await A.agent.post('/api/focus-sessions/invalid/pause').set(h.H)).status, 400);
    assert.equal((await A.agent.post(`/api/focus-sessions/${id}/cancel`).set(h.H)).status, 200);
    assert.equal((await A.agent.post(`/api/focus-sessions/${id}/resume`).set(h.H)).body.error.code, 'INVALID_FOCUS_SESSION_STATE');
  });

  it('exige autenticação e rejeita parâmetros extras', async () => {
    assert.equal((await h.request(app).get('/api/goals')).status, 401);
    assert.equal((await A.agent.get('/api/focus-sessions?userId=' + B.user.id)).status, 400);
    assert.equal((await A.agent.post('/api/focus-sessions').set(h.H).send({ unknown: true })).status, 400);
  });
});
