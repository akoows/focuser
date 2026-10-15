'use strict';
const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const { ALL_DAYS, MAX_HABITS_PER_USER } = require('../utils/constants');
const { dateKeyFromInstant } = require('../utils/dates');

// userId e demais campos internos NÃO são expostos.
const SELECT = {
  id: true, name: true, description: true, category: true, frequency: true, daysOfWeek: true,
  isActive: true, startDateKey: true, createdAt: true, updatedAt: true,
};

const notFound = () => new AppError(404, 'HABIT_NOT_FOUND', 'Hábito não encontrado.'); // mesmo erro p/ inexistente e de terceiros
const normalizeDays = (frequency, d) => (frequency === 'DAILY' ? [...ALL_DAYS] : [...new Set(d)].sort((a, b) => a - b));

// Toda consulta de hábito passa por aqui: o filtro { id, userId } garante o isolamento entre usuários.
async function getOwned(userId, id) {
  const habit = await prisma.habit.findFirst({ where: { id, userId }, select: SELECT });
  if (!habit) throw notFound();
  return habit;
}

async function create(user, input) {
  const count = await prisma.habit.count({ where: { userId: user.id } });
  if (count >= MAX_HABITS_PER_USER) throw new AppError(422, 'HABIT_LIMIT_REACHED', `Limite de ${MAX_HABITS_PER_USER} hábitos atingido.`);
  return prisma.habit.create({
    data: {
      userId: user.id,
      name: input.name,
      description: input.description || null,
      category: input.category || null,
      frequency: input.frequency,
      daysOfWeek: normalizeDays(input.frequency, input.daysOfWeek),
      startDateKey: dateKeyFromInstant(new Date(), user.timezone),
    },
    select: SELECT,
  });
}

async function list(userId, { status, page, limit }) {
  const where = { userId, ...(status === 'active' ? { isActive: true } : status === 'archived' ? { isActive: false } : {}) };
  const [items, total] = await Promise.all([
    prisma.habit.findMany({ where, select: SELECT, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
    prisma.habit.count({ where }),
  ]);
  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

async function update(userId, id, input) {
  const existing = await getOwned(userId, id);
  const data = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description || null;
  if (input.frequency !== undefined || input.daysOfWeek !== undefined) {
    const frequency = input.frequency ?? existing.frequency;
    if (input.frequency === undefined && frequency === 'DAILY') {
      throw new AppError(422, 'INVALID_FREQUENCY_DAYS', 'daysOfWeek só pode ser alterado em hábitos com frequency CUSTOM.');
    }
    data.frequency = frequency;
    data.daysOfWeek = normalizeDays(frequency, input.daysOfWeek ?? existing.daysOfWeek);
  }
  const r = await prisma.habit.updateMany({ where: { id, userId }, data });
  if (r.count === 0) throw notFound();
  return getOwned(userId, id);
}

async function setArchived(userId, id, archived) {
  await getOwned(userId, id);
  const r = await prisma.habit.updateMany({ where: { id, userId }, data: { isActive: !archived } });
  if (r.count === 0) throw notFound();
  return getOwned(userId, id);
}

// Exclusão apaga também o histórico (check-ins) do hábito, de forma atômica.
// Requer MongoDB em replica set (transações). Para PRESERVAR histórico, use o arquivamento.
async function remove(userId, id) {
  await getOwned(userId, id);
  await prisma.$transaction([
    prisma.checkIn.deleteMany({ where: { habitId: id, userId } }),
    prisma.habit.deleteMany({ where: { id, userId } }),
  ]);
}

module.exports = { SELECT, getOwned, create, list, update, setArchived, remove };
