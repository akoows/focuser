import { randomBytes, randomUUID } from "node:crypto";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middlewares/auth.js";
import {
    exerciseImagesSchema,
    workoutPlanSchema,
    workoutSessionExerciseSchema,
    workoutSetSchema,
    workoutStartSchema,
    parse,
    parseObjectId,
    parsePagination,
} from "../validators/index.js";
import { asyncHandler, HttpError, sendSuccess } from "../utils/apiResponse.js";
import { addDateKeyDays, dateKeyInTimezone, isDateKey } from "../utils/date.js";
import { calculateWorkoutStats } from "../services/workoutStatsService.js";
import { buildWorkoutCalendarQuery } from "../services/workoutCalendarService.js";
import { buildWorkoutEndUpdate } from "../services/workoutSessionStateService.js";
import { lookupExerciseImages } from "../services/exerciseImageService.js";
import { userRateLimiters } from "../middlewares/rateLimiters.js";
import { createWithinUserQuota } from "../services/userQuotaService.js";

const router = Router();
const MAX_PLANS_PER_USER = 100;
const MAX_STATS_SESSIONS = 500;
const STATS_DAYS = 365;
const exerciseImagesRateLimiter = userRateLimiters.exerciseImagesPerHour;
const FREE_WORKOUT_POINTER = {
    OR: [
        { activeWorkoutSessionId: null },
        { activeWorkoutSessionId: { isSet: false } },
    ],
};

router.post("/gym/exercise-images", requireAuth, exerciseImagesRateLimiter, asyncHandler(async (req, res) => {
    const { names } = parse(exerciseImagesSchema, req.body);
    const items = await lookupExerciseImages(names);
    return sendSuccess(res, { items });
}));

function rejectUnknownQuery(query, allowed) {
    const unknown = Object.keys(query).filter((key) => !allowed.includes(key));
    if (unknown.length) {
        throw new HttpError(400, "VALIDATION_ERROR", "A consulta contém campos desconhecidos.", unknown);
    }
}

function requireEmptyBody(body) {
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length) {
        throw new HttpError(400, "VALIDATION_ERROR", "Esta operação não aceita campos adicionais.");
    }
}

function normalizePlanExercises(exercises) {
    return exercises.map((exercise, order) => ({
        id: exercise.id || randomUUID(),
        name: exercise.name,
        order,
        plannedSets: exercise.plannedSets,
        repTarget: exercise.repTarget,
        restSeconds: exercise.restSeconds,
    }));
}

function createSessionExercise(exercise, order, planExerciseId = null) {
    return {
        id: randomUUID(),
        planExerciseId,
        name: exercise.name,
        order,
        plannedSets: exercise.plannedSets,
        repTarget: exercise.repTarget,
        restSeconds: exercise.restSeconds,
        sets: Array.from({ length: exercise.plannedSets }, (_, index) => ({
            id: randomUUID(),
            setNumber: index + 1,
            weight: null,
            reps: null,
            completed: false,
            completedAt: null,
        })),
    };
}

function mapPlan(plan) {
    return {
        id: plan.id,
        name: plan.name,
        exercises: plan.exercises,
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt,
    };
}

function mapSession(session, previousByExercise = new Map()) {
    return {
        id: session.id,
        planId: session.planId,
        planName: session.planName,
        status: session.status,
        startedAt: session.startedAt,
        completedAt: session.completedAt,
        abandonedAt: session.abandonedAt,
        durationSeconds: session.completedAt
            ? Math.max(0, Math.floor((session.completedAt.getTime() - session.startedAt.getTime()) / 1000))
            : null,
        exercises: session.exercises,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        ...(previousByExercise.size ? { previousByExercise: Object.fromEntries(previousByExercise) } : {}),
    };
}

async function findOwnedPlan(userId, planId) {
    const id = parseObjectId(planId);
    const plan = await prisma.workoutPlan.findFirst({ where: { id, userId } });
    if (!plan) throw new HttpError(404, "WORKOUT_PLAN_NOT_FOUND", "Ficha de treino não encontrada.");
    return plan;
}

async function findOwnedSession(userId, sessionId) {
    const id = parseObjectId(sessionId);
    const session = await prisma.workoutSession.findFirst({ where: { id, userId } });
    if (!session) throw new HttpError(404, "WORKOUT_SESSION_NOT_FOUND", "Sessão de treino não encontrada.");
    return session;
}

