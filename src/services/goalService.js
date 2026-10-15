'use strict';
const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const { MAX_GOALS_PER_USER } = require('../utils/constants');

const SELECT = {
  id: true, name: true, description: true, category: true, targetValue: true,
  currentValue: true, unit: true, period: true, isActive: true, createdAt: true, updatedAt: true,
};
const notFound = () => new AppError(404, 'GOAL_NOT_FOUND', 'Meta não encontrada.');

async function getOwned(userId, id) {
  const goal = await prisma.goal.findFirst({ where: { id, userId }, select: SELECT });
  if (!goal) throw notFound();
  return goal;
}

async function create(userId, input) {
  const count = await prisma.goal.count({ where: { userId } });
  if (count >= MAX_GOALS_PER_USER) throw new AppError(422, 'GOAL_LIMIT_REACHED', `Limite de ${MAX_GOALS_PER_USER} metas atingido.`);
  return prisma.goal.create({
    data: {
      userId,
      name: input.name,
      description: input.description || null,
      category: input.category || null,
      targetValue: input.targetValue,
      currentValue: input.currentValue,
      unit: input.unit,
      period: input.period,
    },
    select: SELECT,
  });
}

async function list(userId, { status, page, limit }) {
  const where = { userId, ...(status === 'active' ? { isActive: true } : status === 'archived' ? { isActive: false } : {}) };
  const [items, total] = await Promise.all([
    prisma.goal.findMany({ where, select: SELECT, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
    prisma.goal.count({ where }),
  ]);
  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

async function update(userId, id, input) {
  await getOwned(userId, id);
  const data = { ...input };
  if (input.description !== undefined) data.description = input.description || null;
  if (input.category !== undefined) data.category = input.category || null;
  const result = await prisma.goal.updateMany({ where: { id, userId }, data });
  if (result.count === 0) throw notFound();
  return getOwned(userId, id);
}

async function addProgress(userId, id, amount) {
  const goal = await getOwned(userId, id);
  if (!goal.isActive) throw new AppError(409, 'GOAL_ARCHIVED', 'Não é possível atualizar uma meta arquivada.');
  const result = await prisma.goal.updateMany({
    where: { id, userId, isActive: true },
    data: { currentValue: { increment: amount } },
  });
  if (result.count === 0) throw notFound();
  return getOwned(userId, id);
}

async function remove(userId, id) {
  await getOwned(userId, id);
  const result = await prisma.goal.deleteMany({ where: { id, userId } });
  if (result.count === 0) throw notFound();
}

module.exports = { SELECT, getOwned, create, list, update, addProgress, remove };
