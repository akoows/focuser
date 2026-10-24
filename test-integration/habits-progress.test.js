import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import test from "node:test";
import { parseApiConfig } from "../src/config/env.js";
import { createApp } from "../src/app.js";
import { AUTH_COOKIE, createAuthToken } from "../src/middlewares/auth.js";
import { prisma } from "../src/lib/prisma.js";
import { addDateKeyDays, dateKeyInTimezone, weekdayForDateKey } from "../src/utils/date.js";
import { compareAndSetHabitPatch } from "../src/services/habitMutationService.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for habit integration tests.");

const parsedUrl = new URL(databaseUrl);
if (
    parsedUrl.protocol !== "mongodb:"
    || parsedUrl.hostname !== "127.0.0.1"
    || parsedUrl.port !== "27018"
    || parsedUrl.pathname !== "/focuser_test"
    || parsedUrl.searchParams.get("replicaSet") !== "rs0"
) {
    throw new Error("Refusing habit integration test: DATABASE_URL must target the local focuser_test replica set on port 27018.");
}

process.env.NODE_ENV = "test";
process.env.JWT_SECRET ||= "focuser-isolated-habit-integration-test-secret";

function createMutationBarrier(parties) {
    let arrivals = 0;
    let release;
    const barrier = new Promise((resolve) => { release = resolve; });
    return async () => {
        arrivals += 1;
        if (arrivals === parties) release();
        await barrier;
    };
}

test("habit progress routes retain occurrence and PATCH validates against the saved unit", {
    timeout: 120_000,
}, async () => {
    const runId = randomUUID();
    const timezone = "America/Sao_Paulo";
    const today = dateKeyInTimezone(new Date(), timezone);
    const user = await prisma.user.create({
        data: {
            name: "Habit integration",
            email: `habit-integration-${runId}@focuser.dev`,
            timezone,
        },
    });
    let habitId;
    let otherUser;

    try {
        const habit = await prisma.habit.create({
            data: {
                userId: user.id,
                name: "Meta múltipla",
                dailyTarget: 3,
                step: 1,
                unit: null,
                frequency: "CUSTOM",
                daysOfWeek: [weekdayForDateKey(today)],
                startDateKey: today,
            },
        });
        habitId = habit.id;
        await prisma.checkIn.create({
            data: {
                userId: user.id,
                habitId,
                dateKey: today,
                occurrence: 3,
                completedAt: new Date(),
            },
        });

        const app = createApp(parseApiConfig({
            ...process.env,
            DATABASE_URL: databaseUrl,
            NODE_ENV: "test",
        }));
        const cookie = `${AUTH_COOKIE}=${createAuthToken(user)}`;

        const generalProgress = await request(app)
            .get("/api/progress")
            .set("Cookie", cookie);
        assert.equal(generalProgress.status, 200);
        assert.ok(generalProgress.body.data.totals.scheduled >= 1);
        assert.equal(generalProgress.body.data.totals.completed, generalProgress.body.data.totals.scheduled);
        assert.ok(generalProgress.body.data.streaks.currentStreak >= 1);
        assert.ok(generalProgress.body.data.habits[0].currentStreak >= 1);

        const individualProgress = await request(app)
            .get(`/api/habits/${habitId}/progress?period=week`)
            .set("Cookie", cookie);
        assert.equal(individualProgress.status, 200);
        assert.ok(individualProgress.body.data.scheduled >= 1);
        assert.equal(individualProgress.body.data.completed, individualProgress.body.data.scheduled);
        assert.ok(individualProgress.body.data.currentStreak >= 1);

        const invalidCountTarget = await request(app)
            .patch(`/api/habits/${habitId}`)
            .set("Cookie", cookie)
            .set("X-Focuser-Client", "web")
            .send({ dailyTarget: 21 });
        assert.equal(invalidCountTarget.status, 400);
        assert.equal((await prisma.habit.findUnique({ where: { id: habitId } })).dailyTarget, 3);

        const updateUnitAndTarget = await request(app)
            .patch(`/api/habits/${habitId}`)
            .set("Cookie", cookie)
            .set("X-Focuser-Client", "web")
            .send({ unit: "ML", dailyTarget: 2_000, step: 250 });
        assert.equal(updateUnitAndTarget.status, 200);
        assert.equal(updateUnitAndTarget.body.data.habit.unit, "ML");
        assert.equal(updateUnitAndTarget.body.data.habit.dailyTarget, 2_000);

        const invalidStepUpdate = await request(app)
            .patch(`/api/habits/${habitId}`)
            .set("Cookie", cookie)
            .set("X-Focuser-Client", "web")
            .send({ dailyTarget: 200, step: 250 });
        assert.equal(invalidStepUpdate.status, 400);
        const afterInvalidStep = await prisma.habit.findUnique({ where: { id: habitId } });
        assert.equal(afterInvalidStep.dailyTarget, 2_000);
        assert.equal(afterInvalidStep.step, 250);

        const partialTargetUpdate = await request(app)
            .patch(`/api/habits/${habitId}`)
            .set("Cookie", cookie)
            .set("X-Focuser-Client", "web")
            .send({ dailyTarget: 2_500 });
        assert.equal(partialTargetUpdate.status, 200);
        const persistedPartialUpdate = await prisma.habit.findUnique({ where: { id: habitId } });
        assert.equal(persistedPartialUpdate.unit, "ML");
        assert.equal(persistedPartialUpdate.dailyTarget, 2_500);

        const incompatibleUnitChange = await request(app)
            .patch(`/api/habits/${habitId}`)
            .set("Cookie", cookie)
            .set("X-Focuser-Client", "web")
            .send({ unit: "REPS" });
        assert.equal(incompatibleUnitChange.status, 400);
        const stillMilliliters = await prisma.habit.findUnique({ where: { id: habitId } });
        assert.equal(stillMilliliters.unit, "ML");
        assert.equal(stillMilliliters.dailyTarget, 2_500);

        const validUnitChange = await request(app)
            .patch(`/api/habits/${habitId}`)
            .set("Cookie", cookie)
            .set("X-Focuser-Client", "web")
            .send({ unit: "REPS", dailyTarget: 100, step: 25 });
        assert.equal(validUnitChange.status, 200);
        assert.equal(validUnitChange.body.data.habit.unit, "REPS");
        assert.equal(validUnitChange.body.data.habit.dailyTarget, 100);

        otherUser = await prisma.user.create({
            data: {
                name: "Other habit integration",
                email: `habit-integration-other-${runId}@focuser.dev`,
                timezone,
            },
        });
        const otherHabit = await prisma.habit.create({
            data: {
                userId: otherUser.id,
                name: "Água de outra conta",
                dailyTarget: 2_000,
                step: 250,
                unit: "ML",
                frequency: "DAILY",
                daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
                startDateKey: today,
            },
        });
        const crossAccountUpdate = await request(app)
            .patch(`/api/habits/${otherHabit.id}`)
            .set("Cookie", cookie)
            .set("X-Focuser-Client", "web")
            .send({ dailyTarget: 2_500 });
        assert.equal(crossAccountUpdate.status, 404);
        assert.equal((await prisma.habit.findUnique({ where: { id: otherHabit.id } })).dailyTarget, 2_000);

        const countCreateOverCap = await request(app)
            .post("/api/habits")
            .set("Cookie", cookie)
            .set("X-Focuser-Client", "web")
            .send({ name: "Meta simples inválida", category: "Saúde", dailyTarget: 21 });
        assert.equal(countCreateOverCap.status, 400);

        const milliliterCreate = await request(app)
            .post("/api/habits")
            .set("Cookie", cookie)
            .set("X-Focuser-Client", "web")
            .send({
                name: "Água",
                category: "Saúde",
                unit: "ML",
                dailyTarget: 2_000,
                step: 250,
            });
        assert.equal(milliliterCreate.status, 201);
        assert.equal(milliliterCreate.body.data.habit.unit, "ML");
        assert.equal(milliliterCreate.body.data.habit.dailyTarget, 2_000);
    } finally {
        if (otherUser) {
            await prisma.checkIn.deleteMany({ where: { userId: otherUser.id } });
            await prisma.habit.deleteMany({ where: { userId: otherUser.id } });
            await prisma.user.delete({ where: { id: otherUser.id } });
        }
        await prisma.checkIn.deleteMany({ where: { userId: user.id } });
        await prisma.habit.deleteMany({ where: { userId: user.id } });
        await prisma.user.delete({ where: { id: user.id } });
    }
});

