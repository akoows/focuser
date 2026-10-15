'use strict';
// Cálculos de dashboard/progresso. MÓDULO PURO (sem banco, sem env): fácil de testar.
//
// FÓRMULAS (documentadas também no README):
//  - Hábito agendado em um dia D  <=>  D >= startDateKey  E  dayOfWeek(D) ∈ daysOfWeek.
//  - Dia não agendado NUNCA é falha: simplesmente não entra no denominador.
//  - Taxa de conclusão = concluídos / agendados (null se agendados = 0), arredondada a 4 casas.
//    O dia de hoje conta como agendado (pendente enquanto não houver check-in).
//  - Sequência (hábito): dias agendados consecutivos concluídos, em ordem cronológica.
//    Dia agendado anterior a hoje sem check-in zera a sequência. Hoje pendente NÃO zera.
//  - Sequência geral: "dia perfeito" = todos os hábitos ativos agendados no dia foram concluídos.
//    Dias sem nenhum hábito agendado são neutros. Hoje pendente não zera.
//  - Janela máxima de sequência: STREAK_WINDOW_DAYS (365) dias até hoje.
//  - Somente hábitos ATIVOS entram nos números gerais (dashboard/progresso/IA).

const { addDays, dayOfWeek } = require('../utils/dates');
const { STREAK_WINDOW_DAYS } = require('../utils/constants');

const EMPTY = new Set();
const ratio = (done, total) => (total === 0 ? null : Math.round((done / total) * 10000) / 10000);
const minKey = (a, b) => (a < b ? a : b);
const maxKey = (a, b) => (a > b ? a : b);

function isScheduled(habit, key, dow = dayOfWeek(key)) {
  return key >= habit.startDateKey && habit.daysOfWeek.includes(dow);
}

/** Resumo de um único dia para os hábitos ATIVOS. `completed`: Map<habitId, Set<dateKey>>. */
function buildDaySummary(habits, completed, key) {
  const dow = dayOfWeek(key);
  const items = habits
    .filter((h) => h.isActive !== false && isScheduled(h, key, dow))
    .map((h) => ({ id: h.id, name: h.name, completed: (completed.get(h.id) || EMPTY).has(key) }));
  const done = items.filter((i) => i.completed).length;
  return { date: key, scheduled: items.length, completed: done, pending: items.length - done, completionRate: ratio(done, items.length), items };
}

/** Série diária [from..to] (to deve ser <= hoje; o chamador garante). */
function buildSeries(habits, completed, from, to) {
  const series = [];
  for (let k = from; k <= to; k = addDays(k, 1)) {
    const d = buildDaySummary(habits, completed, k);
    series.push({ date: k, scheduled: d.scheduled, completed: d.completed, completionRate: d.completionRate });
  }
  return series;
}

function sumSeries(series) {
  const scheduled = series.reduce((s, d) => s + d.scheduled, 0);
  const done = series.reduce((s, d) => s + d.completed, 0);
  return { scheduled, completed: done, completionRate: ratio(done, scheduled) };
}

/** Percorre os dias e calcula sequência atual e melhor. evaluate(k): null=neutro, true=ok, false=falha. */
function runStreaks(fromKey, todayKey, evaluate) {
  let run = 0;
  let best = 0;
  for (let k = fromKey; k <= todayKey; k = addDays(k, 1)) {
    const r = evaluate(k);
    if (r === null) continue;
    if (r) {
      run += 1;
      if (run > best) best = run;
    } else if (k !== todayKey) {
      run = 0; // hoje pendente não quebra a sequência
    }
  }
  return { current: run, best };
}

const streakWindowStart = (todayKey) => addDays(todayKey, -(STREAK_WINDOW_DAYS - 1));

function computeHabitStreaks(habit, completedSet, todayKey) {
  const from = maxKey(habit.startDateKey, streakWindowStart(todayKey));
  return runStreaks(from, todayKey, (k) => (isScheduled(habit, k) ? completedSet.has(k) : null));
}

function computeOverallStreaks(habits, completed, todayKey) {
  if (habits.length === 0) return { current: 0, best: 0 };
  const minStart = habits.reduce((m, h) => minKey(m, h.startDateKey), habits[0].startDateKey);
  const from = maxKey(minStart, streakWindowStart(todayKey));
  return runStreaks(from, todayKey, (k) => {
    const dow = dayOfWeek(k);
    const sched = habits.filter((h) => isScheduled(h, k, dow));
    if (sched.length === 0) return null;
    return sched.every((h) => (completed.get(h.id) || EMPTY).has(k));
  });
}

/** Estatísticas de um hábito em [from..to] (to <= hoje). Recorta pelo startDateKey. */
function computeHabitStats(habit, completedSet, from, to) {
  const start = maxKey(from, habit.startDateKey);
  let scheduled = 0;
  let done = 0;
  const series = [];
  for (let k = start; k <= to; k = addDays(k, 1)) {
    if (!isScheduled(habit, k)) continue;
    scheduled += 1;
    const c = completedSet.has(k);
    if (c) done += 1;
    series.push({ date: k, completed: c });
  }
  return { scheduled, completed: done, completionRate: ratio(done, scheduled), series };
}

/** Visão geral usada por dashboard, /progress e IA (mesma fonte => números consistentes). */
function buildOverview(habits, completed, { from, to, today }) {
  const series = buildSeries(habits, completed, from, to);
  const totals = sumSeries(series);
  const streaks = computeOverallStreaks(habits, completed, today);
  const perHabit = habits.map((h) => {
    const { scheduled, completed: done, completionRate } = computeHabitStats(h, completed.get(h.id) || EMPTY, from, to);
    return { id: h.id, name: h.name, frequency: h.frequency, scheduled, completed: done, completionRate };
  });
  return { totals, streaks, habits: perHabit, series };
}

/** Agrega a série por dia da semana (0=domingo). */
function weekdayBreakdown(series) {
  const acc = Array.from({ length: 7 }, (_, weekday) => ({ weekday, scheduled: 0, completed: 0 }));
  for (const d of series) {
    const w = acc[dayOfWeek(d.date)];
    w.scheduled += d.scheduled;
    w.completed += d.completed;
  }
  return acc.map((w) => ({ ...w, completionRate: ratio(w.completed, w.scheduled) }));
}

module.exports = {
  ratio, isScheduled, buildDaySummary, buildSeries, sumSeries, runStreaks,
  computeHabitStreaks, computeOverallStreaks, computeHabitStats, buildOverview, weekdayBreakdown,
};
