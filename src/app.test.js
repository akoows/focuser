import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { gzipSync } from "node:zlib";
import request from "supertest";
import { createApp } from "./app.js";
import { parseApiConfig } from "./config/env.js";
import { createUserRateLimiter } from "./middlewares/rateLimiters.js";

test("removed journal endpoints return route-not-found for reads and writes", async () => {
    const app = createApp(config());
    for (const path of ["/diary", "/diary/today", "/diary/calendar", "/diary/2026-10-24"]) {
        const response = await request(app).get(`/api${path}`);
        assert.equal(response.status, 404);
        assert.equal(response.body.error.code, "NOT_FOUND");
    }
    const response = await request(app).put("/api/diary/today")
        .set("X-Focuser-Client", "web").send({ content: "removed feature" });
    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, "NOT_FOUND");
});

const config = (overrides = {}) => parseApiConfig({
    NODE_ENV: "test",
    DATABASE_URL: "mongodb://127.0.0.1:27017/focuser_test?replicaSet=rs0",
    JWT_SECRET: "a-test-secret-that-is-at-least-thirty-two-bytes-long",
    ...overrides,
});

test("HTTP app allows credentialed web preflight and rejects unknown origins", async () => {
    const app = createApp(config());
    const preflight = await request(app)
        .options("/api/auth/login")
        .set("Origin", "http://localhost:4173")
        .set("Access-Control-Request-Method", "POST")
        .set("Access-Control-Request-Headers", "content-type,x-focuser-client");

    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers["access-control-allow-origin"], "http://localhost:4173");
    assert.equal(preflight.headers["access-control-allow-credentials"], "true");
    assert.match(preflight.headers["access-control-allow-headers"], /x-focuser-client/i);

    const rejected = await request(app).get("/api/not-a-route").set("Origin", "https://unknown.example");
    assert.equal(rejected.status, 403);
    assert.equal(rejected.body.error.code, "CORS_ORIGIN_DENIED");
});

test("HTTP app handles trailing bytes after compressed JSON without stopping the server", async () => {
    const app = createApp(config());
    const server = app.listen(0);
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.once("listening", resolve);
    });

    try {
        const url = `http://127.0.0.1:${server.address().port}/api/not-a-route`;
        const trailingGzip = Buffer.concat([
            gzipSync(Buffer.from('{"value":1}')),
            Buffer.from("trailing bytes"),
        ]);
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Encoding": "gzip",
                "X-Focuser-Client": "web",
            },
            body: trailingGzip,
        });
        const body = await response.json();
        assert.equal(response.status, 400, JSON.stringify(body));
        assert.equal(body.error.code, "VALIDATION_ERROR");

        const normal = await fetch(url);
        assert.equal(normal.status, 404);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
});


test("HTTP app enforces CSRF header and configurable global rate limit without database access", async () => {
    const app = createApp(config({ RATE_LIMIT_GLOBAL_MAX: "3" }));
    const missingCsrf = await request(app).post("/api/not-a-route");
    assert.equal(missingCsrf.status, 403);
    assert.equal(missingCsrf.body.error.code, "CSRF_PROTECTION");

    const first = await request(app).get("/api/not-a-route");
    const second = await request(app).get("/api/not-a-route");
    const third = await request(app).get("/api/not-a-route");
    assert.equal(first.status, 404);
    assert.equal(second.status, 404);
    assert.equal(third.status, 429);
    assert.equal(third.body.error.code, "RATE_LIMITED");
});

test("user rate limit is isolated per authenticated user", async () => {
    const app = express();
    app.locals.rateLimits = { aiPerHour: 1 };
    app.use((req, _res, next) => {
        req.user = { id: req.get("X-Test-User") };
        next();
    });
    app.use(createUserRateLimiter("aiPerHour"));
    app.get("/", (_req, res) => res.sendStatus(200));

    assert.equal((await request(app).get("/").set("X-Test-User", "user-one")).status, 200);
    assert.equal((await request(app).get("/").set("X-Test-User", "user-one")).status, 429);
    assert.equal((await request(app).get("/").set("X-Test-User", "user-two")).status, 200);
});
