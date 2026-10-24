import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { readIntegerSetting } from "../config/env.js";
import { AUTH_COOKIE, createAuthToken, optionalAuth, requireAuth } from "../middlewares/auth.js";
import { clearAuthCookie, setAuthCookie } from "../middlewares/authCookie.js";
import { userRateLimiters } from "../middlewares/rateLimiters.js";
import { asyncHandler, HttpError, sendSuccess } from "../utils/apiResponse.js";
import productivityRouter from "./productivityRoutes.js";
import gymRouter from "./gymRoutes.js";
import { assertEmailConfigured, sendAuthCode } from "../services/emailService.js";
import { isAssetUrlInFolder, profileImageUploadSignature } from "../services/cloudinaryService.js";
import { createRegistrationUploadSignature } from "../services/profileUploadService.js";
import { categorizeHabit } from "../services/habitCategoryService.js";
import { analyzeHabitMetrics } from "../services/aiAnalysisService.js";
import { friendService } from "../services/friendService.js";
import { compareAndSetHabitPatch, validateHabitPatch } from "../services/habitMutationService.js";
import { createWithinUserQuota } from "../services/userQuotaService.js";
import {
    getCheckInCounts,
    getCompletedCheckInSet,
    getHabitProgressStats,
    getNextCheckInOccurrence,
    getScheduledHabitTotals,
    getStreakStats,
    getStreakWindow,
    buildHabitHistorySeries,
    refreshHabitStreakSafely,
} from "../services/habitProgressService.js";
import {
    addDateKeyDays,
    dateKeyInTimezone,
    dateRange,
    daysBetween,
    isDateKey,
    isHabitScheduled,
    MAX_BACKDATE_DAYS,
    resolvePeriod,
    startOfWeek,
    weekdayForDateKey,
} from "../utils/date.js";
import {
    archiveSchema,
    checkInCreateSchema,
    checkInRemoveSchema,
    habitCreateSchema,
    habitReorderSchema,
    habitUpdateSchema,
    parse,
    parseCursorPagination,
    parseObjectId,
    parsePagination,
    periodQuerySchema,
    registerSchema,
    loginSchema,
    updateUserSchema,
    emailOnlySchema,
    emailCodeSchema,
    passwordChangeStartSchema,
    passwordChangeVerifySchema,
    aiAnalyzeSchema,
    friendRequestCreateSchema,
    publicUsernameParamSchema,
    readingFocusStartSchema,
    readingFocusStopSchema,
} from "../validators/index.js";

const router = Router();
const aiRateLimiter = userRateLimiters.aiPerHour;
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const MAX_HABITS_PER_USER = 100;
const MAX_RANGE_DAYS = 366;
const AUTH_CODE_TTL_MS = 10 * 60 * 1000;
const MAX_AUTH_CODE_ATTEMPTS = 5;

function publicUser(user) {
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        username: typeof user.username === "string" && !user.username.startsWith("~unset:") ? user.username : null,
        bio: user.bio || null,
        avatarUrl: user.avatarUrl || null,
        bannerUrl: user.bannerUrl || null,
        currentBookId: user.currentBookId || null,
        favoriteBookId: user.favoriteBookId || null,
        timezone: user.timezone,
        accentColor: user.accentColor || "#ffffff",
        appAccentColor: user.appAccentColor || "#ffffff",
        appColorPresets: user.appColorPresets || [],
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
    };
}

function localEmailAuthBypass(email) {
    return ["development", "test"].includes(process.env.NODE_ENV)
        && email.toLowerCase().endsWith("@focuser.dev");
}

function createCodeHash(purpose, userId, code) {
    const secret = process.env.JWT_SECRET;
    if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < 32) {
        throw new HttpError(500, "AUTH_NOT_CONFIGURED", "Configure JWT_SECRET com ao menos 32 bytes.");
    }
    return crypto.createHmac("sha256", secret).update(`${purpose}:${userId}:${code}`).digest("hex");
}

