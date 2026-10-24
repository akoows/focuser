// Independent regression scenarios; external providers are mocked.
import test from "node:test";
import assert from "node:assert/strict";

{ // services/workoutStatsService
const { calculateWorkoutStats, countCompletedSessionsByDate } = await import("../src/services/workoutStatsService.js");

const sessions = [
    {
        id: "finished",
        status: "COMPLETED",
        planName: "Treino A",
        completedAt: new Date("2026-06-15T10:00:00.000Z"),
        exercises: [{
            name: "Agachamento",
            sets: [
                { weight: 100, reps: 5, completed: true },
                { weight: 80, reps: 8, completed: true },
                { weight: 200, reps: 0, completed: true },
                { weight: 150, reps: 2, completed: false },
            ],
        }],
    },
    {
        id: "abandoned",
        status: "ABANDONED",
        completedAt: new Date("2026-06-16T10:00:00.000Z"),
        exercises: [{ name: "Agachamento", sets: [{ weight: 300, reps: 1, completed: true }] }],
    },
];

test("calcula médias de repetições, carga máxima e estimativa apenas com séries concluídas válidas", () => {
    const result = calculateWorkoutStats(sessions);

    assert.equal(result.sessionsTotal, 1);
    assert.equal(result.totalCompletedSets, 2);
    assert.equal(result.totalVolume, 1_140);
    assert.equal(result.averageReps, 6.5);
    assert.equal(result.exercises[0].bestWeight, 100);
    assert.equal(result.exercises[0].bestRepSet.weight, 80);
    assert.equal(result.exercises[0].bestRepSet.reps, 8);
    assert.equal(result.exercises[0].bestSet.weight, 100);
    assert.equal(result.exercises[0].bestSet.reps, 5);
    assert.equal(result.exercises[0].bestSet.estimatedOneRepMax, 100 * (1 + 5 / 30));
    assert.equal(result.repetitionsBySession.length, 1);
    assert.equal(result.repetitionsBySession[0].averageReps, 6.5);
    assert.equal(result.repetitionsByWeek[0].averageReps, 6.5);
    assert.equal(result.repetitionsByMonth[0].sessions, 1);
    assert.equal(result.volumeBySession[0].volume, 1_140);
    assert.equal(result.volumeByWeek[0].volume, 1_140);
    assert.equal(result.volumeByMonth[0].volume, 1_140);
    assert.equal(result.exercises[0].history[0].volume, 1_140);
});

test("não estima 1RM sem uma série válida nem conta sessões abandonadas no calendário", () => {
    const noEstimate = [{
        ...sessions[0],
        exercises: [{
            name: "Corrida",
            sets: [{ weight: 0, reps: 10, completed: true }],
        }],
    }];
    assert.equal(calculateWorkoutStats(noEstimate).exercises[0].bestSet, null);
    const singleRep = [{
        ...sessions[0],
        exercises: [{ name: "Supino", sets: [{ weight: 100, reps: 1, completed: true }] }],
    }];
    assert.equal(calculateWorkoutStats(singleRep).exercises[0].bestSet.estimatedOneRepMax, 100);

    const counts = countCompletedSessionsByDate(sessions, () => "2026-06-15");
    assert.equal(counts.get("2026-06-15"), 1);
});

test("não mostra média de repetições para sessões sem séries concluídas", () => {
    const result = calculateWorkoutStats([{
        id: "empty",
        status: "COMPLETED",
        completedAt: new Date("2026-06-15T10:00:00.000Z"),
        exercises: [],
    }]);

    assert.equal(result.sessionsTotal, 1);
    assert.equal(result.averageReps, null);
    assert.equal(result.totalVolume, 0);
    assert.equal(result.repetitionsBySession.length, 0);
    assert.equal(result.repetitionsByWeek.length, 0);
    assert.equal(result.repetitionsByMonth.length, 0);
    assert.equal(result.volumeBySession.length, 0);
    assert.equal(result.volumeByWeek.length, 0);
    assert.equal(result.volumeByMonth.length, 0);
});

}

{ // services/workoutSessionStateService
const { buildWorkoutEndUpdate } = await import("../src/services/workoutSessionStateService.js");

test("permite concluir ou abandonar somente uma sessão em andamento", () => {
    const timestamp = new Date("2026-07-10T15:30:00.000Z");
    const active = { status: "IN_PROGRESS" };

    assert.deepEqual(buildWorkoutEndUpdate(active, "COMPLETED", timestamp), {
        status: "COMPLETED",
        completedAt: timestamp,
    });
    assert.deepEqual(buildWorkoutEndUpdate(active, "ABANDONED", timestamp), {
        status: "ABANDONED",
        abandonedAt: timestamp,
    });
    assert.throws(() => buildWorkoutEndUpdate({ status: "COMPLETED" }, "COMPLETED"), {
        code: "INVALID_WORKOUT_STATE",
    });
    assert.throws(() => buildWorkoutEndUpdate(active, "IN_PROGRESS"), {
        code: "VALIDATION_ERROR",
    });
});

}

