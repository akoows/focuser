import test from "node:test";
import assert from "node:assert/strict";
import { clearAuthCookie, setAuthCookie } from "./authCookie.js";

test("auth cookie creation and clearing use matching security attributes and lifetime", () => {
    const calls = {};
    const response = {
        cookie: (name, token, options) => { calls.set = { name, token, options }; },
        clearCookie: (name, options) => { calls.clear = { name, options }; },
    };
    const env = {
        NODE_ENV: "production",
        JWT_SECRET: "a-test-secret-that-is-at-least-thirty-two-bytes-long",
        JWT_EXPIRES_IN_DAYS: "3",
        COOKIE_SAMESITE: "none",
        COOKIE_SECURE: "true",
    };

    setAuthCookie(response, "opaque-test-token", env);
    clearAuthCookie(response, env);

    assert.equal(calls.set.name, "focuser_token");
    assert.equal(calls.set.token, "opaque-test-token");
    assert.deepEqual(calls.set.options, {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        path: "/",
        maxAge: 3 * 24 * 60 * 60 * 1000,
    });
    assert.deepEqual(calls.clear, {
        name: calls.set.name,
        options: {
            httpOnly: true,
            secure: true,
            sameSite: "none",
            path: "/",
        },
    });
});
