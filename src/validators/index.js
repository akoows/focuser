import { z } from "zod";
import { HttpError } from "../utils/apiResponse.js";
import { decodeCursor } from "../utils/cursor.js";
import { isDateKey } from "../utils/date.js";
import { HABIT_CATEGORIES } from "../services/habitCategoryService.js";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Identificador inválido.");
const dateKey = z.string().refine(isDateKey, "Data deve estar no formato YYYY-MM-DD.");
const email = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
const username = z.string().trim().toLowerCase().regex(/^[a-z0-9._]{3,30}$/, "Use de 3 a 30 letras, números, pontos ou sublinhados");
const bio = z.string().trim().max(500).nullable();
const password = z.string().min(8).max(128).refine(
    (value) => Buffer.byteLength(value, "utf8") <= 72,
    "A senha não pode exceder 72 bytes."
);
const timezone = z.string().min(1).max(100).refine((value) => {
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: value });
        return true;
    } catch {
        return false;
    }
}, "Fuso horário inválido.");
const dayOfWeek = z.number().int().min(0).max(6);
const appColorPreset = z.object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(32),
    color: z.string().regex(/^#[\da-f]{6}$/i, "Cor hexadecimal inválida."),
}).strict();

export const registerSchema = z.object({
    name: z.string().trim().min(1).max(80),
    username,
    email,
    password,
    timezone: timezone.optional(),
    avatarUploadId: objectId,
    avatarUrl: z.string().url().max(1000),
    bannerUploadId: objectId.optional(),
    bannerUrl: z.string().url().max(1000).optional(),
}).strict().refine((value) => Boolean(value.bannerUploadId) === Boolean(value.bannerUrl), {
    path: ["bannerUrl"],
    message: "O upload do banner está incompleto.",
});

export const loginSchema = z.object({
    email,
    password: z.string().min(1).max(128).refine(
        (value) => Buffer.byteLength(value, "utf8") <= 72,
        "A senha não pode exceder 72 bytes."
    ),
}).strict();

export const emailOnlySchema = z.object({ email }).strict();
export const emailCodeSchema = z.object({
    email,
    code: z.string().regex(/^\d{6}$/, "Código inválido."),
}).strict();

