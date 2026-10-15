'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const c = require('../../src/services/statsCalculator');

const TODAY = '2026-10-12'; // segunda-feira
const mk = (id, start, days, extra = {}) => ({ id, name: id, frequency: days.length === 7 ? 'DAILY' : 'CUSTOM', daysOfWeek: days, startDateKey: start, isActive: true, ...extra });
const ALL = [0, 1, 2, 3, 4, 5, 6];
const done = (...keys) => new Set(keys);

test('hábito diário: sequência atual e melhor (hoje pendente não zera)', () => {
  const h = mk('A', '2026-10-01', ALL);
  const set = done('2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11');
  assert.deepEqual(c.computeHabitStreaks(h, set, TODAY), { current: 4, best: 5 });
  set.add(TODAY);
  assert.deepEqual(c.computeHabitStreaks(h, set, TODAY), { current: 5, best: 5 });
});

test('hábito Seg/Qua/Sex: dias não agendados não são falhas (sequência e taxa)', () => {
  const h = mk('B', '2026-09-28', [1, 3, 5]);
  const set = done('2026-09-28', '2026-09-30', '2026-10-02', '2026-10-05', '2026-10-07', '2026-10-09');
  assert.deepEqual(c.computeHabitStreaks(h, set, TODAY), { current: 6, best: 6 });
  const s = c.computeHabitStats(h, set, '2026-09-28', TODAY);
  assert.equal(s.scheduled, 7); // inclui hoje (segunda, pendente)
  assert.equal(s.completed, 6);
  assert.equal(s.completionRate, 0.8571);
  assert.equal(s.series.length, 7);
});

test('falta em dia agendado passado zera a sequência', () => {
  const h = mk('B', '2026-09-28', [1, 3, 5]);
  const set = done('2026-09-28', '2026-09-30', '2026-10-05', '2026-10-07', '2026-10-09'); // faltou 10-02
  assert.deepEqual(c.computeHabitStreaks(h, set, TODAY), { current: 3, best: 3 });
});

test('dias anteriores ao startDateKey nunca contam como falha', () => {
  const h = mk('C', '2026-10-10', ALL);
  const s = c.computeHabitStats(h, done('2026-10-10'), '2026-10-05', TODAY);
  assert.equal(s.scheduled, 3); // 10, 11, 12
  assert.equal(s.completed, 1);
});

test('resumo diário: hábito não agendado não é pendente; hábito futuro não conta', () => {
  const a = mk('A', '2026-09-01', ALL);
  const b = mk('B', '2026-09-01', [1, 3, 5]); // não agenda terça
  const f = mk('F', '2026-10-20', ALL); // começa no futuro
  const completed = new Map([['A', done('2026-10-13')]]);
  const day = c.buildDaySummary([a, b, f], completed, '2026-10-13'); // terça
  assert.equal(day.scheduled, 1);
  assert.equal(day.completed, 1);
  assert.equal(day.pending, 0);
  assert.equal(day.completionRate, 1);
});

test('resumo diário: arquivados são ignorados e sem agendados => taxa null', () => {
  const a = mk('A', '2026-09-01', ALL, { isActive: false });
  const day = c.buildDaySummary([a], new Map(), TODAY);
  assert.equal(day.scheduled, 0);
  assert.equal(day.completionRate, null);
});

test('sequência geral: dia perfeito, hoje pendente neutro, dias sem agenda neutros', () => {
  const a = mk('A', '2026-10-05', ALL);
  const b = mk('B', '2026-10-05', [1, 3, 5]);
  const completed = new Map([
    ['A', done('2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11')],
    ['B', done('2026-10-05', '2026-10-07', '2026-10-09')],
  ]);
  assert.deepEqual(c.computeOverallStreaks([a, b], completed, TODAY), { current: 7, best: 7 });
  completed.get('A').delete('2026-10-08'); // quebra o dia 10-08
  assert.deepEqual(c.computeOverallStreaks([a, b], completed, TODAY), { current: 3, best: 3 });
});

test('buildOverview: dashboard e progresso usam a mesma fonte (totais = soma por hábito)', () => {
  const a = mk('A', '2026-10-01', ALL);
  const b = mk('B', '2026-10-01', [1, 3, 5]);
  const completed = new Map([['A', done('2026-10-10', '2026-10-11')], ['B', done('2026-10-09')]]);
  const o = c.buildOverview([a, b], completed, { from: '2026-10-06', to: TODAY, today: TODAY });
  const sumSched = o.habits.reduce((s, h) => s + h.scheduled, 0);
  const sumDone = o.habits.reduce((s, h) => s + h.completed, 0);
  assert.equal(o.totals.scheduled, sumSched);
  assert.equal(o.totals.completed, sumDone);
  assert.equal(o.series.length, 7);
  assert.equal(o.totals.completed, 3);
  assert.equal(o.totals.completionRate, c.ratio(3, o.totals.scheduled));
});

test('weekdayBreakdown agrega por dia da semana', () => {
  const series = [
    { date: '2026-10-12', scheduled: 2, completed: 1 }, // segunda
    { date: '2026-10-05', scheduled: 2, completed: 2 }, // segunda
    { date: '2026-10-13', scheduled: 1, completed: 0 }, // terça
  ];
  const w = c.weekdayBreakdown(series);
  assert.equal(w[1].scheduled, 4);
  assert.equal(w[1].completionRate, 0.75);
  assert.equal(w[2].completionRate, 0);
  assert.equal(w[0].completionRate, null);
});