async function findActiveWorkoutSession(userId) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { activeWorkoutSessionId: true },
    });
    if (!user) return null;

    const activeSession = await prisma.workoutSession.findFirst({
        where: { userId, status: "IN_PROGRESS" },
        orderBy: { startedAt: "desc" },
    });
    if (activeSession) {
        if (user.activeWorkoutSessionId !== activeSession.id) {
            await prisma.user.updateMany({
                where: { id: userId, activeWorkoutSessionId: user.activeWorkoutSessionId },
                data: { activeWorkoutSessionId: activeSession.id },
            });
        }
        return activeSession;
    }

    if (user.activeWorkoutSessionId) {
        await prisma.user.updateMany({
            where: { id: userId, activeWorkoutSessionId: user.activeWorkoutSessionId },
            data: { activeWorkoutSessionId: null },
        });
    }
    return null;
}

async function withPreviousValues(userId, session) {
    const exerciseNames = new Set(session.exercises.map((exercise) => exercise.name.toLocaleLowerCase()));
    if (!exerciseNames.size) return mapSession(session);

    const previousSessions = await prisma.workoutSession.findMany({
        where: {
            userId,
            status: "COMPLETED",
            completedAt: { lt: session.startedAt },
        },
        orderBy: { completedAt: "desc" },
        take: 100,
        select: { id: true, completedAt: true, exercises: true },
    });
    const previousByExercise = new Map();
    for (const previousSession of previousSessions) {
        for (const exercise of previousSession.exercises) {
            const key = exercise.name.toLocaleLowerCase();
            if (!exerciseNames.has(key) || previousByExercise.has(key)) continue;
            const sets = exercise.sets
                .filter((set) => set.completed && Number.isFinite(set.weight) && Number.isInteger(set.reps))
                .map(({ setNumber, weight, reps }) => ({ setNumber, weight, reps }));
            if (sets.length) {
                previousByExercise.set(key, {
                    date: previousSession.completedAt,
                    sets,
                });
            }
        }
    }
    return mapSession(session, previousByExercise);
}

async function persistSessionExercises(session, exercises, userId) {
    const result = await prisma.workoutSession.updateMany({
        where: { id: session.id, userId, status: "IN_PROGRESS", revision: session.revision },
        data: { exercises, revision: { increment: 1 } },
    });
    if (result.count !== 1) {
        throw new HttpError(409, "WORKOUT_CHANGED", "A sessão mudou durante a atualização. Atualize os dados e tente novamente.");
    }
    const updated = await prisma.workoutSession.findFirst({ where: { id: session.id, userId } });
    return updated;
}

router.post("/gym/plans", requireAuth, asyncHandler(async (req, res) => {
    const input = parse(workoutPlanSchema, req.body);
    const plan = await createWithinUserQuota({
        prisma, userId: req.user.id, resource: "workoutPlan", limit: MAX_PLANS_PER_USER,
        errorCode: "WORKOUT_PLAN_LIMIT_REACHED", errorMessage: "O limite de fichas de treino foi atingido.",
        data: {
            name: input.name,
            exercises: normalizePlanExercises(input.exercises),
        },
    });
    return sendSuccess(res, { plan: mapPlan(plan) }, 201);
}));

router.get("/gym/plans", requireAuth, asyncHandler(async (req, res) => {
    rejectUnknownQuery(req.query, []);
    const plans = await prisma.workoutPlan.findMany({
        where: { userId: req.user.id },
        orderBy: { updatedAt: "desc" },
    });
    return sendSuccess(res, { items: plans.map(mapPlan) });
}));

router.patch("/gym/plans/:id", requireAuth, asyncHandler(async (req, res) => {
    const input = parse(workoutPlanSchema, req.body);
    const plan = await findOwnedPlan(req.user.id, req.params.id);
    const updated = await prisma.workoutPlan.update({
        where: { id: plan.id },
        data: { name: input.name, exercises: normalizePlanExercises(input.exercises) },
    });
    return sendSuccess(res, { plan: mapPlan(updated) });
}));

router.delete("/gym/plans/:id", requireAuth, asyncHandler(async (req, res) => {
    const plan = await findOwnedPlan(req.user.id, req.params.id);
    await prisma.workoutPlan.delete({ where: { id: plan.id } });
    return sendSuccess(res, { deleted: true });
}));

