import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import test from "node:test";
import { createApp } from "../src/app.js";
import { parseApiConfig } from "../src/config/env.js";
import { AUTH_COOKIE, createAuthToken } from "../src/middlewares/auth.js";
import { prisma } from "../src/lib/prisma.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for quota integration tests.");
const parsedUrl = new URL(databaseUrl);
if (parsedUrl.protocol !== "mongodb:" || parsedUrl.hostname !== "127.0.0.1" || parsedUrl.port !== "27018"
    || parsedUrl.pathname !== "/focuser_test" || parsedUrl.searchParams.get("replicaSet") !== "rs0") {
    throw new Error("Refusing quota integration test: DATABASE_URL must target the local focuser_test replica set on port 27018.");
}
process.env.NODE_ENV = "test";
process.env.JWT_SECRET ||= "focuser-isolated-quota-integration-test-secret";

test("all four resource quotas preserve the boundary under simultaneous API creates", { timeout: 120_000 }, async () => {
    const runId = randomUUID();
    const user = await prisma.user.create({ data: { name: "Quota integration", email: `quota-${runId}@focuser.dev` } });
    const app = createApp(parseApiConfig({ ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: "test" }));
    const cookie = `${AUTH_COOKIE}=${createAuthToken(user)}`;
    const post = (path, body) => request(app).post(path).set("Cookie", cookie).set("X-Focuser-Client", "web").send(body);
    const seed = async (model, count, data) => model.createMany({ data: Array.from({ length: count }, () => ({ userId: user.id, ...data })) });
    try {
        await seed(prisma.habit, 99, { name: "seed", startDateKey: "2026-01-01", daysOfWeek: [0, 1, 2, 3, 4, 5, 6] });
        await seed(prisma.goal, 99, { name: "seed", targetValue: 1, currentValue: 0, unit: "pages" });
        await seed(prisma.readingBook, 499, { title: "seed", totalPages: 1, currentPage: 0 });
        await seed(prisma.workoutPlan, 99, { name: "seed", exercises: [] });

        const cases = [
            { path: "/api/habits", body: { name: "last habit" }, model: prisma.habit, limit: 100, code: "HABIT_LIMIT_REACHED" },
            { path: "/api/goals", body: { name: "last goal", targetValue: 1, unit: "pages" }, model: prisma.goal, limit: 100, code: "GOAL_LIMIT_REACHED" },
            { path: "/api/reading/books", body: { title: "last book", totalPages: 1 }, model: prisma.readingBook, limit: 500, code: "BOOK_LIMIT_REACHED" },
            { path: "/api/gym/plans", body: { name: "last plan", exercises: [] }, model: prisma.workoutPlan, limit: 100, code: "WORKOUT_PLAN_LIMIT_REACHED" },
        ];
        for (const item of cases) {
            const responses = await Promise.all([post(item.path, item.body), post(item.path, item.body)]);
            assert.deepEqual(responses.map((response) => response.status).sort(), [201, 422]);
            const rejected = responses.find((response) => response.status === 422);
            assert.equal(rejected.body.error.code, item.code);
            assert.equal(await item.model.count({ where: { userId: user.id } }), item.limit);
        }
    } finally {
        await prisma.checkIn.deleteMany({ where: { userId: user.id } });
        await prisma.habit.deleteMany({ where: { userId: user.id } });
        await prisma.goal.deleteMany({ where: { userId: user.id } });
        await prisma.readingBook.deleteMany({ where: { userId: user.id } });
        await prisma.workoutPlan.deleteMany({ where: { userId: user.id } });
        await prisma.user.delete({ where: { id: user.id } });
    }
});
