import test from "node:test";
import assert from "node:assert/strict";
import { sendError } from "./apiResponse.js";

test("internal API errors return a generic response and log no raw error message", (t) => {
    const output = {};
    const originalConsoleError = console.error;
    console.error = (...args) => { output.args = args; };
    t.after(() => { console.error = originalConsoleError; });

    const response = {
        status(code) {
            output.status = code;
            return this;
        },
        json(body) {
            output.body = body;
            return this;
        },
    };
    const error = new Error("mongodb://username:private-password@database.example/focuser");
    error.code = "P5000";

    sendError(response, error);

    assert.equal(output.status, 500);
    assert.equal(output.body.error.code, "INTERNAL_ERROR");
    assert.equal(output.body.error.message, "Ocorreu um erro interno.");
    assert.equal(JSON.stringify(output.args).includes("private-password"), false);
    assert.deepEqual(output.args[1], { name: "Error", code: "P5000" });
});

test("unsupported content encoding returns a safe 415 response", () => {
    const output = {};
    const response = {
        status(code) { output.status = code; return this; },
        json(body) { output.body = body; return this; },
    };

    sendError(response, { status: 415, type: "encoding.unsupported", message: "private parser details" });

    assert.equal(output.status, 415);
    assert.deepEqual(output.body, {
        success: false,
        error: { code: "UNSUPPORTED_CONTENT_ENCODING", message: "Este servidor não aceita requisições comprimidas." },
    });
    assert.doesNotMatch(JSON.stringify(output.body), /private parser details/);
});
