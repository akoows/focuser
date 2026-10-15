'use strict';
const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const goalService = require('./goalService');

const SELECT = {
  id: true, userId: true, goalId: true, title: true, plannedMinutes: true, status: true,
  elapsedSeconds: true, startedAt: true, segmentStartedAt: true, endedAt: true, createdAt: true,
};
const notFound = () => new AppError(404, 'FOCUS_SESSION_NOT_FOUND', 'Sessão de foco não encontrada.');
const stateError = (status) => new AppError(409, 'INVALID_FOCUS_SESSION_STATE', `A sessão não pode realizar esta ação no estado ${status}.`);
const availableActiveSession = (userId) => ({
  id: userId,
  OR: [
    { activeFocusSessionId: null },
    { activeFocusSessionId: { isSet: false } },
  ],
});

function present(session, now = new Date()) {
  if (!session) return null;
  const runningSeconds = session.status === 'RUNNING' && session.segmentStartedAt
    ? Math.max(0, Math.floor((now.getTime() - session.segmentStartedAt.getTime()) / 1000))
    : 0;
  const { userId, segmentStartedAt, ...publicSession } = session;
  return { ...publicSession, elapsedSeconds: session.elapsedSeconds + runningSeconds };
}

async function getOwned(userId, id) {
  const session = await prisma.focusSession.findFirst({ where: { id, userId }, select: SELECT });
  if (!session) throw notFound();
  return session;
}

async function getActive(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { activeFocusSessionId: true } });
  if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Sessão inválida.');
  if (!user.activeFocusSessionId) return null;
  return present(await getOwned(userId, user.activeFocusSessionId));
}

async function get(userId, id) {
  return present(await getOwned(userId, id));
}

async function create(userId, input) {
  if (input.goalId) {
    const goal = await goalService.getOwned(userId, input.goalId);
    if (!goal.isActive) throw new AppError(409, 'GOAL_ARCHIVED', 'Não é possível iniciar uma sessão para uma meta arquivada.');
  }

  const now = new Date();
  const session = await prisma.$transaction(async (tx) => {
    const created = await tx.focusSession.create({
      data: {
        userId,
        goalId: input.goalId ?? null,
        title: input.title,
        plannedMinutes: input.plannedMinutes,
        status: 'RUNNING',
        segmentStartedAt: now,
      },
      select: SELECT,
    });
    const claimed = await tx.user.updateMany({
      where: availableActiveSession(userId),
      data: { activeFocusSessionId: created.id },
    });
    if (claimed.count !== 1) throw new AppError(409, 'FOCUS_SESSION_ALREADY_ACTIVE', 'Conclua ou cancele sua sessão ativa antes de iniciar outra.');
    return created;
  });
  return present(session, now);
}

async function list(userId, { status, page, limit }) {
  const where = { userId, ...(status ? { status } : {}) };
  const [items, total] = await Promise.all([
    prisma.focusSession.findMany({ where, select: SELECT, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
    prisma.focusSession.count({ where }),
  ]);
  const now = new Date();
  return { items: items.map((session) => present(session, now)), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

async function pause(userId, id) {
  const session = await getOwned(userId, id);
  if (session.status !== 'RUNNING') throw stateError(session.status);
  const now = new Date();
  const elapsed = session.elapsedSeconds + Math.max(0, Math.floor((now.getTime() - session.segmentStartedAt.getTime()) / 1000));
  const result = await prisma.focusSession.updateMany({
    where: { id, userId, status: 'RUNNING' },
    data: { status: 'PAUSED', elapsedSeconds: elapsed, segmentStartedAt: null },
  });
  if (result.count === 0) throw stateError(session.status);
  return present(await getOwned(userId, id));
}

async function resume(userId, id) {
  const session = await getOwned(userId, id);
  if (session.status !== 'PAUSED') throw stateError(session.status);
  const now = new Date();
  const resumed = await prisma.$transaction(async (tx) => {
    const claimed = await tx.user.updateMany({
      where: {
        id: userId,
        OR: [
          { activeFocusSessionId: null },
          { activeFocusSessionId: { isSet: false } },
          { activeFocusSessionId: id },
        ],
      },
      data: { activeFocusSessionId: id },
    });
    if (claimed.count !== 1) throw new AppError(409, 'FOCUS_SESSION_ALREADY_ACTIVE', 'Conclua ou cancele sua sessão ativa antes de retomar outra.');
    const result = await tx.focusSession.updateMany({
      where: { id, userId, status: 'PAUSED' },
      data: { status: 'RUNNING', segmentStartedAt: now },
    });
    if (result.count === 0) throw stateError(session.status);
    return tx.focusSession.findFirst({ where: { id, userId }, select: SELECT });
  });
  return present(resumed, now);
}

async function finish(userId, id, status) {
  const session = await getOwned(userId, id);
  if (!['RUNNING', 'PAUSED'].includes(session.status)) throw stateError(session.status);
  const now = new Date();
  const elapsed = session.elapsedSeconds + (session.status === 'RUNNING' && session.segmentStartedAt
    ? Math.max(0, Math.floor((now.getTime() - session.segmentStartedAt.getTime()) / 1000))
    : 0);
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.focusSession.updateMany({
      where: { id, userId, status: session.status },
      data: { status, elapsedSeconds: elapsed, segmentStartedAt: null, endedAt: now },
    });
    if (result.count === 0) throw stateError(session.status);
    await tx.user.updateMany({ where: { id: userId, activeFocusSessionId: id }, data: { activeFocusSessionId: null } });
    return tx.focusSession.findFirst({ where: { id, userId }, select: SELECT });
  });
  return present(updated, now);
}

module.exports = {
  SELECT,
  getOwned,
  get,
  getActive,
  create,
  list,
  pause,
  resume,
  complete: (userId, id) => finish(userId, id, 'COMPLETED'),
  cancel: (userId, id) => finish(userId, id, 'CANCELLED'),
};
