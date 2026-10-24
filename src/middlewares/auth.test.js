import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { createAuthToken } from "./auth.js";

test("JWT signing uses the current configured secret and documented lifetime", (t) => {
    const previous = {
        secret: process.env.JWT_SECRET,
        days: process.env.JWT_EXPIRES_IN_DAYS,
        legacyExpiry: process.env.JWT_EXPIRES_IN,
    };
    process.env.JWT_SECRET = "a-test-secret-that-is-at-least-thirty-two-bytes-long";
    process.env.JWT_EXPIRES_IN_DAYS = "2";
    delete process.env.JWT_EXPIRES_IN;
    t.after(() => {
        if (previous.secret === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = previous.secret;
        if (previous.days === undefined) delete process.env.JWT_EXPIRES_IN_DAYS;
        else process.env.JWT_EXPIRES_IN_DAYS = previous.days;
        if (previous.legacyExpiry === undefined) delete process.env.JWT_EXPIRES_IN;
        else process.env.JWT_EXPIRES_IN = previous.legacyExpiry;
    });

    const token = createAuthToken({ id: "test-user", tokenVersion: 3 });
    const claims = jwt.verify(token, process.env.JWT_SECRET);
    assert.equal(claims.sub, "test-user");
    assert.equal(claims.tokenVersion, 3);
    assert.equal(claims.exp - claims.iat, 2 * 24 * 60 * 60);
});