export const updateUserSchema = z.object({
    name: z.string().trim().min(1).max(80).optional(),
    username: username.nullable().optional(),
    bio: bio.optional(),
    timezone: timezone.optional(),
    accentColor: z.string().regex(/^#[\da-f]{6}$/i, "Cor hexadecimal inválida.").optional(),
    appAccentColor: z.string().regex(/^#[\da-f]{6}$/i, "Cor hexadecimal inválida.").optional(),
    appColorPresets: z.array(appColorPreset).max(30).optional(),
    avatarUrl: z.string().url().max(1000).nullable().optional(),
    bannerUrl: z.string().url().max(1000).nullable().optional(),
    currentBookId: objectId.nullable().optional(),
    favoriteBookId: objectId.nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Informe ao menos um campo.");

export const publicUsernameParamSchema = z.object({
    username,
}).strict();

export const readingFocusStartSchema = z.object({
    bookId: objectId,
    sessionId: z.string().uuid(),
}).strict();

export const readingFocusStopSchema = z.object({
    sessionId: z.string().uuid(),
}).strict();

export const friendRequestCreateSchema = z.object({
    username,
}).strict();

export const passwordChangeStartSchema = z.object({
    currentPassword: z.string().min(1).max(128),
    newPassword: password,
}).strict().refine((value) => value.currentPassword !== value.newPassword, {
    path: ["newPassword"],
    message: "A nova senha deve ser diferente da senha atual.",
});

export const passwordChangeVerifySchema = z.object({
    code: z.string().regex(/^\d{6}$/, "Código inválido."),
    newPassword: password,
}).strict();

export const goalCreateSchema = z.object({
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(500).nullable().optional(),
    category: z.string().trim().max(60).nullable().optional(),
    targetValue: z.number().finite().positive().max(1_000_000_000),
    currentValue: z.number().finite().min(0).max(1_000_000_000).default(0),
    unit: z.string().trim().min(1).max(30),
    period: z.enum(["DAILY", "WEEKLY", "MONTHLY", "CUSTOM"]).default("MONTHLY"),
}).strict();

export const goalUpdateSchema = z.object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    category: z.string().trim().max(60).nullable().optional(),
    targetValue: z.number().finite().positive().max(1_000_000_000).optional(),
    currentValue: z.number().finite().min(0).max(1_000_000_000).optional(),
    unit: z.string().trim().min(1).max(30).optional(),
    period: z.enum(["DAILY", "WEEKLY", "MONTHLY", "CUSTOM"]).optional(),
    isActive: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Informe ao menos um campo.");

export const goalProgressSchema = z.object({
    amount: z.number().finite().positive().max(1_000_000_000).default(1),
}).strict();

export const focusSessionCreateSchema = z.object({
    title: z.string().trim().min(1).max(120).default("Sessão de foco"),
    plannedMinutes: z.number().int().min(1).max(480).default(25),
    goalId: objectId.optional(),
}).strict();

export const readingBookCreateSchema = z.object({
    title: z.string().trim().min(1).max(160),
    author: z.string().trim().max(120).nullable().optional(),
    isbn: z.string().trim().max(20).nullable().optional(),
    coverId: z.number().int().positive().nullable().optional(),
    coverUrl: z.string().url().max(2048).refine((value) => value.startsWith("https://"),
        "A capa deve usar HTTPS.").nullable().optional(),
    totalPages: z.number().int().min(1).max(100_000),
    currentPage: z.number().int().min(0).max(100_000).default(0),
}).strict().refine((value) => value.currentPage <= value.totalPages, {
    path: ["currentPage"],
    message: "A página atual não pode exceder o total.",
});

export const readingBookUpdateSchema = z.object({
    title: z.string().trim().min(1).max(160).optional(),
    author: z.string().trim().max(120).nullable().optional(),
    isbn: z.string().trim().max(20).nullable().optional(),
    coverId: z.number().int().positive().nullable().optional(),
    coverUrl: z.string().url().max(2048).refine((value) => value.startsWith("https://"),
        "A capa deve usar HTTPS.").nullable().optional(),
    totalPages: z.number().int().min(1).max(100_000).optional(),
    currentPage: z.number().int().min(0).max(100_000).optional(),
    isActive: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Informe ao menos um campo.");

export const readingLogCreateSchema = z.object({
    pagesRead: z.number().int().min(1).max(10_000),
    minutesRead: z.number().int().min(1).max(1_440),
}).strict();

export const isbnLookupSchema = z.object({
    title: z.string().trim().min(1).max(160),
    author: z.string().trim().max(120).optional(),
    isbn: z.string().trim().max(20).optional(),
}).strict();

export const HABIT_UNITS = ["REPS", "ML", "MIN", "PAGES", "SESSIONS"];
export const HABIT_TIME_OF_DAY = ["ANYTIME", "MORNING", "AFTERNOON", "EVENING"];
const habitUnitSchema = z.enum(HABIT_UNITS);
const habitTimeOfDaySchema = z.enum(HABIT_TIME_OF_DAY);
// Recomendado para hábitos contáveis: ml, minutos, páginas giram mais que repetições.
const HABIT_UNIT_CAPS = { REPS: 100, ML: 10_000, MIN: 1_440, PAGES: 5_000, SESSIONS: 50 };
const HABIT_DEFAULT_CAP = 20;

export function habitTargetCap(value) {
    if (!value || value.unit === undefined) return HABIT_DEFAULT_CAP;
    return HABIT_UNIT_CAPS[value.unit] ?? HABIT_DEFAULT_CAP;
}

const habitTargetRefine = {
    message: "dailyTarget excede o limite da unidade escolhida.",
    path: ["dailyTarget"],
};

export const habitCreateSchema = z.object({
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(500).nullable().optional(),
    category: z.enum(HABIT_CATEGORIES).optional(),
    icon: z.enum(["TARGET", "BOOK", "DUMBBELL", "DROPLET", "BRAIN", "MOON", "HEART", "LEAF", "MUSIC", "CODE", "COFFEE", "SPARKLES"]).default("TARGET"),
    dailyTarget: z.number().int().min(1).max(HABIT_UNIT_CAPS.ML).default(1),
    step: z.number().int().min(1).max(HABIT_UNIT_CAPS.ML).default(1),
    color: z.string().regex(/^#[\da-f]{6}$/i).default("#c4b5fd"),
    frequency: z.enum(["DAILY", "CUSTOM"]).default("DAILY"),
    daysOfWeek: z.array(dayOfWeek).max(7).optional(),
    unit: habitUnitSchema.nullable().optional(),
    timeOfDay: habitTimeOfDaySchema.default("ANYTIME"),
}).strict().superRefine((value, context) => {
    if (value.frequency === "CUSTOM" && (!value.daysOfWeek || value.daysOfWeek.length === 0)) {
        context.addIssue({
            code: "custom",
            path: ["daysOfWeek"],
            message: "Informe ao menos um dia para frequência CUSTOM.",
        });
    }
    if (value.daysOfWeek && new Set(value.daysOfWeek).size !== value.daysOfWeek.length) {
        context.addIssue({ code: "custom", path: ["daysOfWeek"], message: "Dias duplicados." });
    }
    const cap = habitTargetCap(value);
    if (value.dailyTarget > cap) {
        context.addIssue({ code: "custom", ...habitTargetRefine });
    }
    if (value.step > cap || value.step > value.dailyTarget) {
        context.addIssue({ code: "custom", path: ["step"], message: "O passo deve caber na meta diária e no limite da unidade." });
    }
});

export const habitUpdateSchema = z.object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    icon: z.enum(["TARGET", "BOOK", "DUMBBELL", "DROPLET", "BRAIN", "MOON", "HEART", "LEAF", "MUSIC", "CODE", "COFFEE", "SPARKLES"]).optional(),
    dailyTarget: z.number().int().min(1).max(HABIT_UNIT_CAPS.ML).optional(),
    step: z.number().int().min(1).max(HABIT_UNIT_CAPS.ML).optional(),
    color: z.string().regex(/^#[\da-f]{6}$/i).optional(),
    frequency: z.enum(["DAILY", "CUSTOM"]).optional(),
    daysOfWeek: z.array(dayOfWeek).max(7).optional(),
    unit: habitUnitSchema.nullable().optional(),
    timeOfDay: habitTimeOfDaySchema.optional(),
    category: z.enum(HABIT_CATEGORIES).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Informe ao menos um campo.")
    .refine((value) => !value.daysOfWeek || new Set(value.daysOfWeek).size === value.daysOfWeek.length,
        "Dias da semana duplicados.")
    .refine((value) => value.dailyTarget === undefined || value.unit === undefined || value.dailyTarget <= habitTargetCap(value),
        habitTargetRefine)
    .refine((value) => value.step === undefined || value.unit === undefined || value.step <= habitTargetCap(value), {
        message: "step excede o limite da unidade.",
        path: ["step"],
    });

export const habitReorderSchema = z.object({
    orderedIds: z.array(objectId).min(1, 'Envie ao menos um identificador.').max(100, 'Limite de 100 hábitos excedido.'),
}).strict().refine((value) => new Set(value.orderedIds).size === value.orderedIds.length, {
    message: 'A lista de reordenação não pode conter identificadores duplicados.',
    path: ['orderedIds'],
});

export const archiveSchema = z.object({ archived: z.boolean().default(true) }).strict();
export const checkInCreateSchema = z.object({
    date: dateKey.optional(),
    amount: z.number().int().min(1).max(10_000).default(1),
}).strict();
export const checkInRemoveSchema = z.object({
    date: dateKey,
    amount: z.number().int().min(1).max(10_000).default(1),
}).strict();
export const periodQuerySchema = z.object({
    period: z.enum(["week", "month"]).optional(),
    from: dateKey.optional(),
    to: dateKey.optional(),
}).strict().refine((value) => (value.from && value.to) || (!value.from && !value.to),
    "Informe from e to juntos.");

export const aiAnalyzeSchema = z.object({
    period: z.enum(["week", "month"]).default("month"),
}).strict();

const repetitionTarget = z.string().trim().min(1).max(9)
    .regex(/^\d{1,4}(?:\s*-\s*\d{1,4})?$/, "Informe uma quantidade ou faixa de repetições.")
    .refine((value) => {
        const [minimum, maximum = minimum] = value.split("-").map((part) => Number(part.trim()));
        return minimum >= 1 && maximum <= 1_000 && minimum <= maximum;
    }, "A faixa de repetições deve estar entre 1 e 1.000 e em ordem crescente.");

const workoutExerciseSchema = z.object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(100),
    plannedSets: z.number().int().min(1).max(30).default(3),
    repTarget: repetitionTarget.default("8-12"),
    restSeconds: z.number().int().min(0).max(900).default(90),
}).strict();

export const workoutPlanSchema = z.object({
    name: z.string().trim().min(1).max(80),
    exercises: z.array(workoutExerciseSchema).max(50).default([]),
}).strict().superRefine((value, context) => {
    const ids = value.exercises.flatMap((exercise) => exercise.id ? [exercise.id] : []);
    if (new Set(ids).size !== ids.length) {
        context.addIssue({ code: "custom", path: ["exercises"], message: "Os exercícios não podem ter identificadores duplicados." });
    }
});

export const workoutStartSchema = z.object({
    planId: objectId.optional(),
}).strict();

export const workoutSessionExerciseSchema = z.object({
    name: z.string().trim().min(1).max(100),
    plannedSets: z.number().int().min(1).max(30).default(3),
    repTarget: repetitionTarget.default("8-12"),
    restSeconds: z.number().int().min(0).max(900).default(90),
}).strict();

export const exerciseImagesSchema = z.object({
    names: z.array(z.string().trim().min(1).max(100)).min(1).max(50),
}).strict();

export const workoutSetSchema = z.object({
    weight: z.number().finite().min(0).max(100_000),
    reps: z.number().int().min(1).max(1_000),
    completed: z.boolean().default(false),
}).strict();

export function parse(schema, value) {
    const result = schema.safeParse(value);
    if (!result.success) {
        throw new HttpError(400, "VALIDATION_ERROR", "Os dados enviados são inválidos.",
            result.error.issues.map(({ path, message }) => ({ path, message })));
    }
    return result.data;
}

export function parseObjectId(value) {
    const result = objectId.safeParse(value);
    if (!result.success) throw new HttpError(400, "VALIDATION_ERROR", "Identificador inválido.");
    return result.data;
}

export function parsePagination(query, { defaultLimit = 20, maxLimit = 100 } = {}) {
    const page = query.page === undefined ? 1 : Number(query.page);
    const limit = query.limit === undefined ? defaultLimit : Number(query.limit);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
        throw new HttpError(400, "VALIDATION_ERROR", "Paginação inválida.");
    }
    return { page, limit };
}

export function parseCursorPagination(query, { defaultLimit = 20, maxLimit = 50 } = {}) {
    const limit = query.limit === undefined ? defaultLimit : Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
        throw new HttpError(400, "VALIDATION_ERROR", "PaginaÃ§Ã£o invÃ¡lida.");
    }
    return { limit, after: query.cursor === undefined ? null : decodeCursor(query.cursor) };
}
