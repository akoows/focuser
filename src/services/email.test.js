import test from "node:test";
import assert from "node:assert/strict";
import { assertEmailConfigured } from "./email.js";

test("email delivery requires an explicitly configured Resend sender and API key", () => {
    const originalKey = process.env.RESEND_API_KEY;
    const originalFrom = process.env.EMAIL_FROM;
    try {
        delete process.env.RESEND_API_KEY;
        delete process.env.EMAIL_FROM;
        assert.throws(assertEmailConfigured, {
            status: 503,
            code: "EMAIL_NOT_CONFIGURED",
        });
        process.env.RESEND_API_KEY = "configured-test-key";
        process.env.EMAIL_FROM = "Focuser <test@example.com>";
        assert.doesNotThrow(assertEmailConfigured);
    } finally {
        if (originalKey === undefined) delete process.env.RESEND_API_KEY;
        else process.env.RESEND_API_KEY = originalKey;
        if (originalFrom === undefined) delete process.env.EMAIL_FROM;
        else process.env.EMAIL_FROM = originalFrom;
    }
});
