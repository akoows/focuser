'use strict';
// Schemas Zod. Todos usam .strict(): campos desconhecidos (userId, isActive, role, passwordHash...)
// são REJEITADOS com 400 — proteção contra mass assignment e manipulação de query strings.
const { z } = require('zod');
const { isValidDateKey, isValidTimeZone } = require('../utils/dates');
const { OBJECT_ID_REGEX } = require('../utils/constants');
const { normalizeIsbn, isValidIsbn } = require('../utils/isbn');

const objectId = z.string().regex(OBJECT_ID_REGEX, 'ID inválido');
const dateKey = z.string().refine(isValidDateKey, 'Data inválida (use YYYY-MM-DD)');
const timezone = z.string().max(64).refine(isValidTimeZone, 'Fuso horário inválido (use nome IANA, ex.: America/Sao_Paulo)');
const accentColor = z.string().regex(/^#[\da-f]{6}$/i, 'Cor inválida (use hexadecimal no formato #RRGGBB)');
const username = z.string().trim().toLowerCase().regex(/^[a-z0-9._]{3,30}$/, 'Use de 3 a 30 letras, números, pontos ou sublinhados').nullable();
const requiredUsername = z.string().trim().toLowerCase().regex(/^[a-z0-9._]{3,30}$/, 'Use de 3 a 30 letras, números, pontos ou sublinhados');
const email = z.string().trim().toLowerCase().email('E-mail inválido').max(254);
const name = z.string().trim().min(1, 'Nome obrigatório').max(80);
// bcrypt só considera os primeiros 72 BYTES: rejeitamos acima disso para não truncar silenciosamente.
const password = z.string().min(8, 'Senha deve ter ao menos 8 caracteres').max(128)
  .refine((p) => Buffer.byteLength(p, 'utf8') <= 72, 'Senha excede 72 bytes');

const days = z.array(z.number().int().min(0).max(6)).min(1).max(7)
  .refine((a) => new Set(a).size === a.length, 'daysOfWeek contém valores repetidos');
const frequency = z.enum(['DAILY', 'CUSTOM']);
const habitName = z.string().trim().min(1, 'Nome obrigatório').max(100);
const habitDescription = z.string().trim().max(500);
const goalName = z.string().trim().min(1, 'Nome obrigatório').max(100);
const goalDescription = z.string().trim().max(500);
const goalCategory = z.string().trim().min(1).max(60);
const goalUnit = z.string().trim().min(1).max(30);
const goalValue = z.number().finite().positive().max(1000000000);
const goalCurrentValue = z.number().finite().min(0).max(1000000000);
const focusTitle = z.string().trim().min(1, 'Título obrigatório').max(120);
const bookTitle = z.string().trim().min(1, 'Título obrigatório').max(160);
const bookAuthor = z.string().trim().min(1).max(120);
const isbn = z.string().trim().transform(normalizeIsbn)
  .refine(isValidIsbn, 'ISBN inválido (use um ISBN-10 ou ISBN-13 válido)');
const coverUrl = z.string().url().max(2000).refine((value) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && ['books.google.com', 'books.googleusercontent.com', 'covers.openlibrary.org'].includes(parsed.hostname);
  } catch {
    return false;
  }
}, 'URL de capa inválida');

const freqIssues = (v, ctx) => {
  if (v.frequency === 'DAILY' && v.daysOfWeek) ctx.addIssue({ code: 'custom', path: ['daysOfWeek'], message: 'daysOfWeek só é permitido quando frequency=CUSTOM' });
  if (v.frequency === 'CUSTOM' && !v.daysOfWeek) ctx.addIssue({ code: 'custom', path: ['daysOfWeek'], message: 'daysOfWeek é obrigatório quando frequency=CUSTOM' });
};

const page = z.coerce.number().int().min(1).max(10000).default(1);
const limit = z.coerce.number().int().min(1).max(100).default(20);

