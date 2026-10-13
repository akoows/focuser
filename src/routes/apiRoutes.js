import { Router } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../lib/prisma.js";
import { AUTH_COOKIE, createAuthToken, optionalAuth, requireAuth } from "../middlewares/auth.js";
import { asyncHandler, HttpError, sendSuccess } from "../utils/apiResponse.js";
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
} from "../validators/index.js";

const router = Router();
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const MAX_HABITS_PER_USER = 100;
const MAX_BACKDATE_DAYS = 7;
const MAX_RANGE_DAYS = 366;

function publicUser(user) {
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        timezone: user.timezone,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
    };
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
    const passwordHash = await bcrypt.hash(input.password, 12);
    try {
        const user = await prisma.user.create({
            data: {
                name: input.name,
                email: input.email,
                passwordHash,
                timezone: input.timezone || "America/Sao_Paulo",
                tokenVersion: 0,
            },
        });
        return sendSuccess(res, { user: publicUser(user) }, 201);
    } catch (error) {
        if (error?.code === "P2002") {
            throw new HttpError(409, "EMAIL_IN_USE", "Este e-mail já está cadastrado.");
        }
        throw error;
    }
}));

router.post("/auth/login", asyncHandler(async (req, res) => {
    const input = parse(loginSchema, req.body);
    const user = await prisma.user.findUnique({ where: { email: input.email } });
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
    setAuthCookie(res, createAuthToken(user));
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

router.patch("/users/me", requireAuth, asyncHandler(async (req, res) => {
    const input = parse(updateUserSchema, req.body);
    const user = await prisma.user.update({ where: { id: req.user.id }, data: input });
    return sendSuccess(res, { user: publicUser(user) });
}));

router.post("/habits", requireAuth, asyncHandler(async (req, res) => {
    const input = parse(habitCreateSchema, req.body);
    const total = await prisma.habit.count({ where: { userId: req.user.id } });
    if (total >= MAX_HABITS_PER_USER) {
        throw new HttpError(422, "HABIT_LIMIT_REACHED", "O limite de 100 hábitos foi atingido.");
    }
    const today = dateKeyInTimezone(new Date(), req.user.timezone);
    const habit = await prisma.habit.create({
        data: {
            userId: req.user.id,
            name: input.name,
            description: input.description ?? null,
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
    const updated = await prisma.habit.update({
        where: { id: habit.id },
        data: {
            ...input,
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

export default router;
