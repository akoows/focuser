import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import test from "node:test";
import { parseApiConfig } from "../src/config/env.js";
import { createApp } from "../src/app.js";
import { AUTH_COOKIE, createAuthToken } from "../src/middlewares/auth.js";
import { prisma } from "../src/lib/prisma.js";
import { compareAndSetGoalUpdate } from "../src/services/goalMutationService.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for goal concurrency integration tests.");

const parsedUrl = new URL(databaseUrl);
if (
    parsedUrl.protocol !== "mongodb:"
    || parsedUrl.hostname !== "127.0.0.1"
    || parsedUrl.port !== "27018"
    || parsedUrl.pathname !== "/focuser_test"
    || parsedUrl.searchParams.get("replicaSet") !== "rs0"
) {
    throw new Error("Refusing goal integration test: DATABASE_URL must target the local focuser_test replica set on port 27018.");
}

process.env.NODE_ENV = "test";
process.env.JWT_SECRET ||= "focuser-isolated-goal-integration-test-secret";

test("simultaneous target reduction and progress increment preserve the persisted invariant", {
    timeout: 120_000,
}, async () => {
    const runId = randomUUID();
    const user = await prisma.user.create({
        data: {
            name: "Goal concurrency integration",
            email: `goal-concurrency-${runId}@focuser.dev`,
        },
    });

    try {
        const app = createApp(parseApiConfig({
            ...process.env,
            DATABASE_URL: databaseUrl,
            NODE_ENV: "test",
        }));
        const cookie = `${AUTH_COOKIE}=${createAuthToken(user)}`;
        const goal = await prisma.goal.create({
            data: {
                userId: user.id,
                name: "Target versus increment",
                currentValue: 5,
                targetValue: 10,
                unit: "pages",
            },
        });

        const invalidTargetUpdate = await request(app)
            .patch(`/api/goals/${goal.id}`)
            .set("Cookie", cookie)
            .set("X-Focuser-Client", "web")
            .send({ targetValue: 4 });
        assert.equal(invalidTargetUpdate.status, 400);
        assert.equal((await prisma.goal.findUnique({ where: { id: goal.id } })).targetValue, 10);

        for (const firstMutation of ["patch", "progress"]) {
            await prisma.goal.update({
                where: { id: goal.id },
                data: { currentValue: 5, targetValue: 10, isActive: true },
            });
            const sameSnapshot = await prisma.goal.findUnique({ where: { id: goal.id } });
            const patch = () => compareAndSetGoalUpdate({
                goal: sameSnapshot,
                userId: user.id,
                data: { targetValue: 6 },
                updateMany: (args) => prisma.goal.updateMany(args),
            });
            const progress = () => compareAndSetGoalUpdate({
                goal: sameSnapshot,
                userId: user.id,
                data: { currentValue: { increment: 3 } },
                updateMany: (args) => prisma.goal.updateMany(args),
                requireActive: true,
            });
            const outcomes = await Promise.allSettled(
                firstMutation === "patch" ? [patch(), progress()] : [progress(), patch()]
            );

            assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1);
            const conflict = outcomes.find((result) => result.status === "rejected");
            assert.equal(conflict.reason.code, "GOAL_CHANGED");
            assert.equal(conflict.reason.status, 409);

            const persisted = await prisma.goal.findUnique({ where: { id: goal.id } });
            assert.ok(persisted.currentValue <= persisted.targetValue, JSON.stringify(persisted));
        }

        await prisma.goal.update({
            where: { id: goal.id },
            data: { name: "Original name", currentValue: 2, targetValue: 10 },
        });
        const editSnapshot = await prisma.goal.findUnique({ where: { id: goal.id } });
        const edits = await Promise.allSettled([
            compareAndSetGoalUpdate({
                goal: editSnapshot,
                userId: user.id,
                data: { currentValue: 3 },
                updateMany: (args) => prisma.goal.updateMany(args),
            }),
            compareAndSetGoalUpdate({
                goal: editSnapshot,
                userId: user.id,
                data: { targetValue: 8 },
                updateMany: (args) => prisma.goal.updateMany(args),
            }),
        ]);
        assert.equal(edits.filter((result) => result.status === "fulfilled").length, 1);
        assert.equal(edits.find((result) => result.status === "rejected").reason.code, "GOAL_CHANGED");
        const afterEdits = await prisma.goal.findUnique({ where: { id: goal.id } });
        assert.ok(afterEdits.currentValue <= afterEdits.targetValue);
    } finally {
        await prisma.goal.deleteMany({ where: { userId: user.id } });
        await prisma.user.delete({ where: { id: user.id } });
    }
});
