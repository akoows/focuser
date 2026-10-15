'use strict';
const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const { MAX_BACKDATE_DAYS } = require('../utils/constants');
const { dateKeyFromInstant, diffDays } = require('../utils/dates');
const { isScheduled } = require('./statsCalculator');
const habitService = require('./habitService');

const SELECT = { id: true, habitId: true, dateKey: true, completedAt: true, createdAt: true };

// Regras: hábito do próprio usuário e ativo; data no fuso do usuário; sem futuro; retroativo até
// MAX_BACKDATE_DAYS; não antes do início do hábito; somente em dias agendados; 1 por hábito/dia
// (garantido pelo índice único [habitId, dateKey], inclusive sob concorrência).
async function create(user, habitId, { date }) {
  const habit = await habitService.getOwned(user.id, habitId);
  if (!habit.isActive) throw new AppError(409, 'HABIT_ARCHIVED', 'Hábito arquivado: reative-o para registrar conclusões.');

  const today = dateKeyFromInstant(new Date(), user.timezone);
  const dateKey = date ?? today;
  if (dateKey > today) throw new AppError(422, 'FUTURE_DATE', 'Não é possível registrar conclusão em data futura.');
  if (diffDays(dateKey, today) > MAX_BACKDATE_DAYS) throw new AppError(422, 'DATE_TOO_OLD', `Conclusões retroativas são limitadas a ${MAX_BACKDATE_DAYS} dias.`);
  if (dateKey < habit.startDateKey) throw new AppError(422, 'BEFORE_HABIT_START', 'Data anterior à criação do hábito.');
  if (!isScheduled(habit, dateKey)) throw new AppError(422, 'NOT_SCHEDULED', 'O hábito não está programado para esta data.');

  try {
    return await prisma.checkIn.create({ data: { userId: user.id, habitId, dateKey, completedAt: new Date() }, select: SELECT });
  } catch (err) {
    if (err.code === 'P2002') throw new AppError(409, 'CHECKIN_ALREADY_EXISTS', 'Já existe conclusão registrada para este hábito nesta data.');
    throw err;
  }
}

async function list(userId, habitId, { from, to, page, limit }) {
  await habitService.getOwned(userId, habitId);
  const where = { habitId, userId, ...(from || to ? { dateKey: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) };
  const [items, total] = await Promise.all([
    prisma.checkIn.findMany({ where, select: SELECT, orderBy: { dateKey: 'desc' }, skip: (page - 1) * limit, take: limit }),
    prisma.checkIn.count({ where }),
  ]);
  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

async function remove(userId, habitId, checkInId) {
  await habitService.getOwned(userId, habitId);
  const r = await prisma.checkIn.deleteMany({ where: { id: checkInId, habitId, userId } });
  if (r.count === 0) throw new AppError(404, 'CHECKIN_NOT_FOUND', 'Check-in não encontrado.');
}

async function today(user) {
  const date = dateKeyFromInstant(new Date(), user.timezone);
  const items = await prisma.checkIn.findMany({ where: { userId: user.id, dateKey: date }, select: SELECT, orderBy: { completedAt: 'asc' }, take: 200 });
  return { date, items };
}

module.exports = { create, list, remove, today };