test("overlapping habit PATCHes preserve the persisted step and target invariant", { timeout: 120_000 }, async () => {
    const runId = randomUUID();
    const user = await prisma.user.create({ data: { name: "Habit concurrency", email: `habit-concurrency-${runId}@focuser.dev` } });
    try {
        const habit = await prisma.habit.create({
            data: {
                userId: user.id,
                name: "Concurrent target",
                dailyTarget: 20,
                step: 1,
                unit: null,
                frequency: "DAILY",
                daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
                startDateKey: "2026-10-24",
            },
        });
        const runContestedUpdates = async (firstInput, secondInput) => {
            const snapshot = await prisma.habit.findUnique({ where: { id: habit.id } });
            const waitForBoth = createMutationBarrier(2);
            const update = (input) => compareAndSetHabitPatch({
                habit: { ...snapshot, daysOfWeek: [...snapshot.daysOfWeek] },
                userId: user.id,
                input,
                updateMany: async (mutation) => {
                    await waitForBoth();
                    return prisma.habit.updateMany(mutation);
                },
                findUpdated: () => prisma.habit.findFirst({ where: { id: habit.id, userId: user.id } }),
            });
            const outcomes = await Promise.allSettled([update(firstInput), update(secondInput)]);
            const successful = outcomes.filter((outcome) => outcome.status === "fulfilled");
            const rejected = outcomes.find((outcome) => outcome.status === "rejected");
            assert.equal(successful.length, 1, "one concurrent write must win while the other receives a conflict");
            assert.equal(rejected.reason.code, "HABIT_CHANGED");

            const persisted = await prisma.habit.findUnique({ where: { id: habit.id } });
            assert.ok(persisted.step <= persisted.dailyTarget);
            const firstInputWon = outcomes[0].status === "fulfilled";
            assert.equal(persisted.dailyTarget, firstInputWon ? firstInput.dailyTarget ?? snapshot.dailyTarget : secondInput.dailyTarget ?? snapshot.dailyTarget);
            assert.equal(persisted.step, firstInputWon ? firstInput.step ?? snapshot.step : secondInput.step ?? snapshot.step);
        };

        await runContestedUpdates({ dailyTarget: 5 }, { step: 10 });
        await prisma.habit.update({ where: { id: habit.id }, data: { dailyTarget: 20, step: 1 } });
        await runContestedUpdates({ step: 10 }, { dailyTarget: 5 });
    } finally {
        await prisma.checkIn.deleteMany({ where: { userId: user.id } });
        await prisma.habit.deleteMany({ where: { userId: user.id } });
        await prisma.user.delete({ where: { id: user.id } });
    }
});

