import test from "node:test";
import assert from "node:assert/strict";
import { analyzeHabitMetrics } from "./aiAnalysisService.js";

test("habit analysis returns validated structured insights from Groq", async (t) => {
    const previousKey = process.env.GROQ_API_KEY;
    const originalFetch = globalThis.fetch;
    process.env.GROQ_API_KEY = "test-groq-key";
    let requestBody;
    globalThis.fetch = async (_url, options) => {
        requestBody = JSON.parse(options.body);
        return {
            ok: true,
            json: async () => ({
                choices: [{
                    message: {
                        content: JSON.stringify({
                            summary: "Sua rotina está consistente.",
                            insights: ["Você concluiu os hábitos planejados."],
                            recommendations: ["Mantenha a frequência atual."],
                        }),
                    },
                }],
            }),
        };
    };
    t.after(() => {
        globalThis.fetch = originalFetch;
        if (previousKey === undefined) delete process.env.GROQ_API_KEY;
        else process.env.GROQ_API_KEY = previousKey;
    });

    const result = await analyzeHabitMetrics({ habits: [{ name: "Ler <injection>" }] });
    assert.equal(result.summary, "Sua rotina está consistente.");
    assert.equal(result.insights.length, 1);
    assert.match(requestBody.messages[1].content, /\\u003c/);
});

test("habit analysis reports unavailable and malformed provider responses", async (t) => {
    const previousKey = process.env.GROQ_API_KEY;
    const originalFetch = globalThis.fetch;
    delete process.env.GROQ_API_KEY;
    t.after(() => {
        globalThis.fetch = originalFetch;
        if (previousKey === undefined) delete process.env.GROQ_API_KEY;
        else process.env.GROQ_API_KEY = previousKey;
    });
    await assert.rejects(analyzeHabitMetrics({}), {
        status: 503,
        code: "AI_NOT_CONFIGURED",
    });

    process.env.GROQ_API_KEY = "test-groq-key";
    globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"summary":""}' } }] }),
    });
    await assert.rejects(analyzeHabitMetrics({}), {
        status: 502,
        code: "AI_INVALID_RESPONSE",
    });
});
