import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import request from "supertest";
import test from "node:test";
import { parseApiConfig } from "../src/config/env.js";
import { createApp } from "../src/app.js";

test("trailing bytes after compressed JSON return a client error without terminating the process", async () => {
    const app = createApp(parseApiConfig({
        NODE_ENV: "test",
        DATABASE_URL: "mongodb://127.0.0.1:27017/focuser_test?replicaSet=rs0",
        JWT_SECRET: "a-test-secret-that-is-at-least-thirty-two-bytes-long",
    }));

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
        const compressed = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Encoding": "gzip",
                "X-Focuser-Client": "web",
            },
            body: trailingGzip,
        });
        const compressedBody = await compressed.json();
        assert.equal(compressed.status, 400, JSON.stringify(compressedBody));
        assert.equal(compressedBody.error.code, "VALIDATION_ERROR");

        const normal = await fetch(url);
        const normalBody = await normal.json();
        assert.equal(normal.status, 404);
        assert.equal(normalBody.error.code, "NOT_FOUND");
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
});