test("dashboard streak uses the 365-day check-in window while the summary remains seven days", { timeout: 120_000 }, async () => {
    const runId = randomUUID();
    const timezone = "America/Sao_Paulo";
    const today = dateKeyInTimezone(new Date(), timezone);
    const user = await prisma.user.create({ data: { name: "Dashboard streak", email: `dashboard-streak-${runId}@focuser.dev`, timezone } });
    try {
        const startDateKey = addDateKeyDays(today, -29);
        const habit = await prisma.habit.create({
            data: {
                userId: user.id,
                name: "Trinta dias",
                dailyTarget: 1,
                step: 1,
                frequency: "DAILY",
                daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
                startDateKey,
            },
        });
        await prisma.checkIn.createMany({
            data: Array.from({ length: 30 }, (_, index) => ({
                userId: user.id,
                habitId: habit.id,
                dateKey: addDateKeyDays(today, -index),
                occurrence: 1,
                completedAt: new Date(),
            })),
        });
        const app = createApp(parseApiConfig({ ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: "test" }));
        const cookie = `${AUTH_COOKIE}=${createAuthToken(user)}`;
        const response = await request(app).get("/api/dashboard").set("Cookie", cookie);
        assert.equal(response.status, 200);
        assert.equal(response.body.data.progress.currentStreak, 30);
        assert.equal(response.body.data.progress.last7Days.scheduled, 7);
        assert.equal(response.body.data.progress.last7Days.completed, 7);
    } finally {
        await prisma.checkIn.deleteMany({ where: { userId: user.id } });
        await prisma.habit.deleteMany({ where: { userId: user.id } });
        await prisma.user.delete({ where: { id: user.id } });
    }
});

test("habit history recognizes a completed check-in seven days before the start date", { timeout: 120_000 }, async () => {
    const runId = randomUUID();
    const timezone = "America/Sao_Paulo";
    const today = dateKeyInTimezone(new Date(), timezone);
    const yesterday = addDateKeyDays(today, -1);
    const backdated = addDateKeyDays(today, -7);
    const tooOld = addDateKeyDays(today, -8);
    const user = await prisma.user.create({ data: { name: "Backdated history", email: `backdated-history-${runId}@focuser.dev`, timezone } });
    try {
        const habit = await prisma.habit.create({
            data: {
                userId: user.id,
                name: "Início hoje",
                dailyTarget: 1,
                step: 1,
                frequency: "DAILY",
                daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
                startDateKey: today,
            },
        });
        const app = createApp(parseApiConfig({ ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: "test" }));
        const cookie = `${AUTH_COOKIE}=${createAuthToken(user)}`;
        const create = await request(app)
            .post(`/api/habits/${habit.id}/check-ins`)
            .set("Cookie", cookie)
            .set("X-Focuser-Client", "web")
            .send({ date: backdated });
        assert.equal(create.status, 201);
        const createYesterday = await request(app)
            .post(`/api/habits/${habit.id}/check-ins`)
            .set("Cookie", cookie)
            .set("X-Focuser-Client", "web")
            .send({ date: yesterday });
        assert.equal(createYesterday.status, 201);
        const rejectTooOld = await request(app)
            .post(`/api/habits/${habit.id}/check-ins`)
            .set("Cookie", cookie)
            .set("X-Focuser-Client", "web")
            .send({ date: tooOld });
        assert.equal(rejectTooOld.status, 422);
        assert.equal(rejectTooOld.body.error.code, "DATE_TOO_OLD");
        const history = await request(app)
            .get(`/api/habits/${habit.id}/history?from=${backdated}&to=${yesterday}`)
            .set("Cookie", cookie);
        assert.equal(history.status, 200);
        assert.deepEqual(history.body.data.series.filter((entry) => entry.date === backdated || entry.date === yesterday), [
            { date: backdated, scheduled: true, value: 1, target: 1, completed: true },
            { date: yesterday, scheduled: true, value: 1, target: 1, completed: true },
        ]);
    } finally {
        await prisma.checkIn.deleteMany({ where: { userId: user.id } });
        await prisma.habit.deleteMany({ where: { userId: user.id } });
        await prisma.user.delete({ where: { id: user.id } });
    }
});
