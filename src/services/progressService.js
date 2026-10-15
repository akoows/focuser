'use strict';
const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const { MAX_HABITS_PER_USER, MAX_RANGE_DAYS, STREAK_WINDOW_DAYS, PERIOD_DAYS } = require('../utils/constants');
const { dateKeyFromInstant, addDays, diffDays } = require('../utils/dates');
const calc = require('./statsCalculator');
const habitService = require('./habitService');

const HABIT_SELECT = { id: true, name: true, frequency: true, daysOfWeek: true, startDateKey: true, isActive: true };
const MAX_ROWS = 50000; // 100 hábitos x 366 dias = 36.600 (limite superior de volume)

const todayFor = (user) => dateKeyFromInstant(new Date(), user.timezone);
const streakFrom = (today) => addDays(today, -(STREAK_WINDOW_DAYS - 1));
const earliest = (...keys) => keys.reduce((a, b) => (a < b ? a : b));

/** Resolve período: period=week|month (7/30 dias até hoje) ou from/to (máx. 366 dias; `to` futuro é recortado em hoje). */
function resolveRange(user, q = {}) {
  const today = todayFor(user);
  if (q.from || q.to) {
    const to = q.to && q.to < today ? q.to : today;
    const from = q.from ?? addDays(to, -6);
    if (from > to) throw new AppError(422, 'INVALID_RANGE', 'Intervalo inválido: "from" deve ser anterior ou igual a "to" (e não futuro).');
    const days = diffDays(from, to) + 1;
    if (days > MAX_RANGE_DAYS) throw new AppError(422, 'RANGE_TOO_LARGE', `Intervalo máximo: ${MAX_RANGE_DAYS} dias.`);
    return { from, to, today, days, period: 'custom' };
  }
  return rangeForDays(user, q.period === 'month' ? PERIOD_DAYS.month : PERIOD_DAYS.week, q.period || 'week');
}

function rangeForDays(user, days, period) {
  const today = todayFor(user);
  return { from: addDays(today, -(days - 1)), to: today, today, days, period };
}

async function loadCompleted(userId, habitIds, from, to) {
  const map = new Map();
  if (habitIds.length === 0) return map;
  const rows = await prisma.checkIn.findMany({
    where: { userId, habitId: { in: habitIds }, dateKey: { gte: from, lte: to } },
    select: { habitId: true, dateKey: true },
    take: MAX_ROWS,
  });
  for (const r of rows) {
    if (!map.has(r.habitId)) map.set(r.habitId, new Set());
    map.get(r.habitId).add(r.dateKey);
  }
  return map;
}

/** Hábitos ATIVOS do usuário + check-ins de [loadFrom..today]. Base de dashboard, progresso e IA. */
async function loadActive(userId, loadFrom, today) {
  const habits = await prisma.habit.findMany({ where: { userId, isActive: true }, select: HABIT_SELECT, orderBy: { createdAt: 'asc' }, take: MAX_HABITS_PER_USER });
  const completed = await loadCompleted(userId, habits.map((h) => h.id), loadFrom, today);
  return { habits, completed };
}

const periodOut = (r) => ({ from: r.from, to: r.to, days: r.days, type: r.period });

async function overview(user, query) {
  const range = resolveRange(user, query);
  const { habits, completed } = await loadActive(user.id, earliest(range.from, streakFrom(range.today)), range.today);
  const o = calc.buildOverview(habits, completed, range);
  const todaySummary = calc.buildDaySummary(habits, completed, range.today);
  const { items, ...todayTotals } = todaySummary; // eslint-disable-line no-unused-vars
  return {
    period: periodOut(range),
    totals: { activeHabits: habits.length, ...o.totals },
    today: todayTotals,
    streaks: { current: o.streaks.current, best: o.streaks.best },
    habits: o.habits,
  };
}

async function history(user, query) {
  const range = resolveRange(user, query);
  const { habits, completed } = await loadActive(user.id, range.from, range.today);
  const series = calc.buildSeries(habits, completed, range.from, range.to);
  return { period: periodOut(range), totals: calc.sumSeries(series), series };
}

async function habitProgress(user, habitId, query) {
  const habit = await habitService.getOwned(user.id, habitId); // 404 se não for do usuário
  const range = resolveRange(user, query);
  const completed = await loadCompleted(user.id, [habitId], earliest(range.from, streakFrom(range.today)), range.today);
  const set = completed.get(habitId) || new Set();
  const stats = calc.computeHabitStats(habit, set, range.from, range.to);
  const streaks = calc.computeHabitStreaks(habit, set, range.today);
  return {
    habit: { id: habit.id, name: habit.name, frequency: habit.frequency, daysOfWeek: habit.daysOfWeek, isActive: habit.isActive },
    period: periodOut(range),
    scheduled: stats.scheduled, completed: stats.completed, completionRate: stats.completionRate,
    currentStreak: streaks.current, bestStreak: streaks.best,
    series: stats.series,
  };
}

async function dashboard(user, { date }) {
  const today = todayFor(user);
  const day = date ?? today;
  if (day > today) throw new AppError(422, 'FUTURE_DATE', 'Data futura não permitida.');
  const week = { from: addDays(today, -6), to: today, today, days: 7, period: 'week' };
  const { habits, completed } = await loadActive(user.id, earliest(week.from, streakFrom(today), day), today);
  const summary = calc.buildDaySummary(habits, completed, day);
  const o = calc.buildOverview(habits, completed, week); // mesma função usada em /progress => números consistentes
  return {
    date: day,
    totalActiveHabits: habits.length,
    scheduled: summary.scheduled, completed: summary.completed, pending: summary.pending, completionRate: summary.completionRate,
    habits: summary.items,
    progress: { last7Days: o.totals, currentStreak: o.streaks.current, bestStreak: o.streaks.best },
  };
}

/** Métricas calculadas no servidor a partir do banco, usadas como contexto da IA. */
async function analysisMetrics(user, days, period) {
  const range = rangeForDays(user, days, period);
  const { habits, completed } = await loadActive(user.id, earliest(range.from, streakFrom(range.today)), range.today);
  const o = calc.buildOverview(habits, completed, range);
  return { period: periodOut(range), totals: { activeHabits: habits.length, ...o.totals }, streaks: o.streaks, habits: o.habits, weekdays: calc.weekdayBreakdown(o.series) };
}

module.exports = { resolveRange, overview, history, habitProgress, dashboard, analysisMetrics };