function matchesCode(purpose, userId, code, hash) {
    const actual = Buffer.from(createCodeHash(purpose, userId, code), "hex");
    const expected = Buffer.from(hash, "hex");
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function newCode() {
    return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

async function issueAuthCode(user, purpose) {
    const code = newCode();
    const fields = purpose === "login"
        ? {
            hash: "loginCodeHash",
            expiresAt: "loginCodeExpiresAt",
            attempts: "loginCodeAttempts",
        }
        : purpose === "password-change"
            ? {
                hash: "passwordChangeCodeHash",
                expiresAt: "passwordChangeCodeExpiresAt",
                attempts: "passwordChangeCodeAttempts",
            }
            : {
                hash: "emailVerificationCodeHash",
                expiresAt: "emailVerificationExpiresAt",
                attempts: "emailVerificationAttempts",
            };
    const current = await prisma.user.findUnique({
        where: { id: user.id },
        select: {
            [fields.hash]: true,
            [fields.expiresAt]: true,
            [fields.attempts]: true,
        },
    });
    const now = new Date();
    const challengeIsUnexpired = current?.[fields.expiresAt] > now;
    if (challengeIsUnexpired && current[fields.attempts] >= MAX_AUTH_CODE_ATTEMPTS) {
        throw new HttpError(429, "AUTH_CODE_ATTEMPTS_EXCEEDED", "O limite de tentativas foi atingido. Aguarde a expiração do código antes de solicitar outro.");
    }
    const codeData = purpose === "login"
        ? {
            loginCodeHash: createCodeHash(purpose, user.id, code),
            loginCodeExpiresAt: new Date(now.getTime() + AUTH_CODE_TTL_MS),
        }
        : purpose === "password-change"
            ? {
                passwordChangeCodeHash: createCodeHash(purpose, user.id, code),
                passwordChangeCodeExpiresAt: new Date(now.getTime() + AUTH_CODE_TTL_MS),
            }
            : {
                emailVerificationCodeHash: createCodeHash(purpose, user.id, code),
                emailVerificationExpiresAt: new Date(now.getTime() + AUTH_CODE_TTL_MS),
            };
    await prisma.user.update({
        where: { id: user.id },
        data: {
            ...codeData,
            ...(!challengeIsUnexpired ? { [fields.attempts]: 0 } : {}),
        },
    });
    await sendAuthCode({ to: user.email, code, purpose });
}

async function claimRegistrationUpload(tx, uploadId, imageUrl, type) {
    const upload = await tx.pendingProfileUpload.findUnique({ where: { id: uploadId } });
    const expectedFolder = upload?.folder;
    const typeFolder = type === "banner" ? "/banner" : "";
    const baseFolder = (process.env.CLOUDINARY_FOLDER || "focuser/avatars").replace(/\/+$/, "");
    const validFolder = expectedFolder === `${baseFolder}/registration/${uploadId}${typeFolder}`;
    if (!upload || upload.usedAt || upload.expiresAt <= new Date() || !validFolder
        || !isAssetUrlInFolder(imageUrl, expectedFolder)) {
        throw new HttpError(400, "PROFILE_IMAGE_UPLOAD_INVALID", "A imagem selecionada expirou ou não foi enviada pelo fluxo de cadastro. Selecione-a novamente.");
    }
    const claimed = await tx.pendingProfileUpload.updateMany({
        where: {
            id: uploadId,
            OR: [{ usedAt: null }, { usedAt: { isSet: false } }],
            expiresAt: { gt: new Date() },
            folder: expectedFolder,
        },
        data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) {
        throw new HttpError(400, "PROFILE_IMAGE_UPLOAD_INVALID", "A imagem selecionada expirou ou já foi usada em outro cadastro.");
    }
    return imageUrl;
}

function parseQueryObject(query, allowedKeys) {
    const keys = Object.keys(query);
    const unknown = keys.filter((key) => !allowedKeys.includes(key));
    if (unknown.length) {
        throw new HttpError(400, "VALIDATION_ERROR", "A consulta contém campos desconhecidos.", unknown);
    }
}

function paginationData(page, limit, total) {
    return { page, limit, total, totalPages: Math.ceil(total / limit) };
}

function mapHabit(habit) {
    return {
        id: habit.id,
        name: habit.name,
        description: habit.description,
        category: habit.category || null,
        icon: habit.icon || "TARGET",
        dailyTarget: habit.dailyTarget ?? 1,
        unit: habit.unit ?? null,
        timeOfDay: habit.timeOfDay === "ANY" ? "ANYTIME"
            : habit.timeOfDay === "NIGHT" ? "EVENING"
                : habit.timeOfDay ?? "ANYTIME",
        step: habit.step ?? 1,
        color: habit.color ?? "#c4b5fd",
        frequency: habit.frequency,
        daysOfWeek: habit.daysOfWeek,
        isActive: habit.isActive,
        position: habit.position ?? 0,
        startDateKey: habit.startDateKey,
        currentStreak: habit.currentStreak ?? 0,
        longestStreak: habit.longestStreak ?? 0,
        createdAt: habit.createdAt,
        updatedAt: habit.updatedAt,
    };
}

function mapCheckIn(checkIn) {
    return {
        id: checkIn.id,
        habitId: checkIn.habitId,
        dateKey: checkIn.dateKey,
        occurrence: checkIn.occurrence ?? 1,
        completedAt: checkIn.completedAt,
        createdAt: checkIn.createdAt,
    };
}

async function findOwnedHabit(userId, habitId) {
    const id = parseObjectId(habitId);
    const habit = await prisma.habit.findFirst({ where: { id, userId } });
    if (!habit) throw new HttpError(404, "HABIT_NOT_FOUND", "Hábito não encontrado.");
    return habit;
}

async function loadUserProgress(user, from, to, habitId) {
    const keys = dateRange(from, to, MAX_RANGE_DAYS);
    const habits = await prisma.habit.findMany({
        where: { userId: user.id, isActive: true, ...(habitId ? { id: habitId } : {}) },
    });
    const checkIns = await prisma.checkIn.findMany({
        where: {
            userId: user.id,
            dateKey: { gte: from, lte: to },
            ...(habitId ? { habitId } : {}),
        },
    });
    const checkInCounts = getCheckInCounts(checkIns);
    const checkInSet = getCompletedCheckInSet(habits, checkInCounts);
    const series = keys.map((date) => {
        const scheduledHabits = habits.filter((habit) => isHabitScheduled(habit, date));
        const completed = scheduledHabits.filter(
            (habit) => checkInSet.has(`${habit.id}:${date}`)
        ).length;
        return {
            date,
            scheduled: scheduledHabits.length,
            completed,
            completionRate: scheduledHabits.length ? completed / scheduledHabits.length : 0,
        };
    });
    const scheduled = series.reduce((total, day) => total + day.scheduled, 0);
    const completed = series.reduce((total, day) => total + day.completed, 0);
    const streakCheckIns = await prisma.checkIn.findMany({
            where: { userId: user.id, dateKey: { gte: addDateKeyDays(to, -364), lte: to } },
            select: { habitId: true, dateKey: true, occurrence: true },
        });
    const streakCheckInSet = getCompletedCheckInSet(habits, streakCheckIns);
    const streaks = getStreakStats(habits, streakCheckInSet, to);

    return { keys, habits, checkIns, checkInSet, streakCheckInSet, series, scheduled, completed, streaks };
}

router.get("/health", asyncHandler(async (_req, res) => {
    await prisma.$runCommandRaw({ ping: 1 });
    sendSuccess(res, { status: "ok" });
}));

router.post("/auth/register", asyncHandler(async (req, res) => {
    const input = parse(registerSchema, req.body);
    const existingEmail = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
    if (existingEmail) {
        throw new HttpError(409, "EMAIL_IN_USE", "Este e-mail já está cadastrado.");
    }
    if (await prisma.user.findUnique({ where: { username: input.username }, select: { id: true } })) {
        throw new HttpError(409, "USERNAME_IN_USE", "Este nome de usuário já está em uso.");
    }
    const skipEmailAuth = localEmailAuthBypass(input.email);
    if (!skipEmailAuth) assertEmailConfigured();
    const passwordHash = await bcrypt.hash(input.password, readIntegerSetting(process.env, "BCRYPT_COST", 12, { min: 4, max: 15 }));
    try {
        const user = await prisma.$transaction(async (tx) => {
            const avatarUrl = await claimRegistrationUpload(tx, input.avatarUploadId, input.avatarUrl, "avatar");
            const bannerUrl = input.bannerUploadId
                ? await claimRegistrationUpload(tx, input.bannerUploadId, input.bannerUrl, "banner")
                : null;
            return tx.user.create({
                data: {
                    name: input.name,
                    username: input.username,
                    email: input.email,
                    passwordHash,
                    avatarUrl,
                    bannerUrl,
                    timezone: input.timezone || "America/Sao_Paulo",
                    tokenVersion: 0,
                    accentColor: "#ffffff",
                    emailVerificationRequired: !skipEmailAuth,
                    ...(skipEmailAuth ? { emailVerifiedAt: new Date() } : {}),
                },
            });
        });
        if (!skipEmailAuth) await issueAuthCode(user, "email-verification");
        return sendSuccess(res, {
            user: publicUser(user),
            emailVerificationRequired: !skipEmailAuth,
        }, 201);
    } catch (error) {
        if (error instanceof HttpError) throw error;
        if (error?.code === "P2002") {
            const existingUsername = await prisma.user.findUnique({ where: { username: input.username }, select: { id: true } });
            if (existingUsername) throw new HttpError(409, "USERNAME_IN_USE", "Este nome de usuário já está em uso.");
            throw new HttpError(409, "EMAIL_IN_USE", "Este e-mail já está cadastrado.");
        }
        throw error;
    }
}));

router.post("/auth/login", asyncHandler(async (req, res) => {
    const input = parse(loginSchema, req.body);
    let user = await prisma.user.findUnique({ where: { email: input.email } });
    const hash = user?.passwordHash || user?.pass;
    const valid = hash ? await bcrypt.compare(input.password, hash) : false;
    if (!user || !valid) {
        throw new HttpError(401, "INVALID_CREDENTIALS", "E-mail ou senha inválidos.");
    }
    if (!user.passwordHash && user.pass) {
        await prisma.user.update({
            where: { id: user.id },
            data: { passwordHash: user.pass, pass: null },
        });
        user.passwordHash = user.pass;
        user.pass = null;
    }
    if (localEmailAuthBypass(user.email) && (user.emailVerificationRequired || !user.emailVerifiedAt)) {
        user = await prisma.user.update({
            where: { id: user.id },
            data: {
                emailVerifiedAt: new Date(),
                emailVerificationRequired: false,
                emailVerificationCodeHash: null,
                emailVerificationExpiresAt: null,
                emailVerificationAttempts: 0,
            },
        });
    }
    if (!localEmailAuthBypass(user.email)) {
        if (!user.emailVerifiedAt) {
            if (!user.emailVerificationRequired) {
                user = await prisma.user.update({
                    where: { id: user.id },
                    data: { emailVerificationRequired: true },
                });
            }
            await issueAuthCode(user, "email-verification");
            return sendSuccess(res, { emailVerificationRequired: true });
        }
        if (!user.emailVerificationRequired) {
            user = await prisma.user.update({
                where: { id: user.id },
                data: { emailVerificationRequired: true },
            });
        }
        await issueAuthCode(user, "login");
        return sendSuccess(res, { twoFactorRequired: true });
    }
    setAuthCookie(res, createAuthToken(user));
    return sendSuccess(res, { user: publicUser(user) });
}));

router.post("/auth/registration-avatar-signature", asyncHandler(async (_req, res) => {
    return sendSuccess(res, await createRegistrationUploadSignature("avatar"));
}));

router.post("/auth/registration-banner-signature", asyncHandler(async (_req, res) => {
    return sendSuccess(res, await createRegistrationUploadSignature("banner"));
}));

router.post("/auth/verify-email", asyncHandler(async (req, res) => {
    const { email, code } = parse(emailCodeSchema, req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    const invalid = () => new HttpError(400, "INVALID_OR_EXPIRED_CODE", "Código inválido ou expirado.");
    if (!user || user.emailVerifiedAt || !user.emailVerificationCodeHash
        || !user.emailVerificationExpiresAt || user.emailVerificationExpiresAt <= new Date()
        || user.emailVerificationAttempts >= MAX_AUTH_CODE_ATTEMPTS) {
        throw invalid();
    }
    if (!matchesCode("email-verification", user.id, code, user.emailVerificationCodeHash)) {
        const data = {
            ...(user.emailVerificationAttempts + 1 >= MAX_AUTH_CODE_ATTEMPTS
                ? { emailVerificationCodeHash: null }
                : {}),
            emailVerificationAttempts: { increment: 1 },
        };
        const changed = await prisma.user.updateMany({
            where: {
                id: user.id,
                emailVerificationCodeHash: user.emailVerificationCodeHash,
                emailVerifiedAt: null,
                emailVerificationAttempts: { lt: MAX_AUTH_CODE_ATTEMPTS },
            },
            data,
        });
        if (!changed.count) throw invalid();
        throw invalid();
    }
    const changed = await prisma.user.updateMany({
        where: {
            id: user.id,
            emailVerificationCodeHash: user.emailVerificationCodeHash,
            emailVerifiedAt: null,
            emailVerificationExpiresAt: { gt: new Date() },
        },
        data: {
            emailVerifiedAt: new Date(),
            emailVerificationRequired: true,
            emailVerificationCodeHash: null,
            emailVerificationExpiresAt: null,
            emailVerificationAttempts: 0,
        },
    });
    if (!changed.count) throw invalid();
    return sendSuccess(res, { verified: true });
}));

router.post("/auth/resend-verification", asyncHandler(async (req, res) => {
    const { email } = parse(emailOnlySchema, req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (user && !user.emailVerifiedAt && !localEmailAuthBypass(email)) {
        await issueAuthCode(user, "email-verification");
    }
    return sendSuccess(res, { message: "Se a conta existir e precisar de verificação, enviaremos um novo código." });
}));

router.post("/auth/verify-login", asyncHandler(async (req, res) => {
    const { email, code } = parse(emailCodeSchema, req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    const invalid = () => new HttpError(400, "INVALID_OR_EXPIRED_CODE", "Código inválido ou expirado.");
    if (!user || !user.emailVerifiedAt || !user.loginCodeHash
        || !user.loginCodeExpiresAt || user.loginCodeExpiresAt <= new Date()
        || user.loginCodeAttempts >= MAX_AUTH_CODE_ATTEMPTS) {
        throw invalid();
    }
    if (!matchesCode("login", user.id, code, user.loginCodeHash)) {
        const data = {
            ...(user.loginCodeAttempts + 1 >= MAX_AUTH_CODE_ATTEMPTS ? { loginCodeHash: null } : {}),
            loginCodeAttempts: { increment: 1 },
        };
        const changed = await prisma.user.updateMany({
            where: {
                id: user.id,
                loginCodeHash: user.loginCodeHash,
                loginCodeAttempts: { lt: MAX_AUTH_CODE_ATTEMPTS },
            },
            data,
        });
        if (!changed.count) throw invalid();
        throw invalid();
    }
    const token = createAuthToken(user);
    const changed = await prisma.user.updateMany({
        where: { id: user.id, loginCodeHash: user.loginCodeHash, loginCodeExpiresAt: { gt: new Date() } },
        data: { loginCodeHash: null, loginCodeExpiresAt: null, loginCodeAttempts: 0 },
    });
    if (!changed.count) throw invalid();
    setAuthCookie(res, token);
    return sendSuccess(res, { user: publicUser(user) });
}));

router.post("/auth/logout", asyncHandler(async (req, res) => {
    const user = await optionalAuth(req);
    if (user) {
        await prisma.user.update({
            where: { id: user.id },
            data: { tokenVersion: { increment: 1 } },
        });
    }
    clearAuthCookie(res);
    return sendSuccess(res, { message: "Sessão encerrada." });
}));

router.get("/auth/me", requireAuth, (req, res) => sendSuccess(res, { user: publicUser(req.user) }));
router.get("/users/me", requireAuth, (req, res) => sendSuccess(res, { user: publicUser(req.user) }));

router.get("/friends", requireAuth, asyncHandler(async (req, res) => {
    parseQueryObject(req.query, ["cursor", "limit"]);
    const pagination = parseCursorPagination(req.query, { defaultLimit: 20, maxLimit: 50 });
    return sendSuccess(res, await friendService.list(req.user.id, pagination));
}));

router.get("/friends/status/:username", requireAuth, asyncHandler(async (req, res) => {
    const { username } = parse(publicUsernameParamSchema, req.params);
    return sendSuccess(res, { relationship: await friendService.status(req.user.id, username) });
}));

router.post("/friends/requests", requireAuth, asyncHandler(async (req, res) => {
    const { username } = parse(friendRequestCreateSchema, req.body);
    return sendSuccess(res, { relationship: await friendService.sendRequest(req.user.id, username) }, 201);
}));

router.post("/friends/requests/:id/accept", requireAuth, asyncHandler(async (req, res) => {
    const requestId = parseObjectId(req.params.id);
    return sendSuccess(res, { relationship: await friendService.respondToRequest(req.user.id, requestId) });
}));

router.delete("/friends/requests/:id", requireAuth, asyncHandler(async (req, res) => {
    const requestId = parseObjectId(req.params.id);
    return sendSuccess(res, await friendService.removeRequest(req.user.id, requestId));
}));

router.delete("/friends/:id", requireAuth, asyncHandler(async (req, res) => {
    const friendId = parseObjectId(req.params.id);
    return sendSuccess(res, await friendService.removeFriend(req.user.id, friendId));
}));

router.get("/users/by-username/:username", asyncHandler(async (req, res) => {
    const { username } = parse(publicUsernameParamSchema, { username: req.params.username });
    const user = await prisma.user.findUnique({
        where: { username },
        select: {
            id: true,
            name: true,
            username: true,
            bio: true,
            avatarUrl: true,
            bannerUrl: true,
            currentBookId: true,
            favoriteBookId: true,
            accentColor: true,
            activeFocusSessionId: true,
            readingFocusBookId: true,
            readingFocusUpdatedAt: true,
            createdAt: true,
        },
    });
    if (!user || user.username?.startsWith("~unset:")) {
        throw new HttpError(404, "PUBLIC_PROFILE_NOT_FOUND", "Este perfil público não foi encontrado.");
    }
    const readingFocusBookIsFresh = user.readingFocusUpdatedAt
        && user.readingFocusUpdatedAt.getTime() >= Date.now() - 2 * 60 * 1000;
    const [profileBook, favoriteBook, activeFocusSession, readingFocusBook, readingLogs] = await Promise.all([
        user.currentBookId
            ? prisma.readingBook.findFirst({
                where: { id: user.currentBookId, userId: user.id, isActive: true },
                select: { id: true, title: true, author: true, coverId: true, coverUrl: true, currentPage: true, totalPages: true },
            })
            : null,
        user.favoriteBookId
            ? prisma.readingBook.findFirst({
                where: { id: user.favoriteBookId, userId: user.id },
                select: { id: true, title: true, author: true, coverId: true, coverUrl: true },
            })
            : null,
        user.activeFocusSessionId
            ? prisma.focusSession.findFirst({
                where: { id: user.activeFocusSessionId, userId: user.id },
                select: { status: true },
            })
            : null,
        user.readingFocusBookId && readingFocusBookIsFresh
            ? prisma.readingBook.findFirst({
                where: { id: user.readingFocusBookId, userId: user.id, isActive: true },
                select: { id: true, title: true, author: true, coverId: true, coverUrl: true, currentPage: true, totalPages: true },
            })
            : null,
        prisma.readingLog.findMany({
            where: { userId: user.id },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 20,
        }),
    ]);
    const historyBookIds = [...new Set(readingLogs.map((log) => log.bookId))];
    const historyBooks = historyBookIds.length
        ? await prisma.readingBook.findMany({
            where: { id: { in: historyBookIds }, userId: user.id },
            select: { id: true, title: true, author: true },
        })
        : [];
    const historyBooksById = new Map(historyBooks.map((book) => [book.id, book]));
    const readingHistory = readingLogs.flatMap((log) => {
        const book = historyBooksById.get(log.bookId);
        return book ? [{
            id: log.id,
            pagesRead: log.pagesRead,
            minutesRead: log.minutesRead,
            loggedAt: log.createdAt,
            book,
        }] : [];
    });
    return sendSuccess(res, {
        profile: {
            id: user.id,
            name: user.name,
            username: user.username,
            bio: user.bio || null,
            avatarUrl: user.avatarUrl || null,
            bannerUrl: user.bannerUrl || null,
            accentColor: user.accentColor || "#ffffff",
            status: activeFocusSession?.status === "RUNNING" || Boolean(readingFocusBook) ? "FOCUS" : null,
            currentBook: readingFocusBook || profileBook,
            favoriteBook,
            readingHistory,
            createdAt: user.createdAt,
        },
    });
}));

router.put("/users/me/reading-focus", requireAuth, asyncHandler(async (req, res) => {
    const { bookId, sessionId } = parse(readingFocusStartSchema, req.body);
    const book = await prisma.readingBook.findFirst({
        where: { id: bookId, userId: req.user.id, isActive: true },
        select: { id: true },
    });
    if (!book) {
        throw new HttpError(404, "READING_BOOK_NOT_FOUND", "O livro da sessão de foco não foi encontrado entre os livros ativos da sua conta.");
    }

    const now = new Date();
    const claimed = await prisma.user.updateMany({
        where: {
            id: req.user.id,
            OR: [
                { readingFocusSessionId: sessionId },
                { readingFocusUpdatedAt: null },
                { readingFocusUpdatedAt: { isSet: false } },
                { readingFocusUpdatedAt: { lt: new Date(now.getTime() - 2 * 60 * 1000) } },
            ],
        },
        data: {
            readingFocusBookId: book.id,
            readingFocusSessionId: sessionId,
            readingFocusUpdatedAt: now,
        },
    });
    if (claimed.count !== 1) {
        throw new HttpError(409, "READING_FOCUS_ALREADY_ACTIVE", "Já existe outra sessão de leitura em foco ativa nesta conta.");
    }
    return sendSuccess(res, { status: "FOCUS" });
}));

router.delete("/users/me/reading-focus", requireAuth, asyncHandler(async (req, res) => {
    const { sessionId } = parse(readingFocusStopSchema, req.body);
    await prisma.user.updateMany({
        where: { id: req.user.id, readingFocusSessionId: sessionId },
        data: {
            readingFocusBookId: null,
            readingFocusSessionId: null,
            readingFocusUpdatedAt: null,
        },
    });
    return sendSuccess(res, { cleared: true });
}));

router.patch("/users/me", requireAuth, asyncHandler(async (req, res) => {
    const input = parse(updateUserSchema, req.body);
    const baseFolder = (process.env.CLOUDINARY_FOLDER || "focuser/avatars").replace(/\/+$/, "");
    const validProfileImage = (url, type) => url === null || isAssetUrlInFolder(
        url,
        `${baseFolder}/${req.user.id}${type === "banner" ? "/banner" : ""}`,
    );
    if (Object.hasOwn(input, "avatarUrl") && !validProfileImage(input.avatarUrl, "avatar")) {
        throw new HttpError(400, "INVALID_AVATAR_URL", "O avatar precisa ser enviado para a pasta Cloudinary da sua conta.");
    }
    if (Object.hasOwn(input, "bannerUrl") && !validProfileImage(input.bannerUrl, "banner")) {
        throw new HttpError(400, "INVALID_BANNER_URL", "O banner precisa ser enviado para a pasta Cloudinary da sua conta.");
    }
    const bookChecks = [];
    if (input.currentBookId) {
        bookChecks.push(prisma.readingBook.findFirst({
            where: { id: input.currentBookId, userId: req.user.id, isActive: true },
            select: { id: true },
        }).then((book) => {
            if (!book) throw new HttpError(404, "CURRENT_BOOK_NOT_FOUND", "O livro em leitura não está entre os livros ativos da sua conta.");
        }));
    }
    if (input.favoriteBookId) {
        bookChecks.push(prisma.readingBook.findFirst({
            where: { id: input.favoriteBookId, userId: req.user.id },
            select: { id: true },
        }).then((book) => {
            if (!book) throw new HttpError(404, "FAVORITE_BOOK_NOT_FOUND", "O livro favorito não foi encontrado entre os livros da sua conta.");
        }));
    }
    await Promise.all(bookChecks);
    const data = Object.hasOwn(input, "username") && input.username === null
        ? { ...input, username: `~unset:${req.user.id}` }
        : input;
    let user;
    try {
        user = await prisma.user.update({ where: { id: req.user.id }, data });
    } catch (error) {
        if (error?.code === "P2002" && Object.hasOwn(input, "username")) {
            throw new HttpError(409, "USERNAME_IN_USE", "Este nome de usuário já está em uso.");
        }
        throw error;
    }
    return sendSuccess(res, { user: publicUser(user) });
}));

router.post("/users/me/avatar-signature", requireAuth, (req, res) => {
    return sendSuccess(res, profileImageUploadSignature(req.user.id, "avatar"));
});

router.post("/users/me/banner-signature", requireAuth, (req, res) => {
    return sendSuccess(res, profileImageUploadSignature(req.user.id, "banner"));
});

router.post("/users/me/password-change", requireAuth, asyncHandler(async (req, res) => {
    const input = parse(passwordChangeStartSchema, req.body);
    const hash = req.user.passwordHash || req.user.pass;
    if (!hash || !(await bcrypt.compare(input.currentPassword, hash))) {
        throw new HttpError(401, "INVALID_CREDENTIALS", "A senha atual está incorreta.");
    }
    if (await bcrypt.compare(input.newPassword, hash)) {
        throw new HttpError(400, "PASSWORD_UNCHANGED", "A nova senha deve ser diferente da senha atual.");
    }
    assertEmailConfigured();
    await issueAuthCode(req.user, "password-change");
    return sendSuccess(res, { message: "Enviamos um código para confirmar a alteração da senha." });
}));

router.post("/users/me/password-change/verify", requireAuth, asyncHandler(async (req, res) => {
    const { code, newPassword } = parse(passwordChangeVerifySchema, req.body);
    const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
            id: true,
            email: true,
            passwordChangeCodeHash: true,
            passwordChangeCodeExpiresAt: true,
            passwordChangeCodeAttempts: true,
        },
    });
    const invalid = () => new HttpError(400, "INVALID_OR_EXPIRED_CODE", "Código inválido ou expirado.");
    if (!user?.passwordChangeCodeHash || !user.passwordChangeCodeExpiresAt
        || user.passwordChangeCodeExpiresAt <= new Date()
        || user.passwordChangeCodeAttempts >= MAX_AUTH_CODE_ATTEMPTS) {
        throw invalid();
    }
    if (!matchesCode("password-change", user.id, code, user.passwordChangeCodeHash)) {
        const data = {
            ...(user.passwordChangeCodeAttempts + 1 >= MAX_AUTH_CODE_ATTEMPTS
                ? { passwordChangeCodeHash: null }
                : {}),
            passwordChangeCodeAttempts: { increment: 1 },
        };
        const changed = await prisma.user.updateMany({
            where: {
                id: user.id,
                passwordChangeCodeHash: user.passwordChangeCodeHash,
                passwordChangeCodeAttempts: { lt: MAX_AUTH_CODE_ATTEMPTS },
            },
            data,
        });
        if (!changed.count) throw invalid();
        throw invalid();
    }
    const passwordHash = await bcrypt.hash(newPassword, readIntegerSetting(process.env, "BCRYPT_COST", 12, { min: 4, max: 15 }));
    const changed = await prisma.user.updateMany({
        where: {
            id: user.id,
            passwordChangeCodeHash: user.passwordChangeCodeHash,
            passwordChangeCodeExpiresAt: { gt: new Date() },
            passwordChangeCodeAttempts: { lt: MAX_AUTH_CODE_ATTEMPTS },
        },
        data: {
            passwordHash,
            pass: null,
            tokenVersion: { increment: 1 },
            passwordChangeCodeHash: null,
            passwordChangeCodeExpiresAt: null,
            passwordChangeCodeAttempts: 0,
            loginCodeHash: null,
            loginCodeExpiresAt: null,
            loginCodeAttempts: 0,
        },
    });
    if (!changed.count) throw invalid();
    const refreshedUser = await prisma.user.findUnique({ where: { id: user.id } });
    setAuthCookie(res, createAuthToken(refreshedUser));
    return sendSuccess(res, { user: publicUser(refreshedUser) });
}));

router.post("/habits", requireAuth, aiRateLimiter, asyncHandler(async (req, res) => {
    const input = parse(habitCreateSchema, req.body);
    const total = await prisma.habit.count({ where: { userId: req.user.id } });
    if (total >= MAX_HABITS_PER_USER) {
        throw new HttpError(422, "HABIT_LIMIT_REACHED", "O limite de 100 hábitos foi atingido.");
    }
    const today = dateKeyInTimezone(new Date(), req.user.timezone);
    const category = input.category ?? await categorizeHabit(input.name, input.description);
    const habit = await createWithinUserQuota({
        prisma,
        userId: req.user.id,
        resource: "habit",
        limit: MAX_HABITS_PER_USER,
        errorCode: "HABIT_LIMIT_REACHED",
        errorMessage: "O limite de 100 hábitos foi atingido.",
        data: {
            name: input.name,
            description: input.description ?? null,
            icon: input.icon,
            dailyTarget: input.dailyTarget,
            step: input.step,
            color: input.color,
            unit: input.unit ?? null,
            timeOfDay: input.timeOfDay ?? null,
            category,
            position: total,
            frequency: input.frequency,
            daysOfWeek: input.frequency === "DAILY" ? ALL_DAYS : input.daysOfWeek,
            startDateKey: today,
        },
    });
    return sendSuccess(res, { habit: mapHabit(habit) }, 201);
}));

router.get("/habits", requireAuth, asyncHandler(async (req, res) => {
    parseQueryObject(req.query, ["status", "page", "limit", "date"]);
    const status = req.query.status ?? "active";
    if (!["active", "archived", "all"].includes(status)) {
        throw new HttpError(400, "VALIDATION_ERROR", "status deve ser active, archived ou all.");
    }
    const { page, limit } = parsePagination(req.query);
    const where = {
        userId: req.user.id,
        ...(status === "active" ? { isActive: true } : {}),
        ...(status === "archived" ? { isActive: false } : {}),
    };
    const [items, total] = await Promise.all([
        prisma.habit.findMany({
            where,
            orderBy: [{ position: "asc" }, { createdAt: "desc" }],
            skip: (page - 1) * limit,
            take: limit,
        }),
        prisma.habit.count({ where }),
    ]);
    let today = dateKeyInTimezone(new Date(), req.user.timezone);
    if (req.query.date !== undefined) {
        if (!isDateKey(req.query.date)) {
            throw new HttpError(400, "VALIDATION_ERROR", "date deve estar no formato YYYY-MM-DD.");
        }
        today = req.query.date;
    }
    const weekStart = startOfWeek(today);
    const weekEnd = addDateKeyDays(weekStart, 6);
    const checkIns = items.length
        ? await prisma.checkIn.findMany({
            where: {
                userId: req.user.id,
                habitId: { in: items.map((habit) => habit.id) },
                dateKey: { gte: weekStart, lte: weekEnd },
            },
            select: { habitId: true, dateKey: true, occurrence: true },
        })
        : [];
    const checkInCounts = getCheckInCounts(checkIns);
    const checkInSet = getCompletedCheckInSet(items, checkInCounts);
    const weekDates = dateRange(weekStart, weekEnd, 7);
    const weeklyHabits = items.map((habit) => ({
        ...mapHabit(habit),
        weeklyProgress: weekDates.map((date) => ({
            date,
            weekday: weekdayForDateKey(date),
            scheduled: isHabitScheduled(habit, date),
            checkInCount: checkInCounts.get(`${habit.id}:${date}`) ?? 0,
            value: checkInCounts.get(`${habit.id}:${date}`) ?? 0,
            dailyTarget: habit.dailyTarget ?? 1,
            completed: checkInSet.has(`${habit.id}:${date}`),
            isToday: date === today,
        })),
    }));
    return sendSuccess(res, { items: weeklyHabits, pagination: paginationData(page, limit, total) });
}));

router.get("/habits/:id", requireAuth, asyncHandler(async (req, res) => {
    const habit = await findOwnedHabit(req.user.id, req.params.id);
    return sendSuccess(res, { habit: mapHabit(habit) });
}));

router.patch("/habits/reorder", requireAuth, asyncHandler(async (req, res) => {
    const input = parse(habitReorderSchema, req.body);
    const existingHabits = await prisma.habit.findMany({
        where: {
            id: { in: input.orderedIds },
            userId: req.user.id,
        },
        select: { id: true },
    });

    if (existingHabits.length !== input.orderedIds.length) {
        throw new HttpError(404, "HABIT_NOT_FOUND", "Um ou mais hábitos informados não foram encontrados.");
    }

    await prisma.$transaction(
        input.orderedIds.map((id, index) =>
            prisma.habit.update({
                where: { id },
                data: { position: index },
            })
        )
    );

    return sendSuccess(res, { orderedIds: input.orderedIds, count: input.orderedIds.length });
}));

router.patch("/habits/:id", requireAuth, asyncHandler(async (req, res) => {
    const input = parse(habitUpdateSchema, req.body);
    const habit = await findOwnedHabit(req.user.id, req.params.id);
    validateHabitPatch(habit, input);
    let category;
    if (Object.hasOwn(input, "category")) {
        category = input.category;
    } else if (Object.hasOwn(input, "name") || Object.hasOwn(input, "description")) {
        category = await categorizeHabit(input.name ?? habit.name, input.description !== undefined ? input.description : habit.description);
    }
    const updated = await compareAndSetHabitPatch({
        habit,
        userId: req.user.id,
        input,
        category,
        updateMany: ({ where, data }) => prisma.habit.updateMany({ where, data }),
        findUpdated: () => prisma.habit.findFirst({ where: { id: habit.id, userId: req.user.id } }),
    });
    return sendSuccess(res, { habit: mapHabit(updated) });
}));

router.patch("/habits/:id/archive", requireAuth, asyncHandler(async (req, res) => {
    const input = parse(archiveSchema, req.body ?? {});
    const habit = await findOwnedHabit(req.user.id, req.params.id);
    const updated = await prisma.habit.update({
        where: { id: habit.id },
        data: { isActive: !input.archived },
    });
    return sendSuccess(res, { habit: mapHabit(updated) });
}));

router.delete("/habits/:id", requireAuth, asyncHandler(async (req, res) => {
    const habit = await findOwnedHabit(req.user.id, req.params.id);
    await prisma.$transaction([
        prisma.checkIn.deleteMany({ where: { userId: req.user.id, habitId: habit.id } }),
        prisma.habit.delete({ where: { id: habit.id } }),
    ]);
    return sendSuccess(res, { deleted: true });
}));

router.post("/habits/:id/check-ins", requireAuth, asyncHandler(async (req, res) => {
    const input = parse(checkInCreateSchema, req.body ?? {});
    const habit = await findOwnedHabit(req.user.id, req.params.id);
    if (!habit.isActive) throw new HttpError(409, "HABIT_ARCHIVED", "O hábito está arquivado.");
    const today = dateKeyInTimezone(new Date(), req.user.timezone);
    const dateKey = input.date ?? today;
    if (dateKey > today) throw new HttpError(422, "FUTURE_DATE", "Não é possível concluir uma data futura.");
    if (daysBetween(dateKey, today) - 1 > MAX_BACKDATE_DAYS) {
        throw new HttpError(422, "DATE_TOO_OLD", "Só é permitido registrar até 7 dias retroativos.");
    }
    if (dateKey < habit.startDateKey) {
        if (daysBetween(dateKey, habit.startDateKey) - 1 > MAX_BACKDATE_DAYS) {
            throw new HttpError(422, "BEFORE_HABIT_START", "Só é permitido registrar até 7 dias antes do início do hábito.");
        }
    }
    if (!isHabitScheduled(habit, dateKey)) {
        throw new HttpError(422, "NOT_SCHEDULED", "O hábito não está programado para esta data.");
    }
    const dailyTarget = habit.dailyTarget ?? 1;
    const amount = input.amount;
    for (let attempt = 0; attempt <= dailyTarget; attempt += 1) {
        const existingCheckIn = await prisma.checkIn.findFirst({
            where: { userId: req.user.id, habitId: habit.id, dateKey },
            select: { id: true, occurrence: true },
        });
        const completed = existingCheckIn?.occurrence ?? (existingCheckIn ? 1 : 0);
        const occurrence = getNextCheckInOccurrence(
            existingCheckIn ? [{ occurrence: completed }] : [],
            dailyTarget,
            amount
        );
        if (occurrence === null) {
            throw new HttpError(422, "DAILY_TARGET_EXCEEDED", `Você pode registrar no máximo ${dailyTarget - completed} conclusão(ões) agora.`);
        }

        if (existingCheckIn) {
            const updated = await prisma.checkIn.updateMany({
                where: {
                    id: existingCheckIn.id,
                    occurrence: existingCheckIn.occurrence,
                },
                data: { occurrence, completedAt: new Date() },
            });
            if (updated.count !== 1) continue;
        } else {
            try {
                const checkIn = await prisma.checkIn.create({
                    data: {
                        userId: req.user.id,
                        habitId: habit.id,
                        dateKey,
                        occurrence: amount,
                        completedAt: new Date(),
                    },
                });
                const streaks = await refreshHabitStreakSafely(habit, today);
                return sendSuccess(res, {
                    checkIn: mapCheckIn(checkIn),
                    progress: { value: amount, target: dailyTarget, completed: amount >= dailyTarget, targetReached: amount >= dailyTarget },
                    streaks,
                }, 201);
            } catch (error) {
                if (error?.code === "P2002") continue;
                throw error;
            }
        }

        const checkIn = await prisma.checkIn.findUnique({ where: { id: existingCheckIn.id } });
        if (!checkIn) {
            throw new HttpError(409, "CHECKIN_CONFLICT", "O registro foi alterado. Atualize e tente novamente.");
        }
        const streaks = await refreshHabitStreakSafely(habit, today);
        return sendSuccess(res, {
            checkIn: mapCheckIn(checkIn),
            progress: { value: occurrence, target: dailyTarget, completed: occurrence >= dailyTarget, targetReached: occurrence >= dailyTarget },
            streaks,
        }, 201);
    }
    throw new HttpError(409, "CHECKIN_CONFLICT", "Não foi possível registrar agora. Atualize e tente novamente.");
}));

router.patch("/habits/:id/check-ins", requireAuth, asyncHandler(async (req, res) => {
    const input = parse(checkInRemoveSchema, req.body ?? {});
    const habit = await findOwnedHabit(req.user.id, req.params.id);
    const today = dateKeyInTimezone(new Date(), req.user.timezone);
    if (input.date > today) throw new HttpError(422, "FUTURE_DATE", "Não é possível alterar uma data futura.");
    if (!isHabitScheduled(habit, input.date)) {
        throw new HttpError(422, "NOT_SCHEDULED", "O hábito não está programado para esta data.");
    }

    const checkIn = await prisma.checkIn.findFirst({
        where: { userId: req.user.id, habitId: habit.id, dateKey: input.date },
        select: { id: true, occurrence: true },
    });
    if (!checkIn) throw new HttpError(404, "CHECKIN_NOT_FOUND", "Não há conclusões registradas nesta data.");

    const completed = checkIn.occurrence ?? 1;
    if (input.amount > completed) {
        throw new HttpError(422, "CHECKIN_AMOUNT_EXCEEDED", `Você pode remover no máximo ${completed} conclusão(ões) desta data.`);
    }

    const remaining = completed - input.amount;
    const result = remaining === 0
        ? await prisma.checkIn.deleteMany({
            where: { id: checkIn.id, userId: req.user.id, habitId: habit.id, occurrence: checkIn.occurrence },
        })
        : await prisma.checkIn.updateMany({
            where: { id: checkIn.id, userId: req.user.id, habitId: habit.id, occurrence: checkIn.occurrence },
            data: { occurrence: remaining, completedAt: new Date() },
        });
    if (result.count !== 1) {
        throw new HttpError(409, "CHECKIN_CONFLICT", "O registro foi alterado. Atualize e tente novamente.");
    }

    const streaks = await refreshHabitStreakSafely(habit, today);
    return sendSuccess(res, {
        deleted: remaining === 0,
        progress: { value: remaining, target: habit.dailyTarget ?? 1, completed: remaining >= (habit.dailyTarget ?? 1), targetReached: remaining >= (habit.dailyTarget ?? 1) },
        streaks,
    });
}));

router.get("/habits/:id/history", requireAuth, asyncHandler(async (req, res) => {
    parseQueryObject(req.query, ["from", "to"]);
    if (!isDateKey(req.query.from) || !isDateKey(req.query.to) || req.query.from > req.query.to) {
        throw new HttpError(400, "VALIDATION_ERROR", "Informe um intervalo válido em from e to.");
    }
    const habit = await findOwnedHabit(req.user.id, req.params.id);
    const today = dateKeyInTimezone(new Date(), req.user.timezone);
    if (req.query.to > today) {
        throw new HttpError(400, "VALIDATION_ERROR", "O histórico não pode incluir datas futuras.");
    }
    const dates = dateRange(req.query.from, req.query.to, MAX_RANGE_DAYS);
    const checkIns = await prisma.checkIn.findMany({
        where: {
            userId: req.user.id,
            habitId: habit.id,
            dateKey: { gte: req.query.from, lte: req.query.to },
        },
        select: { dateKey: true, occurrence: true },
    });
    const values = new Map(checkIns.map((checkIn) => [checkIn.dateKey, checkIn.occurrence ?? 1]));
    return sendSuccess(res, {
        habitId: habit.id,
        from: req.query.from,
        to: req.query.to,
        series: buildHabitHistorySeries(habit, dates, values),
    });
}));

router.get("/habits/:id/check-ins", requireAuth, asyncHandler(async (req, res) => {
    parseQueryObject(req.query, ["from", "to", "page", "limit"]);
    const habit = await findOwnedHabit(req.user.id, req.params.id);
    const { page, limit } = parsePagination(req.query);
    if ((req.query.from && !isDateKey(req.query.from))
        || (req.query.to && !isDateKey(req.query.to))) {
        throw new HttpError(400, "VALIDATION_ERROR", "Datas devem estar no formato YYYY-MM-DD.");
    }
    const where = {
        userId: req.user.id,
        habitId: habit.id,
        ...(req.query.from || req.query.to ? {
            dateKey: {
                ...(req.query.from ? { gte: req.query.from } : {}),
                ...(req.query.to ? { lte: req.query.to } : {}),
            },
        } : {}),
    };
    const [items, total] = await Promise.all([
        prisma.checkIn.findMany({
            where,
            orderBy: { dateKey: "desc" },
            skip: (page - 1) * limit,
            take: limit,
        }),
        prisma.checkIn.count({ where }),
    ]);
    return sendSuccess(res, { items: items.map(mapCheckIn), pagination: paginationData(page, limit, total) });
}));

router.delete("/habits/:id/check-ins/:checkInId", requireAuth, asyncHandler(async (req, res) => {
    const habit = await findOwnedHabit(req.user.id, req.params.id);
    const checkInId = parseObjectId(req.params.checkInId);
    const result = await prisma.checkIn.deleteMany({
        where: { id: checkInId, habitId: habit.id, userId: req.user.id },
    });
    if (result.count === 0) throw new HttpError(404, "CHECKIN_NOT_FOUND", "Check-in não encontrado.");
    const today = dateKeyInTimezone(new Date(), req.user.timezone);
    const streaks = await refreshHabitStreakSafely(habit, today);
    return sendSuccess(res, { deleted: true, streaks });
}));

router.get("/check-ins/today", requireAuth, asyncHandler(async (req, res) => {
    const date = dateKeyInTimezone(new Date(), req.user.timezone);
    const items = await prisma.checkIn.findMany({
        where: { userId: req.user.id, dateKey: date },
        orderBy: { createdAt: "asc" },
    });
    return sendSuccess(res, { date, items: items.map(mapCheckIn) });
}));

router.get("/dashboard", requireAuth, asyncHandler(async (req, res) => {
    parseQueryObject(req.query, ["date"]);
    const today = dateKeyInTimezone(new Date(), req.user.timezone);
    const date = req.query.date ?? today;
    if (!isDateKey(date)) {
        throw new HttpError(400, "VALIDATION_ERROR", "date deve estar no formato YYYY-MM-DD.");
    }
    const habits = await prisma.habit.findMany({ where: { userId: req.user.id, isActive: true } });
    const start = addDateKeyDays(date, -6);
    const { from: streakStart } = getStreakWindow(date);
    const checkIns = await prisma.checkIn.findMany({
        where: { userId: req.user.id, dateKey: { gte: streakStart, lte: date } },
    });
    const checkInCounts = getCheckInCounts(checkIns);
    const checkInSet = getCompletedCheckInSet(habits, checkInCounts);
    const todaysHabits = habits.filter((habit) => isHabitScheduled(habit, date));
    const completed = todaysHabits.filter((habit) => checkInSet.has(`${habit.id}:${date}`)).length;
    const last7Days = dateRange(start, date, 7).map((dateKey) => {
        const scheduled = habits.filter((habit) => isHabitScheduled(habit, dateKey));
        const dayCompleted = scheduled.filter((habit) => checkInSet.has(`${habit.id}:${dateKey}`)).length;
        return { scheduled: scheduled.length, completed: dayCompleted };
    });
    const weeklyScheduled = last7Days.reduce((total, item) => total + item.scheduled, 0);
    const weeklyCompleted = last7Days.reduce((total, item) => total + item.completed, 0);
    const streaks = getStreakStats(habits, checkInSet, date);

    return sendSuccess(res, {
        date,
        totalActiveHabits: habits.length,
        scheduled: todaysHabits.length,
        completed,
        pending: todaysHabits.length - completed,
        completionRate: todaysHabits.length ? completed / todaysHabits.length : 0,
        habits: todaysHabits.map((habit) => ({
            id: habit.id,
            name: habit.name,
            icon: habit.icon || "TARGET",
            checkInCount: checkInCounts.get(`${habit.id}:${date}`) ?? 0,
            dailyTarget: habit.dailyTarget ?? 1,
            completed: checkInSet.has(`${habit.id}:${date}`),
        })),
        progress: {
            last7Days: {
                activeHabits: habits.length,
                scheduled: weeklyScheduled,
                completed: weeklyCompleted,
                completionRate: weeklyScheduled ? weeklyCompleted / weeklyScheduled : 0,
                pending: weeklyScheduled - weeklyCompleted,
            },
            currentStreak: streaks.currentStreak,
            bestStreak: streaks.bestStreak,
        },
    });
}));

router.get("/progress", requireAuth, asyncHandler(async (req, res) => {
    const query = parse(periodQuerySchema, req.query);
    const today = dateKeyInTimezone(new Date(), req.user.timezone);
    const period = resolvePeriod(query, today);
    const days = daysBetween(period.from, period.to);
    if (days > MAX_RANGE_DAYS) {
        throw new HttpError(422, "RANGE_TOO_LARGE", "O intervalo não pode exceder 366 dias.");
    }
    const data = await loadUserProgress(req.user, period.from, period.to);
    const todaySeries = data.series.find((item) => item.date === today);
    const habitStats = data.habits.map((habit) => ({
        id: habit.id,
        name: habit.name,
        ...getHabitProgressStats(
            habit,
            data.series,
            data.checkInSet,
            data.streakCheckInSet,
            period.to
        ),
    }));
    return sendSuccess(res, {
        period: { ...period, days },
        totals: {
            activeHabits: data.habits.length,
            scheduled: data.scheduled,
            completed: data.completed,
            completionRate: data.scheduled ? data.completed / data.scheduled : 0,
            pending: data.scheduled - data.completed,
        },
        today: todaySeries
            ? {
                scheduled: todaySeries.scheduled,
                completed: todaySeries.completed,
                pending: todaySeries.scheduled - todaySeries.completed,
                completionRate: todaySeries.completionRate,
            }
            : { scheduled: 0, completed: 0, pending: 0, completionRate: 0 },
        streaks: data.streaks,
        habits: habitStats,
    });
}));

router.get("/progress/history", requireAuth, asyncHandler(async (req, res) => {
    const query = parse(periodQuerySchema, req.query);
    const today = dateKeyInTimezone(new Date(), req.user.timezone);
    const period = resolvePeriod(query, today);
    const days = daysBetween(period.from, period.to);
    if (days > MAX_RANGE_DAYS) {
        throw new HttpError(422, "RANGE_TOO_LARGE", "O intervalo não pode exceder 366 dias.");
    }
    const data = await loadUserProgress(req.user, period.from, period.to);
    return sendSuccess(res, {
        period: { ...period, days },
        totals: {
            scheduled: data.scheduled,
            completed: data.completed,
            completionRate: data.scheduled ? data.completed / data.scheduled : 0,
        },
        series: data.series.map(({ date, scheduled, completed }) => ({ date, scheduled, completed })),
    });
}));

router.post("/ai/analyze", requireAuth, aiRateLimiter, asyncHandler(async (req, res) => {
    const { period } = parse(aiAnalyzeSchema, req.body);
    const days = period === "week" ? 7 : 30;
    const to = dateKeyInTimezone(new Date(), req.user.timezone);
    const from = addDateKeyDays(to, -(days - 1));
    const data = await loadUserProgress(req.user, from, to);
    if (data.scheduled === 0) {
        throw new HttpError(422, "INSUFFICIENT_DATA", "Não há hábitos programados no período para analisar.");
    }

    const habits = data.habits.map((habit) => {
        const { scheduled, completed, completionRate } = getScheduledHabitTotals(
            habit,
            data.series,
            data.checkInSet
        );
        return {
            name: String(habit.name).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 80),
            category: habit.category || null,
            frequency: habit.frequency,
            scheduled,
            completed,
            completionRate: scheduled ? completionRate : null,
        };
    });
    const weekdays = Array.from({ length: 7 }, (_, weekday) => {
        const dates = data.series.filter((day) => new Date(`${day.date}T00:00:00Z`).getUTCDay() === weekday);
        const scheduled = dates.reduce((sum, day) => sum + day.scheduled, 0);
        const completed = dates.reduce((sum, day) => sum + day.completed, 0);
        return {
            weekday: ["dom", "seg", "ter", "qua", "qui", "sex", "sab"][weekday],
            scheduled,
            completed,
            completionRate: scheduled ? completed / scheduled : null,
        };
    });
    const metrics = {
        period: { from, to, days, type: period },
        totals: {
            activeHabits: data.habits.length,
            scheduled: data.scheduled,
            completed: data.completed,
            pending: data.scheduled - data.completed,
            completionRate: data.completed / data.scheduled,
        },
        streaks: { current: data.streaks.currentStreak, best: data.streaks.bestStreak },
        habits,
        weekdays,
    };
    const analysis = await analyzeHabitMetrics(metrics);
    return sendSuccess(res, {
        period: metrics.period,
        metrics: { totals: metrics.totals, streaks: metrics.streaks },
        ...analysis,
        generatedAt: new Date().toISOString(),
    });
}));

router.get("/habits/:id/progress", requireAuth, asyncHandler(async (req, res) => {
    const habit = await findOwnedHabit(req.user.id, req.params.id);
    const query = parse(periodQuerySchema, req.query);
    const today = dateKeyInTimezone(new Date(), req.user.timezone);
    const period = resolvePeriod(query, today);
    const days = daysBetween(period.from, period.to);
    if (days > MAX_RANGE_DAYS) {
        throw new HttpError(422, "RANGE_TOO_LARGE", "O intervalo não pode exceder 366 dias.");
    }
    const keys = dateRange(period.from, period.to, MAX_RANGE_DAYS);
    const checkIns = await prisma.checkIn.findMany({
        where: { userId: req.user.id, habitId: habit.id, dateKey: { gte: period.from, lte: period.to } },
    });
    const checkInCounts = getCheckInCounts(checkIns);
    const dailyTarget = habit.dailyTarget ?? 1;
    const series = keys.map((date) => {
        const scheduled = isHabitScheduled(habit, date) ? 1 : 0;
        const completed = scheduled
            && (checkInCounts.get(`${habit.id}:${date}`) ?? 0) >= dailyTarget ? 1 : 0;
        return { date, scheduled, completed, completionRate: scheduled ? completed : 0 };
    });
    const scheduled = series.reduce((total, item) => total + item.scheduled, 0);
    const completed = series.reduce((total, item) => total + item.completed, 0);
    const allCheckIns = await prisma.checkIn.findMany({
        where: {
            userId: req.user.id,
            habitId: habit.id,
            dateKey: { gte: addDateKeyDays(period.to, -364), lte: period.to },
        },
        select: { habitId: true, dateKey: true, occurrence: true },
    });
    const streaks = getStreakStats([habit],
        getCompletedCheckInSet([habit], allCheckIns), period.to);

    return sendSuccess(res, {
        habit: {
            id: habit.id,
            name: habit.name,
            dailyTarget,
            frequency: habit.frequency,
            daysOfWeek: habit.daysOfWeek,
            isActive: habit.isActive,
        },
        period: { ...period, days },
        scheduled,
        completed,
        completionRate: scheduled ? completed / scheduled : 0,
        ...streaks,
        series,
    });
}));

router.use(productivityRouter);
router.use(gymRouter);

export default router;
