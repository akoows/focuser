import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for MongoDB integration tests.");
}

const parsedUrl = new URL(databaseUrl);
if (
    parsedUrl.protocol !== "mongodb:"
    || parsedUrl.hostname !== "127.0.0.1"
    || parsedUrl.port !== "27018"
    || parsedUrl.pathname !== "/focuser_test"
    || parsedUrl.searchParams.get("replicaSet") !== "rs0"
) {
    throw new Error(
        "Refusing database integration test: DATABASE_URL must target the local focuser_test replica set on port 27018.",
    );
}

const require = createRequire(import.meta.url);
const { PrismaClient } = require("../app/generated/prisma/index.js");
const prisma = new PrismaClient();

test("Prisma commits related writes and rolls back failed transactions", {
    timeout: 120_000,
}, async () => {
    const runId = randomUUID();
    const userId = randomBytes(12).toString("hex");
    const planIds = [];
    const sessionIds = [];

    const createPair = async (transaction, name) => {
        const plan = await transaction.workoutPlan.create({
            data: { userId, name, exercises: [] },
        });
        planIds.push(plan.id);

        const session = await transaction.workoutSession.create({
            data: {
                userId,
                planId: plan.id,
                planName: plan.name,
                exercises: [],
            },
        });
        sessionIds.push(session.id);

        return { planId: plan.id, sessionId: session.id };
    };

    try {
        await prisma.$connect();

        const committed = await prisma.$transaction((transaction) => (
            createPair(transaction, `focuser-integration-commit-${runId}`)
        ));

        const committedPlan = await prisma.workoutPlan.findUnique({
            where: { id: committed.planId },
        });
        const committedSession = await prisma.workoutSession.findUnique({
            where: { id: committed.sessionId },
        });
        assert.equal(committedPlan?.name, `focuser-integration-commit-${runId}`);
        assert.equal(committedSession?.planId, committed.planId);

        let rolledBack;
        await assert.rejects(
            prisma.$transaction(async (transaction) => {
                rolledBack = await createPair(
                    transaction,
                    `focuser-integration-rollback-${runId}`,
                );
                throw new Error("controlled integration-test rollback");
            }),
            /controlled integration-test rollback/,
        );

        assert.equal(
            await prisma.workoutPlan.findUnique({ where: { id: rolledBack.planId } }),
            null,
        );
        assert.equal(
            await prisma.workoutSession.findUnique({ where: { id: rolledBack.sessionId } }),
            null,
        );
    } finally {
        if (sessionIds.length) {
            await prisma.workoutSession.deleteMany({
                where: { id: { in: sessionIds } },
            });
        }
        if (planIds.length) {
            await prisma.workoutPlan.deleteMany({
                where: { id: { in: planIds } },
            });
        }
        await prisma.$disconnect();
    }
});