{ // services/exerciseImageService
const { lookupExerciseImages } = await import("../src/services/exerciseImageService.js");

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

}

{
const {lookupExerciseImages}=await import('../src/services/exerciseImageService.js');
function noGroq(t){const old=process.env.GROQ_API_KEY;delete process.env.GROQ_API_KEY;t.after(()=>{if(old!==undefined)process.env.GROQ_API_KEY=old;});}
for (const [kind,ttl] of [['positive',24*60*60*1000],['negative',30*60*1000]]) test(`exercise cache ${kind} expires at exactly ${ttl}ms`,async t=>{
    noGroq(t); let now=Date.now();t.mock.method(Date,'now',()=>now);let calls=0;const name=`cache ${kind} expiry`;
    t.mock.method(globalThis,'fetch',async()=>{calls++;return {ok:true,json:async()=>({data:kind==='positive'?[{name,gifUrl:'https://v1.cdn.exercisedb.dev/cache.gif'}]:[]})};});
    const first=await lookupExerciseImages([name]);assert.equal(calls,1);
    assert.equal(first[0].imageUrl!==null,kind==='positive');
    now+=ttl-1;assert.deepEqual(await lookupExerciseImages([name]),first);assert.equal(calls,1);
    now++;await lookupExerciseImages([name]);assert.equal(calls,2);
});
test('ExerciseDB requests run with at most four concurrent lookups and preserve input order',async t=>{
    noGroq(t);let active=0,peak=0;const names=Array.from({length:13},(_,i)=>`parallel exercise ${i}`);
    t.mock.method(globalThis,'fetch',async url=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>setImmediate(resolve));active--;const name=new URL(url).searchParams.get('q');return {ok:true,json:async()=>({data:[{name,gifUrl:'https://v1.cdn.exercisedb.dev/parallel.gif'}]})};});
    const result=await lookupExerciseImages(names);assert.equal(peak,4);assert.deepEqual(result.map(x=>x.name),names);assert.ok(result.every(x=>x.imageUrl));
});
test('normalized duplicate names make one lookup',async t=>{
    noGroq(t);let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return {ok:true,json:async()=>({data:[]})};});
    assert.equal((await lookupExerciseImages(['dedupe agachamento','DEDUPE AGACHAMENTO'])).length,2);assert.equal(calls,1);
});
for(const url of ['http://v1.cdn.exercisedb.dev/a.gif','https://v1.cdn.exercisedb.dev.evil.example/a.gif','javascript:alert(1)']) test(`exercise image rejects unsafe URL ${url}`,async t=>{
    noGroq(t);const name=`unsafe url ${url}`;t.mock.method(globalThis,'fetch',async()=>({ok:true,json:async()=>({data:[{name,gifUrl:url}]})}));assert.equal((await lookupExerciseImages([name]))[0].imageUrl,null);
});
for(const response of ['broken','network']) test(`exercise translation ${response} falls back to the original query`,async t=>{
    const key=process.env.GROQ_API_KEY;process.env.GROQ_API_KEY='key';t.after(()=>{if(key===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=key;});
    const name=`translation fallback ${response}`;let query;
    t.mock.method(globalThis,'fetch',async url=>{if(new URL(url).hostname==='api.groq.com'){if(response==='network')throw new TypeError('offline');return {ok:true,json:async()=>({choices:[]})};}query=new URL(url).searchParams.get('q');return {ok:true,json:async()=>({data:[]})};});
    await lookupExerciseImages([name]);assert.equal(query,name);
});
}

{
const {buildWorkoutEndUpdate}=await import('../src/services/workoutSessionStateService.js');
for(const current of ['COMPLETED','ABANDONED'])for(const target of ['COMPLETED','ABANDONED'])test(`terminal workout ${current} rejects transition to ${target}`,()=>{
    const session={status:current};assert.throws(()=>buildWorkoutEndUpdate(session,target),{code:'INVALID_WORKOUT_STATE'});assert.deepEqual(session,{status:current});
});
const {lookupExerciseImages}=await import('../src/services/exerciseImageService.js');
test('untrusted exercise names remain encoded query data on a fixed provider origin',async t=>{
    const old=process.env.GROQ_API_KEY;delete process.env.GROQ_API_KEY;t.after(()=>{if(old!==undefined)process.env.GROQ_API_KEY=old;});
    const name='https://evil.example/?q=x&limit=999#fragment';
    t.mock.method(globalThis,'fetch',async input=>{const url=new URL(input);assert.equal(url.origin,'https://exercisedb.dev');assert.equal(url.searchParams.get('q'),name);assert.equal(url.searchParams.get('limit'),'5');return {ok:true,json:async()=>({data:[]})};});
    assert.deepEqual(await lookupExerciseImages([name]),[{name,imageUrl:null,matchedName:null}]);
});
}
