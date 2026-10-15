'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

describe('Check-ins, dashboard e progresso (valores esperados conhecidos)', { skip: h.skip }, () => {
  let app, A, habit, checkInToday, today, add;
  before(async () => {
    app = h.loadApp();
    A = await h.signup(app, 'cp');
    today = h.todayKey();
    add = h.dates().addDays;
    habit = await h.mkHabit(A, { name: 'Alongar' });
    // simula hábito criado há 5 dias para permitir conclusões retroativas
    await h.prisma().habit.update({ where: { id: habit.id }, data: { startDateKey: add(today, -5) } });
  });
  after(h.closeDb);

  const checkIn = (id, body = {}) => A.agent.post(`/api/habits/${id}/check-ins`).set(h.H).send(body);

  it('registra conclusão de hoje e impede duplicata (409)', async () => {
    const res = await checkIn(habit.id);
    assert.equal(res.status, 201);
    assert.equal(res.body.data.checkIn.dateKey, today);
    assert.equal('userId' in res.body.data.checkIn, false);
    checkInToday = res.body.data.checkIn;
    const dup = await checkIn(habit.id);
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error.code, 'CHECKIN_ALREADY_EXISTS');
    // concorrência: duas requisições simultâneas no mesmo dia => no máximo 1 criada
    const hb = await h.mkHabit(A, { name: 'Concorrente' });
    const [r1, r2] = await Promise.all([checkIn(hb.id), checkIn(hb.id)]);
    assert.deepEqual([r1.status, r2.status].sort(), [201, 409]);
    assert.equal(await h.prisma().checkIn.count({ where: { habitId: hb.id } }), 1);
  });

  it('/check-ins/today lista as conclusões do dia', async () => {
    const res = await A.agent.get('/api/check-ins/today');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.date, today);
    assert.ok(res.body.data.items.some((c) => c.id === checkInToday.id));
  });

  it('retroativos: aceita até 7 dias e dentro da vida do hábito; rejeita futuro, antigo e pré-início', async () => {
    assert.equal((await checkIn(habit.id, { date: add(today, -1) })).status, 201);
    assert.equal((await checkIn(habit.id, { date: add(today, -2) })).status, 201);
    assert.equal((await checkIn(habit.id, { date: add(today, 1) })).body.error.code, 'FUTURE_DATE');
    assert.equal((await checkIn(habit.id, { date: add(today, -9) })).body.error.code, 'DATE_TOO_OLD');
    assert.equal((await checkIn(habit.id, { date: add(today, -6) })).body.error.code, 'BEFORE_HABIT_START');
    for (const bad of ['2026-02-30', 'ontem', 20260101, null]) {
      assert.equal((await checkIn(habit.id, { date: bad })).status, 400, String(bad));
    }
  });

  it('dashboard: números esperados e consistência com /progress', async () => {
    const d = (await A.agent.get('/api/dashboard')).body.data;
    assert.equal(d.date, today);
    assert.equal(d.scheduled, 2); // "Alongar" + "Concorrente"
    assert.equal(d.completed, 2);
    assert.equal(d.pending, 0);
    assert.equal(d.completionRate, 1);

    const p = (await A.agent.get('/api/progress?period=week')).body.data;
    assert.equal(p.today.scheduled, d.scheduled);
    assert.equal(p.today.completed, d.completed);
    assert.deepEqual(p.totals.completionRate, d.progress.last7Days.completionRate);
    assert.equal(p.streaks.current, d.progress.currentStreak);
    assert.equal(p.streaks.best, d.progress.bestStreak);

    const hp = p.habits.find((x) => x.id === habit.id);
    // dias -5..0 agendados (6) e 3 concluídos (0, -1, -2)
    assert.equal(hp.scheduled, 6);
    assert.equal(hp.completed, 3);
    assert.equal(hp.completionRate, 0.5);
  });

  it('progresso do hábito: taxa, sequências e série; histórico geral', async () => {
    const r = (await A.agent.get(`/api/habits/${habit.id}/progress?period=week`)).body.data;
    assert.equal(r.scheduled, 6);
    assert.equal(r.completed, 3);
    assert.equal(r.completionRate, 0.5);
    assert.equal(r.currentStreak, 3);
    assert.equal(r.bestStreak, 3);
    assert.equal(r.series.length, 6);

    const hist = (await A.agent.get('/api/progress/history?period=week')).body.data;
    assert.equal(hist.series.length, 7);
    assert.equal(hist.totals.completed, hist.series.reduce((s, x) => s + x.completed, 0));
    assert.equal(hist.series.at(-1).date, today);
  });

  it('desfazer conclusão atualiza dashboard e sequência (hoje pendente não zera)', async () => {
    const del = await A.agent.delete(`/api/habits/${habit.id}/check-ins/${checkInToday.id}`).set(h.H);
    assert.equal(del.status, 200);
    const again = await A.agent.delete(`/api/habits/${habit.id}/check-ins/${checkInToday.id}`).set(h.H);
    assert.equal(again.status, 404);
    const d = (await A.agent.get('/api/dashboard')).body.data;
    assert.equal(d.completed, 1);
    assert.equal(d.pending, 1);
    const r = (await A.agent.get(`/api/habits/${habit.id}/progress?period=week`)).body.data;
    assert.equal(r.currentStreak, 2); // -2 e -1 concluídos; hoje pendente
  });

  it('hábito não programado para o dia não é pendente e rejeita check-in', async () => {
    const dow = h.dates().dayOfWeek(today);
    const other = await h.mkHabit(A, { name: 'Outro dia', frequency: 'CUSTOM', daysOfWeek: [(dow + 1) % 7] });
    const before = (await A.agent.get('/api/dashboard')).body.data;
    const res = await checkIn(other.id);
    assert.equal(res.status, 422);
    assert.equal(res.body.error.code, 'NOT_SCHEDULED');
    const after_ = (await A.agent.get('/api/dashboard')).body.data;
    assert.equal(after_.totalActiveHabits, before.totalActiveHabits);
    assert.equal(after_.pending, before.pending);
    assert.equal(after_.scheduled, before.scheduled);
  });

  it('arquivado: histórico preservado, sem novos check-ins e fora dos números gerais', async () => {
    await A.agent.patch(`/api/habits/${habit.id}/archive`).set(h.H).send({});
    assert.equal((await checkIn(habit.id)).body.error.code, 'HABIT_ARCHIVED');
    const cis = await A.agent.get(`/api/habits/${habit.id}/check-ins`);
    assert.equal(cis.body.data.items.length, 2); // -1 e -2 preservados
    const d = (await A.agent.get('/api/dashboard')).body.data;
    assert.ok(!d.habits.some((x) => x.id === habit.id));
    assert.equal((await A.agent.get(`/api/habits/${habit.id}/progress`)).status, 200); // consulta individual segue disponível
  });

  it('filtros de histórico por período e validação de intervalos', async () => {
    const f = await A.agent.get(`/api/habits/${habit.id}/check-ins?from=${add(today, -2)}&to=${add(today, -2)}`);
    assert.equal(f.body.data.items.length, 1);
    assert.equal((await A.agent.get(`/api/progress?from=${add(today, -3)}&to=${today}`)).body.data.period.days, 4);
    assert.equal((await A.agent.get(`/api/progress?from=${today}&to=${add(today, -3)}`)).body.error.code, 'INVALID_RANGE');
    assert.equal((await A.agent.get(`/api/progress?from=${add(today, -400)}`)).body.error.code, 'RANGE_TOO_LARGE');
    assert.equal((await A.agent.get(`/api/progress?period=week&from=${today}`)).status, 400);
    assert.equal((await A.agent.get('/api/progress?period=year')).status, 400);
    assert.equal((await A.agent.get('/api/progress?from=2026-02-30')).status, 400);
    assert.equal((await A.agent.get(`/api/dashboard?date=${add(today, 1)}`)).body.error.code, 'FUTURE_DATE');
  });

  it('usuário sem hábitos: dashboard/progresso zerados, taxa null (sem números fictícios)', async () => {
    const U = await h.signup(app, 'vazio');
    const d = (await U.agent.get('/api/dashboard')).body.data;
    assert.equal(d.totalActiveHabits, 0);
    assert.equal(d.completionRate, null);
    const p = (await U.agent.get('/api/progress')).body.data;
    assert.equal(p.totals.completionRate, null);
    assert.deepEqual(p.streaks, { current: 0, best: 0 });
  });
});
