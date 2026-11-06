import { Router } from "express";
import bcrypt from "bcrypt";
import crypto from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { AUTH_COOKIE, createAuthToken, optionalAuth, requireAuth } from "../middlewares/auth.js";
import { asyncHandler, HttpError, sendSuccess } from "../utils/apiResponse.js";
import productivityRouter from "./productivityRoutes.js";
import gymRouter from "./gymRoutes.js";
import { assertEmailConfigured, sendAuthCode } from "../services/emailService.js";
import { isAssetUrlInFolder, profileImageUploadSignature } from "../services/cloudinaryService.js";
import { createRegistrationUploadSignature } from "../services/profileUploadService.js";
import { categorizeHabit } from "../services/habitCategoryService.js";
import { analyzeHabitMetrics } from "../services/aiAnalysisService.js";
import { friendService } from "../services/friendService.js";
import {
    addDateKeyDays,
    dateKeyInTimezone,
    dateRange,
    daysBetween,
    isDateKey,
    isHabitScheduled,
    resolvePeriod,
} from "../utils/date.js";
import {
    archiveSchema,
    checkInCreateSchema,
    habitCreateSchema,
    habitUpdateSchema,
    parse,
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
} from "../validators/index.js";

const router = Router();
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const MAX_HABITS_PER_USER = 100;
const MAX_BACKDATE_DAYS = 7;
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
            loginCodeHash: createCodeHash(purpose, user.id, code),
            loginCodeExpiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS),
            loginCodeAttempts: 0,
        }
        : purpose === "password-change"
            ? {
                passwordChangeCodeHash: createCodeHash(purpose, user.id, code),
                passwordChangeCodeExpiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS),
                passwordChangeCodeAttempts: 0,
            }
            : {
                emailVerificationCodeHash: createCodeHash(purpose, user.id, code),
                emailVerificationExpiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS),
                emailVerificationAttempts: 0,
            };
    await prisma.user.update({ where: { id: user.id }, data: fields });
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

function setAuthCookie(res, token) {
    const sameSite = process.env.COOKIE_SAME_SITE || "none";
    const secure = sameSite === "none"
        || process.env.NODE_ENV === "production"
        || process.env.COOKIE_SECURE === "true";
    res.cookie(AUTH_COOKIE, token, {
        httpOnly: true,
        secure,
        sameSite,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: "/",
    });
}

function clearAuthCookie(res) {
    const sameSite = process.env.COOKIE_SAME_SITE || "none";
    res.clearCookie(AUTH_COOKIE, {
        httpOnly: true,
        secure: sameSite === "none"
            || process.env.NODE_ENV === "production"
            || process.env.COOKIE_SECURE === "true",
        sameSite,
        path: "/",
    });
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
        frequency: habit.frequency,
        daysOfWeek: habit.daysOfWeek,
        isActive: habit.isActive,
        startDateKey: habit.startDateKey,
        createdAt: habit.createdAt,
        updatedAt: habit.updatedAt,
    };
}

