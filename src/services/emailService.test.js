import test from "node:test";
import assert from "node:assert/strict";
import { assertEmailConfigured, sendAuthCode } from "./emailService.js";

const envKeys = ["RESEND_API_KEY", "RESEND_FROM"];

function setEmailEnv(t) {
    const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM = "Focuser <noreply@example.com>";
    t.after(() => {
        for (const key of envKeys) {
            if (previous[key] === undefined) delete process.env[key];
            else process.env[key] = previous[key];
        }
    });
}

test("email authentication codes are sent through Resend", async (t) => {
    setEmailEnv(t);
    const originalFetch = globalThis.fetch;
    let request;
    globalThis.fetch = async (url, options) => {
        request = { url, options };
        return { ok: true, status: 200 };
    };
    t.after(() => { globalThis.fetch = originalFetch; });

    await sendAuthCode({ to: "user@example.com", code: "012345", purpose: "login" });
    assert.equal(request.url, "https://api.resend.com/emails");
    assert.equal(request.options.headers.Authorization, "Bearer test-resend-key");
    assert.deepEqual(JSON.parse(request.options.body).to, ["user@example.com"]);
    assert.match(JSON.parse(request.options.body).text, /012345/);
});

test("email delivery configuration and provider failures are reported", async (t) => {
    const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM;
    t.after(() => {
        for (const key of envKeys) {
            if (previous[key] === undefined) delete process.env[key];
            else process.env[key] = previous[key];
        }
    });
    assert.throws(assertEmailConfigured, { status: 503, code: "EMAIL_NOT_CONFIGURED" });

    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM = "Focuser <noreply@example.com>";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: false, status: 503 });
    t.after(() => { globalThis.fetch = originalFetch; });
    await assert.rejects(sendAuthCode({
        to: "user@example.com",
        code: "012345",
        purpose: "email-verification",
    }), { status: 503, code: "EMAIL_DELIVERY_FAILED" });
});
