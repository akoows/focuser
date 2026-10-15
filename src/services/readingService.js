'use strict';
const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const { dateKeyFromInstant } = require('../utils/dates');
const { MAX_READING_BOOKS_PER_USER } = require('../utils/constants');

const BOOK_SELECT = {
  id: true, title: true, author: true, isbn: true, coverId: true, coverUrl: true, totalPages: true,
  currentPage: true, isActive: true, createdAt: true, updatedAt: true,
};
const LOG_SELECT = {
  id: true, bookId: true, pagesRead: true, minutesRead: true, dateKey: true, loggedAt: true,
};
const notFound = () => new AppError(404, 'READING_BOOK_NOT_FOUND', 'Livro não encontrado.');

async function getOwnedBook(userId, id) {
  const book = await prisma.readingBook.findFirst({ where: { id, userId }, select: BOOK_SELECT });
  if (!book) throw notFound();
  return book;
}

async function createBook(userId, input) {
  const count = await prisma.readingBook.count({ where: { userId } });
  if (count >= MAX_READING_BOOKS_PER_USER) {
    throw new AppError(422, 'READING_BOOK_LIMIT_REACHED', `Limite de ${MAX_READING_BOOKS_PER_USER} livros atingido.`);
  }
  return prisma.readingBook.create({
    data: {
      userId,
      title: input.title,
      author: input.author || null,
      isbn: input.isbn || null,
      coverId: input.coverId || null,
      coverUrl: input.coverUrl || null,
      totalPages: input.totalPages,
      currentPage: input.currentPage,
    },
    select: BOOK_SELECT,
  });
}

async function listBooks(userId, { status, page, limit }) {
  const where = { userId, ...(status === 'active' ? { isActive: true } : status === 'archived' ? { isActive: false } : {}) };
  const [items, total] = await Promise.all([
    prisma.readingBook.findMany({ where, select: BOOK_SELECT, orderBy: { updatedAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
    prisma.readingBook.count({ where }),
  ]);
  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

async function updateBook(userId, id, input) {
  const book = await getOwnedBook(userId, id);
  const nextTotal = input.totalPages ?? book.totalPages;
  const nextCurrent = input.currentPage ?? book.currentPage;
  if (nextCurrent > nextTotal) throw new AppError(422, 'INVALID_BOOK_PAGE', 'A página atual não pode ser maior que o total de páginas.');
  const data = { ...input };
  if (input.author !== undefined) data.author = input.author || null;
  if (input.isbn !== undefined) data.isbn = input.isbn || null;
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.readingBook.updateMany({ where: { id, userId }, data });
    if (result.count !== 1) return result;
    if (input.isActive === false) {
      await tx.user.updateMany({
        where: { id: userId, currentBookId: id },
        data: { currentBookId: null },
      });
    }
    return result;
  });
  if (updated.count === 0) throw notFound();
  return getOwnedBook(userId, id);
}

async function addReadingLog(user, bookId, input) {
  const now = new Date();
  const dateKey = dateKeyFromInstant(now, user.timezone);
  return prisma.$transaction(async (tx) => {
    const book = await tx.readingBook.findFirst({ where: { id: bookId, userId: user.id }, select: BOOK_SELECT });
    if (!book) throw notFound();
    if (!book.isActive) throw new AppError(409, 'READING_BOOK_ARCHIVED', 'Reative o livro antes de registrar uma leitura.');
    const remaining = book.totalPages - book.currentPage;
    if (input.pagesRead > remaining) {
      throw new AppError(422, 'PAGES_EXCEED_BOOK', `Restam ${remaining} páginas para concluir este livro.`);
    }
    const updated = await tx.readingBook.updateMany({
      where: { id: bookId, userId: user.id, isActive: true, currentPage: book.currentPage },
      data: { currentPage: { increment: input.pagesRead } },
    });
    if (updated.count !== 1) throw new AppError(409, 'READING_BOOK_CHANGED', 'O progresso do livro foi alterado. Atualize e tente novamente.');
    const log = await tx.readingLog.create({
      data: { userId: user.id, bookId, pagesRead: input.pagesRead, minutesRead: input.minutesRead, dateKey, loggedAt: now },
      select: LOG_SELECT,
    });
    return { log, book: await tx.readingBook.findFirst({ where: { id: bookId, userId: user.id }, select: BOOK_SELECT }) };
  });
}

async function today(user) {
  const date = dateKeyFromInstant(new Date(), user.timezone);
  const logs = await prisma.readingLog.findMany({
    where: { userId: user.id, dateKey: date },
    select: {
      ...LOG_SELECT,
      book: { select: { id: true, title: true, author: true, isbn: true } },
    },
    orderBy: { loggedAt: 'desc' },
    take: 100,
  });
  return {
    date,
    totalPages: logs.reduce((sum, log) => sum + log.pagesRead, 0),
    totalMinutes: logs.reduce((sum, log) => sum + log.minutesRead, 0),
    items: logs,
  };
}

async function recentFeed(userId) {
  const friendships = await prisma.friendship.findMany({
    where: {
      status: 'ACCEPTED',
      OR: [{ requesterId: userId }, { addresseeId: userId }],
    },
    select: { requesterId: true, addresseeId: true },
  });
  const readerIds = new Set([userId]);
  for (const friendship of friendships) {
    readerIds.add(friendship.requesterId);
    readerIds.add(friendship.addresseeId);
  }

  return prisma.readingLog.findMany({
    where: { userId: { in: [...readerIds] } },
    select: {
      id: true,
      pagesRead: true,
      minutesRead: true,
      loggedAt: true,
      book: { select: { id: true, title: true, author: true, coverId: true, coverUrl: true } },
      user: { select: { id: true, name: true, username: true, avatarUrl: true } },
    },
    orderBy: { loggedAt: 'desc' },
    take: 50,
  });
}

async function removeBook(userId, id) {
  await prisma.$transaction(async (tx) => {
    const book = await tx.readingBook.findFirst({ where: { id, userId }, select: { id: true } });
    if (!book) throw notFound();
    await tx.user.updateMany({
      where: { id: userId, currentBookId: id },
      data: { currentBookId: null },
    });
    await tx.user.updateMany({
      where: { id: userId, favoriteBookId: id },
      data: { favoriteBookId: null },
    });
    const result = await tx.readingBook.deleteMany({ where: { id: book.id, userId } });
    if (result.count !== 1) throw notFound();
  });
}

module.exports = { getOwnedBook, createBook, listBooks, updateBook, addReadingLog, today, recentFeed, removeBook };
