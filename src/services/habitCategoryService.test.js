import test from "node:test";
import assert from "node:assert/strict";
import { categorizeHabit } from "./habitCategoryService.js";

test("habit categorization returns only a supported Groq category", async (t) => {
    const previousKey = process.env.GROQ_API_KEY;
    const previousModel = process.env.GROQ_MODEL;
    const originalFetch = globalThis.fetch;
    process.env.GROQ_API_KEY = "test-groq-key";
    process.env.GROQ_MODEL = "test-model";
    globalThis.fetch = async (_url, options) => {
        assert.equal(options.headers.Authorization, "Bearer test-groq-key");
        return {
            ok: true,
            json: async () => ({ choices: [{ message: { content: '{"category":"Estudos"}' } }] }),
        };
    };
    t.after(() => {
        globalThis.fetch = originalFetch;
        if (previousKey === undefined) delete process.env.GROQ_API_KEY;
        else process.env.GROQ_API_KEY = previousKey;
        if (previousModel === undefined) delete process.env.GROQ_MODEL;
        else process.env.GROQ_MODEL = previousModel;
    });

    assert.equal(await categorizeHabit("Ler", "Ler por 20 minutos"), "Estudos");
});

test("habit categorization surfaces missing configuration and invalid provider output", async (t) => {
    const previousKey = process.env.GROQ_API_KEY;
    const originalFetch = globalThis.fetch;
    delete process.env.GROQ_API_KEY;
    t.after(() => {
        globalThis.fetch = originalFetch;
        if (previousKey === undefined) delete process.env.GROQ_API_KEY;
        else process.env.GROQ_API_KEY = previousKey;
    });
    await assert.rejects(categorizeHabit("Ler", ""), {
        status: 503,
        code: "GROQ_NOT_CONFIGURED",
    });

    process.env.GROQ_API_KEY = "test-groq-key";
    globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"category":"Unknown"}' } }] }),
    });
    await assert.rejects(categorizeHabit("Ler", ""), {
        status: 502,
        code: "GROQ_INVALID_CATEGORY",
    });
});
