import { z } from "zod";
import { HttpError } from "../utils/apiResponse.js";
import { isDateKey } from "../utils/date.js";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Identificador inválido.");
const dateKey = z.string().refine(isDateKey, "Data deve estar no formato YYYY-MM-DD.");
const email = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
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

export const registerSchema = z.object({
    name: z.string().trim().min(1).max(80),
    email,
    password,
    timezone: timezone.optional(),
}).strict();

export const loginSchema = z.object({
    email,
    password: z.string().min(1).max(128).refine(
        (value) => Buffer.byteLength(value, "utf8") <= 72,
        "A senha não pode exceder 72 bytes."
    ),
}).strict();

export const updateUserSchema = z.object({
    name: z.string().trim().min(1).max(80).optional(),
    timezone: timezone.optional(),
    accentColor: z.string().regex(/^#[\da-f]{6}$/i, "Cor hexadecimal inválida.").optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Informe ao menos um campo.");

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
}).strict();

export const habitCreateSchema = z.object({
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(500).nullable().optional(),
    frequency: z.enum(["DAILY", "CUSTOM"]).default("DAILY"),
    daysOfWeek: z.array(dayOfWeek).max(7).optional(),
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
});

export const habitUpdateSchema = z.object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    frequency: z.enum(["DAILY", "CUSTOM"]).optional(),
    daysOfWeek: z.array(dayOfWeek).max(7).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Informe ao menos um campo.")
    .refine((value) => !value.daysOfWeek || new Set(value.daysOfWeek).size === value.daysOfWeek.length,
        "Dias da semana duplicados.");

export const archiveSchema = z.object({ archived: z.boolean().default(true) }).strict();
export const checkInCreateSchema = z.object({ date: dateKey.optional() }).strict();
export const periodQuerySchema = z.object({
    period: z.enum(["week", "month"]).optional(),
    from: dateKey.optional(),
    to: dateKey.optional(),
}).strict().refine((value) => (value.from && value.to) || (!value.from && !value.to),
    "Informe from e to juntos.");

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
