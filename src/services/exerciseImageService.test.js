import test from "node:test";
import assert from "node:assert/strict";
import { lookupExerciseImages } from "./exerciseImageService.js";

function groqResponse(content) {
    return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: JSON.stringify(content) } }] }),
    };
}

function exerciseDbResponse(data) {
    return { ok: true, json: async () => ({ success: true, data }) };
}

test("translates Portuguese exercise names with Groq and returns a matching ExerciseDB image", async (t) => {
    const previousKey = process.env.GROQ_API_KEY;
    const previousModel = process.env.GROQ_MODEL;
    const originalFetch = globalThis.fetch;
    process.env.GROQ_API_KEY = "test-groq-key";
    process.env.GROQ_MODEL = "test-model";
    let exerciseQuery;
    let fetchCount = 0;
    globalThis.fetch = async (input, options) => {
        fetchCount += 1;
        const url = new URL(input);
        if (url.hostname === "api.groq.com") {
            const body = JSON.parse(options.body);
            assert.equal(body.model, "test-model");
            return groqResponse({ queries: [{ index: 0, query: "barbell bench press" }] });
        }
        exerciseQuery = url.searchParams.get("q");
        assert.equal(url.searchParams.get("limit"), "5");
        return exerciseDbResponse([
            { name: "Barbell Bench Press", gifUrl: "https://v1.cdn.exercisedb.dev/media/example.gif" },
            { name: "Push-up", gifUrl: "https://v1.cdn.exercisedb.dev/media/pushup.gif" },
        ]);
    };
    t.after(() => {
        globalThis.fetch = originalFetch;
        if (previousKey === undefined) delete process.env.GROQ_API_KEY;
        else process.env.GROQ_API_KEY = previousKey;
        if (previousModel === undefined) delete process.env.GROQ_MODEL;
        else process.env.GROQ_MODEL = previousModel;
    });

    const result = await lookupExerciseImages(["Supino reto com barra"]);
    assert.equal(exerciseQuery, "barbell bench press");
    assert.deepEqual(await lookupExerciseImages(["Supino reto com barra"]), result);
    assert.equal(fetchCount, 2);
    assert.deepEqual(result, [{
        name: "Supino reto com barra",
        imageUrl: "https://v1.cdn.exercisedb.dev/media/example.gif",
        matchedName: "Barbell Bench Press",
    }]);
});

test("uses original names without Groq and rejects unrelated or unsafe exercise images", async (t) => {
    const previousKey = process.env.GROQ_API_KEY;
    const originalFetch = globalThis.fetch;
    delete process.env.GROQ_API_KEY;
    let exerciseQuery;
    globalThis.fetch = async (input) => {
        const url = new URL(input);
        exerciseQuery = url.searchParams.get("q");
        return exerciseDbResponse(exerciseQuery.startsWith("unsafe")
            ? [{ name: "Unsafe image host 2026", gifUrl: "https://example.com/untrusted.gif" }]
            : [{ name: "Bench Dips", gifUrl: "https://v1.cdn.exercisedb.dev/media/dips.gif" }]);
    };
    t.after(() => {
        globalThis.fetch = originalFetch;
        if (previousKey === undefined) delete process.env.GROQ_API_KEY;
        else process.env.GROQ_API_KEY = previousKey;
    });

    const result = await lookupExerciseImages(["unrelated bench press 2026", "unsafe image host 2026"]);
    assert.deepEqual(result, [
        { name: "unrelated bench press 2026", imageUrl: null, matchedName: null },
        { name: "unsafe image host 2026", imageUrl: null, matchedName: null },
    ]);
});

test("returns an explicit no-image result when ExerciseDB is unavailable", async (t) => {
    const previousKey = process.env.GROQ_API_KEY;
    const originalFetch = globalThis.fetch;
    delete process.env.GROQ_API_KEY;
    globalThis.fetch = async () => ({ ok: false, status: 503 });
    t.after(() => {
        globalThis.fetch = originalFetch;
        if (previousKey === undefined) delete process.env.GROQ_API_KEY;
        else process.env.GROQ_API_KEY = previousKey;
    });

    assert.deepEqual(await lookupExerciseImages(["exercise db unavailable 2026"]), [{
        name: "exercise db unavailable 2026",
        imageUrl: null,
        matchedName: null,
    }]);
});