module.exports = {
  idParam: z.object({ id: objectId }).strict(),
  checkInParams: z.object({ id: objectId, checkInId: objectId }).strict(),

  register: z.object({
    name, username: requiredUsername, email, password, timezone: timezone.optional(),
    avatarUploadId: objectId, avatarUrl: z.string().url().max(1000),
    bannerUploadId: objectId.optional(), bannerUrl: z.string().url().max(1000).optional(),
  }).strict().refine((v) => Boolean(v.bannerUploadId) === Boolean(v.bannerUrl), {
    path: ['bannerUrl'],
    message: 'O upload do banner está incompleto.',
  }),
  publicUsernameParam: z.object({
    username: z.string().trim().toLowerCase().regex(/^[a-z0-9._]{3,30}$/, 'Nome de usuário inválido'),
  }).strict(),
  readingFocusStart: z.object({
    bookId: objectId,
    sessionId: z.string().uuid(),
  }).strict(),
  readingFocusStop: z.object({
    sessionId: z.string().uuid(),
  }).strict(),
  friendRequestCreate: z.object({ username: requiredUsername }).strict(),
  login: z.object({ email, password: z.string().min(1).max(128) }).strict(),
  emailOnly: z.object({ email }).strict(),
  emailCode: z.object({ email, code: z.string().regex(/^\d{6}$/, 'Código inválido') }).strict(),
  userUpdate: z.object({
    name: name.optional(),
    username: username.optional(),
    bio: z.string().trim().max(500).nullable().optional(),
    timezone: timezone.optional(),
    accentColor: accentColor.optional(),
    avatarUrl: z.string().url().max(1000).nullable().optional(),
    bannerUrl: z.string().url().max(1000).nullable().optional(),
    currentBookId: objectId.nullable().optional(),
    favoriteBookId: objectId.nullable().optional(),
  }).strict()
    .refine((v) => Object.keys(v).length > 0, 'Informe ao menos um campo'),
  passwordChangeStart: z.object({
    currentPassword: z.string().min(1).max(128),
    newPassword: password,
  }).strict().refine((v) => v.currentPassword !== v.newPassword, {
    path: ['newPassword'],
    message: 'A nova senha deve ser diferente da senha atual',
  }),
  passwordChangeVerify: z.object({ code: z.string().regex(/^\d{6}$/, 'Código inválido'), newPassword: password }).strict(),

  habitCreate: z.object({
    name: habitName, description: habitDescription.optional(),
    frequency: frequency.default('DAILY'), daysOfWeek: days.optional(),
  }).strict().superRefine(freqIssues),
  habitUpdate: z.object({
    name: habitName.optional(), description: habitDescription.nullable().optional(),
    frequency: frequency.optional(), daysOfWeek: days.optional(),
  }).strict().superRefine((v, ctx) => {
    if (Object.keys(v).length === 0) ctx.addIssue({ code: 'custom', message: 'Informe ao menos um campo' });
    if (v.frequency) freqIssues(v, ctx);
  }),
  habitArchive: z.object({ archived: z.boolean().optional() }).strict(),
  habitListQuery: z.object({ status: z.enum(['active', 'archived', 'all']).default('active'), page, limit }).strict(),

  goalCreate: z.object({
    name: goalName,
    description: goalDescription.optional(),
    category: goalCategory.optional(),
    targetValue: goalValue,
    currentValue: goalCurrentValue.default(0),
    unit: goalUnit,
    period: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM']).default('MONTHLY'),
  }).strict(),
  goalUpdate: z.object({
    name: goalName.optional(),
    description: goalDescription.nullable().optional(),
    category: goalCategory.nullable().optional(),
    targetValue: goalValue.optional(),
    currentValue: goalCurrentValue.optional(),
    unit: goalUnit.optional(),
    period: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM']).optional(),
    isActive: z.boolean().optional(),
  }).strict().refine((v) => Object.keys(v).length > 0, 'Informe ao menos um campo'),
  goalProgress: z.object({ amount: z.number().finite().positive().max(1000000000) }).strict(),
  goalListQuery: z.object({
    status: z.enum(['active', 'archived', 'all']).default('active'),
    page,
    limit,
  }).strict(),

  focusSessionCreate: z.object({
    title: focusTitle.default('Sessão de foco'),
    plannedMinutes: z.number().int().min(1).max(240).default(25),
    goalId: objectId.optional(),
  }).strict(),
  focusSessionListQuery: z.object({
    status: z.enum(['RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED']).optional(),
    page,
    limit,
  }).strict(),

  readingBookCreate: z.object({
    title: bookTitle,
    author: bookAuthor.optional(),
    isbn: isbn.optional(),
    coverId: z.number().int().positive().max(2147483647).nullable().optional(),
    coverUrl: coverUrl.nullable().optional(),
    totalPages: z.number().int().min(1).max(100000),
    currentPage: z.number().int().min(0).max(100000).default(0),
  }).strict().refine((value) => value.currentPage <= value.totalPages, {
    path: ['currentPage'],
    message: 'A página atual não pode ser maior que o total de páginas',
  }),
  readingBookUpdate: z.object({
    title: bookTitle.optional(),
    author: bookAuthor.nullable().optional(),
    isbn: isbn.nullable().optional(),
    coverId: z.number().int().positive().max(2147483647).nullable().optional(),
    coverUrl: coverUrl.nullable().optional(),
    totalPages: z.number().int().min(1).max(100000).optional(),
    currentPage: z.number().int().min(0).max(100000).optional(),
    isActive: z.boolean().optional(),
  }).strict().refine((value) => Object.keys(value).length > 0, 'Informe ao menos um campo'),
  readingBookListQuery: z.object({
    status: z.enum(['active', 'archived', 'all']).default('active'),
    page,
    limit,
  }).strict(),
  isbnLookup: z.object({
    title: bookTitle,
    author: bookAuthor.optional(),
  }).strict(),
  readingLogCreate: z.object({
    pagesRead: z.number().int().min(1).max(10000),
    minutesRead: z.number().int().min(1).max(1440),
  }).strict(),

  checkInCreate: z.object({ date: dateKey.optional() }).strict(),
  checkInListQuery: z.object({ from: dateKey.optional(), to: dateKey.optional(), page, limit }).strict(),

  dashboardQuery: z.object({ date: dateKey.optional() }).strict(),
  rangeQuery: z.object({ period: z.enum(['week', 'month']).optional(), from: dateKey.optional(), to: dateKey.optional() }).strict()
    .refine((v) => !(v.period && (v.from || v.to)), 'Use "period" OU "from"/"to", não ambos'),

  aiAnalyze: z.object({ period: z.enum(['week', 'month', 'quarter']).default('month') }).strict(),
};
