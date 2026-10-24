import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import test from "node:test";
import { parseApiConfig } from "../src/config/env.js";
import { createApp } from "../src/app.js";
import { AUTH_COOKIE, createAuthToken } from "../src/middlewares/auth.js";
import { prisma } from "../src/lib/prisma.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for gym calendar integration tests.");
const parsedUrl = new URL(databaseUrl);
if (
    parsedUrl.protocol !== "mongodb:"
    || parsedUrl.hostname !== "127.0.0.1"
    || parsedUrl.port !== "27018"
    || parsedUrl.pathname !== "/focuser_test"
    || parsedUrl.searchParams.get("replicaSet") !== "rs0"
) {
    throw new Error("Refusing gym calendar test: DATABASE_URL must target the local focuser_test replica set on port 27018.");
}

process.env.NODE_ENV = "test";
process.env.JWT_SECRET ||= "focuser-isolated-gym-calendar-test-secret";

test("calendar selects the requested local day before its 100-session cap", { timeout: 120_000 }, async () => {
    const runId = randomUUID();
    const timezone = "America/Sao_Paulo";
    const user = await prisma.user.create({
        data: { name: "Gym calendar", email: `gym-calendar-${runId}@focuser.dev`, timezone },
    });
    try {
        const inserted = await prisma.workoutSession.createMany({
            data: [
                ...Array.from({ length: 100 }, () => ({
                    userId: user.id,
                    status: "COMPLETED",
                    startedAt: new Date("2026-10-23T11:00:00.000Z"),
                    completedAt: new Date("2026-10-23T12:00:00.000Z"),
                    exercises: [],
                })),
                {
                    userId: user.id,
                    status: "COMPLETED",
                    startedAt: new Date("2026-10-24T11:00:00.000Z"),
                    completedAt: new Date("2026-10-24T12:00:00.000Z"),
                    exercises: [],
                },
            ],
        });
        assert.equal(inserted.count, 101);
        const app = createApp(parseApiConfig({ ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: "test" }));
        const cookie = `${AUTH_COOKIE}=${createAuthToken(user)}`;
        const response = await request(app).get("/api/gym/calendar/2026-10-24").set("Cookie", cookie);
        assert.equal(response.status, 200);
        assert.equal(response.body.data.items.length, 1);
        assert.equal(response.body.data.items[0].completedAt, "2026-10-24T12:00:00.000Z");
    } finally {
        await prisma.workoutSession.deleteMany({ where: { userId: user.id } });
        await prisma.user.delete({ where: { id: user.id } });
    }
});