function mapCheckIn(checkIn) {
    return {
        id: checkIn.id,
        habitId: checkIn.habitId,
        dateKey: checkIn.dateKey,
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

function getStreakStats(habits, checkInSet, today) {
    const dateKeys = Array.from({ length: 365 }, (_, index) => addDateKeyDays(today, -index));
    let currentStreak = 0;
    let bestStreak = 0;
    let runningStreak = 0;
    let currentIsOpen = true;

    for (const dateKey of dateKeys) {
        const scheduled = habits.filter((habit) => isHabitScheduled(habit, dateKey));
        if (scheduled.length === 0) continue;
        const complete = scheduled.every((habit) => checkInSet.has(`${habit.id}:${dateKey}`));
        if (complete) {
            runningStreak += 1;
            bestStreak = Math.max(bestStreak, runningStreak);
            if (currentIsOpen) currentStreak += 1;
        } else {
            currentIsOpen = false;
            runningStreak = 0;
        }
    }
    return { currentStreak, bestStreak };
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
    const checkInSet = new Set(checkIns.map((item) => `${item.habitId}:${item.dateKey}`));
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
    const streaks = getStreakStats(
        habits,
        new Set((await prisma.checkIn.findMany({
            where: { userId: user.id, dateKey: { gte: addDateKeyDays(to, -364), lte: to } },
            select: { habitId: true, dateKey: true },
        })).map((item) => `${item.habitId}:${item.dateKey}`)),
        to
    );

    return { keys, habits, checkIns, checkInSet, series, scheduled, completed, streaks };
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
    const passwordHash = await bcrypt.hash(input.password, 12);
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
        const data = user.emailVerificationAttempts + 1 >= MAX_AUTH_CODE_ATTEMPTS
            ? { emailVerificationCodeHash: null, emailVerificationExpiresAt: null, emailVerificationAttempts: 0 }
            : { emailVerificationAttempts: { increment: 1 } };
        const changed = await prisma.user.updateMany({
            where: { id: user.id, emailVerificationCodeHash: user.emailVerificationCodeHash, emailVerifiedAt: null },
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
        const data = user.loginCodeAttempts + 1 >= MAX_AUTH_CODE_ATTEMPTS
            ? { loginCodeHash: null, loginCodeExpiresAt: null, loginCodeAttempts: 0 }
            : { loginCodeAttempts: { increment: 1 } };
        const changed = await prisma.user.updateMany({
            where: { id: user.id, loginCodeHash: user.loginCodeHash },
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
    return sendSuccess(res, await friendService.list(req.user.id));
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
    const username = req.params.username.trim().toLowerCase();
    if (!/^[a-z0-9._]{3,30}$/.test(username)) {
        throw new HttpError(400, "VALIDATION_ERROR", "Nome de usuário inválido.");
    }
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
            createdAt: true,
        },
    });
    if (!user || user.username?.startsWith("~unset:")) {
        throw new HttpError(404, "PUBLIC_PROFILE_NOT_FOUND", "Este perfil público não foi encontrado.");
    }
    const [currentBook, favoriteBook] = await Promise.all([
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
    ]);
    return sendSuccess(res, {
        profile: {
            id: user.id,
            name: user.name,
            username: user.username,
            bio: user.bio || null,
            avatarUrl: user.avatarUrl || null,
            bannerUrl: user.bannerUrl || null,
            accentColor: user.accentColor || "#ffffff",
            currentBook,
            favoriteBook,
            createdAt: user.createdAt,
        },
    });
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
        const data = user.passwordChangeCodeAttempts + 1 >= MAX_AUTH_CODE_ATTEMPTS
            ? { passwordChangeCodeHash: null, passwordChangeCodeExpiresAt: null, passwordChangeCodeAttempts: 0 }
            : { passwordChangeCodeAttempts: { increment: 1 } };
        const changed = await prisma.user.updateMany({
            where: { id: user.id, passwordChangeCodeHash: user.passwordChangeCodeHash },
            data,
        });
        if (!changed.count) throw invalid();
        throw invalid();
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
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

router.post("/habits", requireAuth, asyncHandler(async (req, res) => {
    const input = parse(habitCreateSchema, req.body);
    const total = await prisma.habit.count({ where: { userId: req.user.id } });
    if (total >= MAX_HABITS_PER_USER) {
        throw new HttpError(422, "HABIT_LIMIT_REACHED", "O limite de 100 hábitos foi atingido.");
    }
    const today = dateKeyInTimezone(new Date(), req.user.timezone);
    const category = await categorizeHabit(input.name, input.description);
    const habit = await prisma.habit.create({
        data: {
            userId: req.user.id,
            name: input.name,
            description: input.description ?? null,
            category,
            frequency: input.frequency,
            daysOfWeek: input.frequency === "DAILY" ? ALL_DAYS : input.daysOfWeek,
            startDateKey: today,
        },
    });
    return sendSuccess(res, { habit: mapHabit(habit) }, 201);
}));

router.get("/habits", requireAuth, asyncHandler(async (req, res) => {
    parseQueryObject(req.query, ["status", "page", "limit"]);
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
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * limit,
            take: limit,
        }),
        prisma.habit.count({ where }),
    ]);
    return sendSuccess(res, { items: items.map(mapHabit), pagination: paginationData(page, limit, total) });
}));

router.get("/habits/:id", requireAuth, asyncHandler(async (req, res) => {
    const habit = await findOwnedHabit(req.user.id, req.params.id);
    return sendSuccess(res, { habit: mapHabit(habit) });
}));

