import test from "node:test";
import assert from "node:assert/strict";
import { createAuthCode, hashAuthCode } from "./authChallenges.js";

test("authentication codes are six digits and stored as keyed digests", () => {
    const originalSecret = process.env.JWT_SECRET;
    try {
        process.env.JWT_SECRET = "test-secret-that-is-at-least-thirty-two-bytes";
        const code = createAuthCode();
        assert.match(code, /^\d{6}$/);
        assert.match(hashAuthCode(code), /^[\da-f]{64}$/);
        assert.equal(hashAuthCode(code), hashAuthCode(code));
        assert.notEqual(hashAuthCode(code), hashAuthCode("000000"));
    } finally {
        if (originalSecret === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = originalSecret;
    }
});
