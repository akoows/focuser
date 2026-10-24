import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import test from "node:test";
import { parseApiConfig } from "../src/config/env.js";
import { createApp } from "../src/app.js";
import { AUTH_COOKIE, createAuthToken } from "../src/middlewares/auth.js";
import { prisma } from "../src/lib/prisma.js";
import { buildFocusSessionMutation } from "../src/services/focusSessionService.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for focus-session integration tests.");

const parsedUrl = new URL(databaseUrl);
if (
    parsedUrl.protocol !== "mongodb:"
    || parsedUrl.hostname !== "127.0.0.1"
    || parsedUrl.port !== "27018"
    || parsedUrl.pathname !== "/focuser_test"
    || parsedUrl.searchParams.get("replicaSet") !== "rs0"
) {
    throw new Error("Refusing focus-session integration test: DATABASE_URL must target the local focuser_test replica set on port 27018.");
}

process.env.NODE_ENV = "test";
process.env.JWT_SECRET ||= "focuser-isolated-focus-integration-test-secret";

test("focus-session creation, transitions and pointer updates remain atomic under contention", {
    timeout: 120_000,
}, async () => {
    const runId = randomUUID();
    const user = await prisma.user.create({
        data: {
            name: "Focus concurrency integration",
            email: `focus-concurrency-${runId}@focuser.dev`,
        },
    });
    let otherUser;

    try {
        const app = createApp(parseApiConfig({
            ...process.env,
            DATABASE_URL: databaseUrl,
            NODE_ENV: "test",
        }));
        const cookie = `${AUTH_COOKIE}=${createAuthToken(user)}`;
        const starts = await Promise.all([
            request(app).post("/api/focus-sessions").set("Cookie", cookie).set("X-Focuser-Client", "web").send({}),
            request(app).post("/api/focus-sessions").set("Cookie", cookie).set("X-Focuser-Client", "web").send({}),
        ]);
        assert.equal(starts.filter((response) => response.status === 201).length, 1, JSON.stringify(starts.map(({ status, body }) => ({ status, body }))));
        assert.equal(starts.filter((response) => response.status === 409).length, 1, JSON.stringify(starts.map(({ status, body }) => ({ status, body }))));

        let persistedUser = await prisma.user.findUnique({ where: { id: user.id } });
        let activeSessions = await prisma.focusSession.findMany({
            where: { userId: user.id, status: { in: ["RUNNING", "PAUSED"] } },
        });
        assert.equal(activeSessions.length, 1);
        assert.equal(persistedUser.activeFocusSessionId, activeSessions[0].id);

        const running = activeSessions[0];
        otherUser = await prisma.user.create({
            data: {
                name: "Other focus integration",
                email: `focus-concurrency-other-${runId}@focuser.dev`,
            },
        });
        const otherCookie = `${AUTH_COOKIE}=${createAuthToken(otherUser)}`;
        const unauthorizedPause = await request(app)
            .post(`/api/focus-sessions/${running.id}/pause`)
            .set("Cookie", otherCookie)
            .set("X-Focuser-Client", "web");
        assert.equal(unauthorizedPause.status, 404);
        assert.equal((await prisma.focusSession.findUnique({ where: { id: running.id } })).status, "RUNNING");

        const resumedAt = new Date(Date.now() - 60_000);
        await prisma.focusSession.update({
            where: { id: running.id },
            data: { resumedAt, elapsedSeconds: 100 },
        });
        const staleSnapshot = await prisma.focusSession.findUnique({ where: { id: running.id } });
        const transitionNow = new Date();
        const pause = buildFocusSessionMutation(staleSnapshot, user.id, "pause", transitionNow);
        const complete = buildFocusSessionMutation(staleSnapshot, user.id, "complete", transitionNow);

        assert.equal((await prisma.focusSession.updateMany({ where: pause.where, data: pause.data })).count, 1);
        assert.equal((await prisma.focusSession.updateMany({ where: complete.where, data: complete.data })).count, 0);
        const paused = await prisma.focusSession.findUnique({ where: { id: running.id } });
        assert.equal(paused.status, "PAUSED");
        assert.equal(paused.elapsedSeconds, 160);

        const pausedSnapshot = await prisma.focusSession.findUnique({ where: { id: running.id } });
        const resumeNow = new Date();
        const resume = buildFocusSessionMutation(pausedSnapshot, user.id, "resume", resumeNow);
        const staleComplete = buildFocusSessionMutation(pausedSnapshot, user.id, "complete", resumeNow);
        assert.equal((await prisma.focusSession.updateMany({ where: resume.where, data: resume.data })).count, 1);
        assert.equal((await prisma.focusSession.updateMany({ where: staleComplete.where, data: staleComplete.data })).count, 0);
        const resumed = await prisma.focusSession.findUnique({ where: { id: running.id } });
        assert.equal(resumed.status, "RUNNING");
        assert.equal(resumed.elapsedSeconds, 160);

        const completed = await request(app)
            .post(`/api/focus-sessions/${running.id}/complete`)
            .set("Cookie", cookie)
            .set("X-Focuser-Client", "web");
        assert.equal(completed.status, 200);
        assert.equal(completed.body.data.session.status, "COMPLETED");
        assert.ok(completed.body.data.session.elapsedSeconds >= 160);
        assert.ok(completed.body.data.session.elapsedSeconds < 163);
        persistedUser = await prisma.user.findUnique({ where: { id: user.id } });
        assert.equal(persistedUser.activeFocusSessionId, null);

        let rolledBackSessionId;
        await assert.rejects(prisma.$transaction(async (transaction) => {
            const inserted = await transaction.focusSession.create({
                data: {
                    userId: user.id,
                    title: "Rollback before pointer claim",
                    plannedMinutes: 25,
                    status: "RUNNING",
                    resumedAt: new Date(),
                },
            });
            rolledBackSessionId = inserted.id;
            throw new Error("simulated interruption between session insert and pointer claim");
        }), /simulated interruption between session insert and pointer claim/);
        assert.equal(await prisma.focusSession.findUnique({ where: { id: rolledBackSessionId } }), null);
        assert.equal((await prisma.user.findUnique({ where: { id: user.id } })).activeFocusSessionId, null);
    } finally {
        if (otherUser) {
            await prisma.focusSession.deleteMany({ where: { userId: otherUser.id } });
            await prisma.user.delete({ where: { id: otherUser.id } });
        }
        await prisma.focusSession.deleteMany({ where: { userId: user.id } });
        await prisma.user.delete({ where: { id: user.id } });
    }
});
