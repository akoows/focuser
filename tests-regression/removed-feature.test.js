import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
import { parseApiConfig } from "../src/config/env.js";
import { prisma } from "../src/lib/prisma.js";

test("retired endpoints stay unavailable and remaining routes keep auth and CSRF", async () => {
    const app = createApp(parseApiConfig({
        NODE_ENV: "test",
        DATABASE_URL: "mongodb://127.0.0.1:27018/focuser_test?replicaSet=rs0",
        JWT_SECRET: "regression-secret-with-at-least-thirty-two-bytes",
    }));
    for (const path of ["/diary", "/diary/today", "/diary/calendar", "/diary/2026-10-24"]) {
        const response = await request(app).get(`/api${path}`);
        assert.equal(response.status, 404);
        assert.equal(response.body.error.code, "NOT_FOUND");
    }
    const write = await request(app).put("/api/diary/today")
        .set("X-Focuser-Client", "web").send({ content: "retired" });
    assert.equal(write.status, 404);
    assert.equal(write.body.error.code, "NOT_FOUND");
    const protectedRoute = await request(app).get("/api/reading/books");
    assert.equal(protectedRoute.status, 401);
    assert.equal(protectedRoute.body.error.code, "UNAUTHENTICATED");
    const csrf = await request(app).post("/api/goals").send({});
    assert.equal(csrf.status, 403);
    assert.equal(csrf.body.error.code, "CSRF_PROTECTION");
    assert.equal(prisma.diaryEntry, undefined);
});