router.post("/gym/sessions", requireAuth, asyncHandler(async (req, res) => {
    const input = parse(workoutStartSchema, req.body);
    const existing = await findActiveWorkoutSession(req.user.id);
    if (existing) {
        return sendSuccess(res, { session: await withPreviousValues(req.user.id, existing), resumed: true });
    }

    const plan = input.planId ? await findOwnedPlan(req.user.id, input.planId) : null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const sessionId = randomBytes(12).toString("hex");
        const session = await prisma.$transaction(async (tx) => {
            const claimed = await tx.user.updateMany({
                where: { id: req.user.id, ...FREE_WORKOUT_POINTER },
                data: { activeWorkoutSessionId: sessionId },
            });
            if (claimed.count !== 1) return null;
            return tx.workoutSession.create({
                data: {
                    id: sessionId,
                    userId: req.user.id,
                    planId: plan?.id ?? null,
                    planName: plan?.name ?? null,
                    exercises: plan
                        ? plan.exercises.map((exercise, index) => createSessionExercise(exercise, index, exercise.id))
                        : [],
                },
            });
        });

        if (session) {
            return sendSuccess(res, { session: await withPreviousValues(req.user.id, session) }, 201);
        }

        const concurrentSession = await findActiveWorkoutSession(req.user.id);
        if (concurrentSession) {
            return sendSuccess(res, { session: await withPreviousValues(req.user.id, concurrentSession), resumed: true });
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new HttpError(409, "WORKOUT_START_CONFLICT", "Não foi possível iniciar o treino devido a uma alteração simultânea. Tente novamente.");
}));

router.get("/gym/sessions/active", requireAuth, asyncHandler(async (req, res) => {
    const session = await findActiveWorkoutSession(req.user.id);
    return sendSuccess(res, { session: session ? await withPreviousValues(req.user.id, session) : null });
}));

router.post("/gym/sessions/:id/exercises", requireAuth, asyncHandler(async (req, res) => {
    const input = parse(workoutSessionExerciseSchema, req.body);
    const session = await findOwnedSession(req.user.id, req.params.id);
    if (session.status !== "IN_PROGRESS") {
        throw new HttpError(409, "INVALID_WORKOUT_STATE", "Só é possível adicionar exercícios a um treino em andamento.");
    }
    if (session.exercises.length >= 50) {
        throw new HttpError(422, "WORKOUT_EXERCISE_LIMIT_REACHED", "Uma sessão pode conter no máximo 50 exercícios.");
    }
    const exercises = [...session.exercises, createSessionExercise(input, session.exercises.length)];
    const updated = await persistSessionExercises(session, exercises, req.user.id);
    return sendSuccess(res, { session: await withPreviousValues(req.user.id, updated) }, 201);
}));

router.post("/gym/sessions/:id/exercises/:exerciseId/sets", requireAuth, asyncHandler(async (req, res) => {
    requireEmptyBody(req.body);
    const session = await findOwnedSession(req.user.id, req.params.id);
    if (session.status !== "IN_PROGRESS") {
        throw new HttpError(409, "INVALID_WORKOUT_STATE", "Só é possível adicionar séries a um treino em andamento.");
    }
    const exerciseIndex = session.exercises.findIndex((exercise) => exercise.id === req.params.exerciseId);
    if (exerciseIndex < 0) throw new HttpError(404, "WORKOUT_EXERCISE_NOT_FOUND", "Exercício da sessão não encontrado.");
    const exercise = session.exercises[exerciseIndex];
    if (exercise.sets.length >= 30) {
        throw new HttpError(422, "WORKOUT_SET_LIMIT_REACHED", "Um exercício pode conter no máximo 30 séries.");
    }
    const exercises = session.exercises.map((item, index) => index === exerciseIndex
        ? {
            ...item,
            sets: [...item.sets, {
                id: randomUUID(),
                setNumber: item.sets.length + 1,
                weight: null,
                reps: null,
                completed: false,
                completedAt: null,
            }],
        }
        : item);
    const updated = await persistSessionExercises(session, exercises, req.user.id);
    return sendSuccess(res, { session: mapSession(updated) }, 201);
}));

router.patch("/gym/sessions/:id/exercises/:exerciseId/sets/:setId", requireAuth, asyncHandler(async (req, res) => {
    const input = parse(workoutSetSchema, req.body);
    const session = await findOwnedSession(req.user.id, req.params.id);
    if (session.status !== "IN_PROGRESS") {
        throw new HttpError(409, "INVALID_WORKOUT_STATE", "Só é possível alterar séries de um treino em andamento.");
    }
    let found = false;
    const now = new Date();
    const exercises = session.exercises.map((exercise) => {
        if (exercise.id !== req.params.exerciseId) return exercise;
        return {
            ...exercise,
            sets: exercise.sets.map((set) => {
                if (set.id !== req.params.setId) return set;
                found = true;
                return {
                    ...set,
                    weight: input.weight,
                    reps: input.reps,
                    completed: input.completed,
                    completedAt: input.completed ? set.completedAt || now : null,
                };
            }),
        };
    });
    if (!found) throw new HttpError(404, "WORKOUT_SET_NOT_FOUND", "Série da sessão não encontrada.");
    const updated = await persistSessionExercises(session, exercises, req.user.id);
    return sendSuccess(res, { session: mapSession(updated) });
}));

router.post("/gym/sessions/:id/complete", requireAuth, asyncHandler(async (req, res) => {
    rejectUnknownQuery(req.query, []);
    requireEmptyBody(req.body);
    const session = await findOwnedSession(req.user.id, req.params.id);
    const completedAt = new Date();
    const update = buildWorkoutEndUpdate(session, "COMPLETED", completedAt);
    await prisma.$transaction(async (tx) => {
        const result = await tx.workoutSession.updateMany({
            where: { id: session.id, userId: req.user.id, status: "IN_PROGRESS" },
            data: update,
        });
        if (result.count !== 1) {
            throw new HttpError(409, "INVALID_WORKOUT_STATE", "A sessão mudou enquanto a operação era processada.");
        }
        await tx.user.updateMany({
            where: { id: req.user.id, activeWorkoutSessionId: session.id },
            data: { activeWorkoutSessionId: null },
        });
    });
    return sendSuccess(res, {
        session: mapSession({ ...session, ...update }),
    });
}));

router.post("/gym/sessions/:id/abandon", requireAuth, asyncHandler(async (req, res) => {
    rejectUnknownQuery(req.query, []);
    requireEmptyBody(req.body);
    const session = await findOwnedSession(req.user.id, req.params.id);
    const abandonedAt = new Date();
    const update = buildWorkoutEndUpdate(session, "ABANDONED", abandonedAt);
    await prisma.$transaction(async (tx) => {
        const result = await tx.workoutSession.updateMany({
            where: { id: session.id, userId: req.user.id, status: "IN_PROGRESS" },
            data: update,
        });
        if (result.count !== 1) {
            throw new HttpError(409, "INVALID_WORKOUT_STATE", "A sessão mudou enquanto a operação era processada.");
        }
        await tx.user.updateMany({
            where: { id: req.user.id, activeWorkoutSessionId: session.id },
            data: { activeWorkoutSessionId: null },
        });
    });
    return sendSuccess(res, {
        session: mapSession({ ...session, ...update }),
    });
}));

router.get("/gym/sessions", requireAuth, asyncHandler(async (req, res) => {
    rejectUnknownQuery(req.query, ["page", "limit"]);
    const { page, limit } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 50 });
    const where = { userId: req.user.id, status: "COMPLETED" };
    const [sessions, total] = await Promise.all([
        prisma.workoutSession.findMany({
            where,
            orderBy: { completedAt: "desc" },
            skip: (page - 1) * limit,
            take: limit,
        }),
        prisma.workoutSession.count({ where }),
    ]);
    return sendSuccess(res, {
        items: sessions.map(mapSession),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
}));

router.delete("/gym/sessions/history", requireAuth, asyncHandler(async (req, res) => {
    rejectUnknownQuery(req.query, []);
    requireEmptyBody(req.body);
    const result = await prisma.workoutSession.deleteMany({
        where: { userId: req.user.id, status: "COMPLETED" },
    });
    return sendSuccess(res, { deletedCount: result.count });
}));

router.delete("/gym/sessions/:id/exercises/:exerciseId", requireAuth, asyncHandler(async (req, res) => {
    requireEmptyBody(req.body);
    const session = await findOwnedSession(req.user.id, req.params.id);
    if (session.status !== "COMPLETED") {
        throw new HttpError(409, "INVALID_WORKOUT_STATE", "Só é possível excluir exercícios de sessões concluídas.");
    }
    if (!session.exercises.some((exercise) => exercise.id === req.params.exerciseId)) {
        throw new HttpError(404, "WORKOUT_EXERCISE_NOT_FOUND", "Exercício não encontrado nesta sessão.");
    }
    const updated = await prisma.workoutSession.updateMany({
        where: {
            id: session.id,
            userId: req.user.id,
            status: "COMPLETED",
            revision: session.revision,
        },
        data: {
            exercises: session.exercises.filter((exercise) => exercise.id !== req.params.exerciseId),
            revision: { increment: 1 },
        },
    });
    if (updated.count !== 1) {
        throw new HttpError(409, "WORKOUT_CHANGED", "A sessão foi alterada. Atualize o histórico e tente novamente.");
    }
    const refreshed = await findOwnedSession(req.user.id, session.id);
    return sendSuccess(res, { session: mapSession(refreshed) });
}));

router.get("/gym/sessions/:id", requireAuth, asyncHandler(async (req, res) => {
    const session = await findOwnedSession(req.user.id, req.params.id);
    return sendSuccess(res, { session: mapSession(session) });
}));

router.get("/gym/stats", requireAuth, asyncHandler(async (req, res) => {
    rejectUnknownQuery(req.query, ["exercise"]);
    const exerciseName = req.query.exercise;
    if (exerciseName !== undefined && (typeof exerciseName !== "string" || exerciseName.length > 100)) {
        throw new HttpError(400, "VALIDATION_ERROR", "O exercício informado é inválido.");
    }
    const now = new Date();
    const todayKey = dateKeyInTimezone(now, req.user.timezone);
    const fromDateKey = addDateKeyDays(todayKey, -(STATS_DAYS - 1));
    const sessions = await prisma.workoutSession.findMany({
        where: {
            userId: req.user.id,
            status: "COMPLETED",
            completedAt: { gte: new Date(now.getTime() - STATS_DAYS * 24 * 60 * 60 * 1000) },
        },
        orderBy: { completedAt: "desc" },
        take: MAX_STATS_SESSIONS,
    });
    const stats = calculateWorkoutStats(sessions, {
        exerciseName,
        dateForSession: (date) => dateKeyInTimezone(date, req.user.timezone),
    });
    const weekStart = addDateKeyDays(todayKey, -((new Date(`${todayKey}T12:00:00.000Z`).getUTCDay() + 6) % 7));
    const monthStart = `${todayKey.slice(0, 7)}-01`;
    const weeklyCount = sessions.filter((session) => dateKeyInTimezone(session.completedAt, req.user.timezone) >= weekStart).length;
    const monthlyCount = sessions.filter((session) => dateKeyInTimezone(session.completedAt, req.user.timezone) >= monthStart).length;
    return sendSuccess(res, {
        ...stats,
        weeklyCount,
        monthlyCount,
        from: fromDateKey,
        to: todayKey,
        exerciseFilter: exerciseName || null,
        truncated: sessions.length === MAX_STATS_SESSIONS,
    });
}));

router.get("/gym/calendar", requireAuth, asyncHandler(async (req, res) => {
    rejectUnknownQuery(req.query, []);
    const today = dateKeyInTimezone(new Date(), req.user.timezone);
    const from = addDateKeyDays(today, -(STATS_DAYS - 1));
    const sessions = await prisma.workoutSession.findMany({
        where: {
            userId: req.user.id,
            status: "COMPLETED",
            completedAt: { gte: new Date(Date.now() - STATS_DAYS * 24 * 60 * 60 * 1000) },
        },
        select: { status: true, completedAt: true },
    });
    const sessionsByDate = new Map();
    for (const session of sessions) {
        const date = dateKeyInTimezone(session.completedAt, req.user.timezone);
        sessionsByDate.set(date, (sessionsByDate.get(date) || 0) + 1);
    }
    const days = Array.from({ length: STATS_DAYS }, (_, index) => {
        const date = addDateKeyDays(from, index);
        return { date, count: sessionsByDate.get(date) || 0 };
    });
    return sendSuccess(res, { from, to: today, days });
}));

router.get("/gym/calendar/:date", requireAuth, asyncHandler(async (req, res) => {
    const { date } = req.params;
    if (!isDateKey(date)) throw new HttpError(400, "VALIDATION_ERROR", "Data deve estar no formato YYYY-MM-DD.");
    const query = buildWorkoutCalendarQuery(req.user.id, date, req.user.timezone);
    const sessions = await prisma.workoutSession.findMany(query);
    const items = sessions.map(mapSession);
    return sendSuccess(res, { date, items });
}));

export default router;