router.patch("/habits/:id", requireAuth, asyncHandler(async (req, res) => {
    const input = parse(habitUpdateSchema, req.body);
    const habit = await findOwnedHabit(req.user.id, req.params.id);
    const frequency = input.frequency ?? habit.frequency;
    const daysOfWeek = input.daysOfWeek ?? habit.daysOfWeek;
    if (input.daysOfWeek && frequency !== "CUSTOM") {
        throw new HttpError(400, "VALIDATION_ERROR", "daysOfWeek só pode ser alterado em frequência CUSTOM.");
    }
    if (frequency === "CUSTOM" && daysOfWeek.length === 0) {
        throw new HttpError(400, "VALIDATION_ERROR", "Informe ao menos um dia para frequência CUSTOM.");
    }
    const category = Object.hasOwn(input, "name") || Object.hasOwn(input, "description")
        ? await categorizeHabit(input.name ?? habit.name, input.description !== undefined ? input.description : habit.description)
        : habit.category;
    const updated = await prisma.habit.update({
        where: { id: habit.id },
        data: {
            ...input,
            category,
            frequency,
            daysOfWeek: frequency === "DAILY" ? ALL_DAYS : daysOfWeek,
        },
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
        throw new HttpError(422, "BEFORE_HABIT_START", "A data é anterior ao início do hábito.");
    }
    if (!isHabitScheduled(habit, dateKey)) {
        throw new HttpError(422, "NOT_SCHEDULED", "O hábito não está programado para esta data.");
    }
    try {
        const checkIn = await prisma.checkIn.create({
            data: {
                userId: req.user.id,
                habitId: habit.id,
                dateKey,
                completedAt: new Date(),
            },
        });
        return sendSuccess(res, { checkIn: mapCheckIn(checkIn) }, 201);
    } catch (error) {
        if (error?.code === "P2002") {
            throw new HttpError(409, "CHECKIN_ALREADY_EXISTS", "Este hábito já foi concluído nesta data.");
        }
        throw error;
    }
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
    return sendSuccess(res, { deleted: true });
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
    const checkIns = await prisma.checkIn.findMany({
        where: { userId: req.user.id, dateKey: { gte: start, lte: date } },
    });
    const checkInSet = new Set(checkIns.map((item) => `${item.habitId}:${item.dateKey}`));
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
    const habitStats = data.habits.map((habit) => {
        const scheduled = data.series.reduce(
            (total, item) => total + (isHabitScheduled(habit, item.date) ? 1 : 0), 0
        );
        const completedForHabit = data.checkInSet.size
            ? data.checkIns.filter((item) => item.habitId === habit.id).length
            : 0;
        return {
            id: habit.id,
            name: habit.name,
            scheduled,
            completed: completedForHabit,
            completionRate: scheduled ? completedForHabit / scheduled : 0,
            currentStreak: 0,
            bestStreak: 0,
        };
    });
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

router.post("/ai/analyze", requireAuth, asyncHandler(async (req, res) => {
    const { period } = parse(aiAnalyzeSchema, req.body);
    const days = period === "week" ? 7 : 30;
    const to = dateKeyInTimezone(new Date(), req.user.timezone);
    const from = addDateKeyDays(to, -(days - 1));
    const data = await loadUserProgress(req.user, from, to);
    if (data.scheduled === 0) {
        throw new HttpError(422, "INSUFFICIENT_DATA", "Não há hábitos programados no período para analisar.");
    }

    const habits = data.habits.map((habit) => {
        const scheduled = data.series.filter((day) => isHabitScheduled(habit, day.date)).length;
        const completed = data.checkIns.filter((checkIn) => checkIn.habitId === habit.id).length;
        return {
            name: String(habit.name).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 80),
            category: habit.category || null,
            frequency: habit.frequency,
            scheduled,
            completed,
            completionRate: scheduled ? completed / scheduled : null,
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
    const checkInDates = new Set(checkIns.map((item) => item.dateKey));
    const series = keys.map((date) => {
        const scheduled = isHabitScheduled(habit, date) ? 1 : 0;
        const completed = scheduled && checkInDates.has(date) ? 1 : 0;
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
        select: { habitId: true, dateKey: true },
    });
    const streaks = getStreakStats([habit],
        new Set(allCheckIns.map((item) => `${item.habitId}:${item.dateKey}`)), period.to);

    return sendSuccess(res, {
        habit: {
            id: habit.id,
            name: habit.name,
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
