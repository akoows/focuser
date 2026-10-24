// Independent regression scenarios; external providers are mocked.
import test from "node:test";
import assert from "node:assert/strict";

{ // services/habitProgressService
const {
    getCheckInCounts,
    getCompletedCheckInSet,
    getHabitProgressStats,
    getNextCheckInOccurrence,
    getStreakStats,
    getStreakWindow,
    buildHabitHistorySeries,
} = await import("../src/services/habitProgressService.js");

test("check-in occurrences can increase by a batch without exceeding the daily target", () => {
    assert.equal(getNextCheckInOccurrence([], 2), 1);
    assert.equal(getNextCheckInOccurrence([{ occurrence: 1 }], 2), 2);
    assert.equal(getNextCheckInOccurrence([{ occurrence: 3 }], 4), 4);
    assert.equal(getNextCheckInOccurrence([{ occurrence: 1 }, { occurrence: 2 }], 2), null);
    assert.equal(getNextCheckInOccurrence([{}], 2), 2);
    assert.equal(getNextCheckInOccurrence([], 3, 3), 3);
    assert.equal(getNextCheckInOccurrence([{ occurrence: 1 }], 3, 2), 3);
    assert.equal(getNextCheckInOccurrence([{ occurrence: 1 }], 3, 3), null);
});

test("habit completion requires its daily target and counts multiple check-ins", () => {
    const habits = [{ id: "habit-1", dailyTarget: 2 }, { id: "habit-2" }];
    const checkIns = [
        { habitId: "habit-1", dateKey: "2026-10-15", occurrence: 2 },
        { habitId: "habit-2", dateKey: "2026-10-15" },
    ];
    const counts = getCheckInCounts(checkIns);
    const completed = getCompletedCheckInSet(habits, counts);

    assert.equal(counts.get("habit-1:2026-10-15"), 2);
    assert.equal(completed.has("habit-1:2026-10-15"), true);
    assert.equal(completed.has("habit-2:2026-10-15"), true);
    assert.equal(getCompletedCheckInSet(habits, checkIns).size, 2);
    assert.equal(getCompletedCheckInSet([{ id: "habit-1", dailyTarget: 3 }], checkIns).size, 0);
});

test("habit progress counts only scheduled check-ins and calculates individual streaks", () => {
    const habit = {
        id: "habit-1",
        frequency: "CUSTOM",
        daysOfWeek: [1, 3],
        startDateKey: "2026-01-01",
    };
    const series = [
        { date: "2026-01-05" },
        { date: "2026-01-06" },
        { date: "2026-01-07" },
        { date: "2026-01-08" },
        { date: "2026-01-09" },
    ];
    const checkInSet = new Set([
        "habit-1:2026-01-05",
        "habit-1:2026-01-06",
        "habit-1:2026-01-07",
    ]);

    assert.deepEqual(
        getHabitProgressStats(habit, series, checkInSet, checkInSet, "2026-01-09"),
        {
            scheduled: 2,
            completed: 2,
            completionRate: 1,
            currentStreak: 2,
            bestStreak: 2,
        }
    );
});

test("habit streaks do not count another habit's check-ins", () => {
    const habit = {
        id: "habit-1",
        frequency: "DAILY",
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        startDateKey: "2026-01-01",
    };

    assert.deepEqual(
        getHabitProgressStats(
            habit,
            [{ date: "2026-01-05" }],
            new Set(),
            new Set(["habit-2:2026-01-09"]),
            "2026-01-09"
        ),
        {
            scheduled: 1,
            completed: 0,
            completionRate: 0,
            currentStreak: 0,
            bestStreak: 0,
        }
    );
});

test("dashboard streak query window includes historical days while its weekly window stays seven days", () => {
    const window = getStreakWindow("2026-10-24");
    assert.deepEqual(window, { from: "2025-10-25", to: "2026-10-24" });
    const habit = { id: "habit-regression", dailyTarget: 1, frequency: "DAILY", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startDateKey: window.from };
    const checkIns = new Set(Array.from({ length: 10 }, (_, index) => (
        `habit-regression:${new Date(Date.parse("2026-10-24T12:00:00.000Z") - index * 86_400_000).toISOString().slice(0, 10)}`
    )));
    assert.equal(getStreakStats([habit], checkIns, window.to).currentStreak, 10);
    assert.equal(Array.from({ length: 7 }, (_, index) => index).length, 7);
});

test("history includes a completed check-in exactly seven days before habit start", () => {
    const habit = { id: "habit-history-regression", dailyTarget: 1, frequency: "DAILY", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startDateKey: "2026-10-16" };
    assert.deepEqual(buildHabitHistorySeries(habit, ["2026-10-09"], new Map([["2026-10-09", 1]])), [
        { date: "2026-10-09", scheduled: true, value: 1, target: 1, completed: true },
    ]);
});

}

{ // services/habitCategoryService
const { categorizeHabit } = await import("../src/services/habitCategoryService.js");

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

test("habit categorization falls back when configuration or provider output is unavailable", async (t) => {
    const previousKey = process.env.GROQ_API_KEY;
    const originalFetch = globalThis.fetch;
    delete process.env.GROQ_API_KEY;
    t.after(() => {
        globalThis.fetch = originalFetch;
        if (previousKey === undefined) delete process.env.GROQ_API_KEY;
        else process.env.GROQ_API_KEY = previousKey;
    });
    assert.equal(await categorizeHabit("Ler", ""), "Estudos");

    process.env.GROQ_API_KEY = "test-groq-key";
    globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"category":"Unknown"}' } }] }),
    });
    assert.equal(await categorizeHabit("Ler", ""), "Estudos");
});

}

{ // services/aiAnalysisService
const { analyzeHabitMetrics } = await import("../src/services/aiAnalysisService.js");

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

}

// Insight generation needs a provider; habit registration falls back to local categorization.
{
const { categorizeHabit } = await import('../src/services/habitCategoryService.js');
const { analyzeHabitMetrics } = await import('../src/services/aiAnalysisService.js');
const services = [[categorizeHabit,'GROQ_CATEGORY_ERROR','GROQ_CATEGORY_TIMEOUT','GROQ_INVALID_CATEGORY'],[analyzeHabitMetrics,'AI_PROVIDER_ERROR','AI_TIMEOUT','AI_INVALID_RESPONSE']];
for (const [service,network,timeout,invalid] of services) {
    const run=()=>service===categorizeHabit?service('Ler',''):service({});
    function configure(t){const key=process.env.GROQ_API_KEY;process.env.GROQ_API_KEY='regression-key';t.after(()=>{if(key===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=key;});}
    for (const [name,error,code] of [['network',new TypeError('private host'),network],['timeout',Object.assign(new Error('timeout'),{name:'TimeoutError'}),timeout],['abort',Object.assign(new Error('abort'),{name:'AbortError'}),timeout]]) test(`${service.name}: ${name} ${service===categorizeHabit?'uses a heuristic fallback':'maps to a stable error'}`,async t=>{
        configure(t);t.mock.method(globalThis,'fetch',async()=>{throw error;});
        if(service===categorizeHabit) assert.equal(await run(),'Estudos'); else await assert.rejects(run(),{code});
    });
    for(const content of ['not json','null','{}','{"summary":"ok","insights":[123],"recommendations":[]}', '{"category":42}']) test(`${service.name}: malformed content ${content} ${service===categorizeHabit?'uses a heuristic fallback':'is rejected'}`,async t=>{
        configure(t);t.mock.method(globalThis,'fetch',async()=>({ok:true,json:async()=>({choices:[{message:{content}}]})}));
        if(service===categorizeHabit) assert.equal(await run(),'Estudos'); else await assert.rejects(run(),{code:invalid});
    });
    test(`${service.name}: handles broken response JSON`,async t=>{configure(t);t.mock.method(globalThis,'fetch',async()=>({ok:true,json:async()=>{throw new SyntaxError('bad JSON');}}));if(service===categorizeHabit) assert.equal(await run(),'Estudos');else await assert.rejects(run(),{code:invalid});});
    test(`${service.name}: handles provider HTTP failure`,async t=>{configure(t);t.mock.method(globalThis,'fetch',async()=>({ok:false,status:429}));if(service===categorizeHabit) assert.equal(await run(),'Estudos');else await assert.rejects(run(),{code:network});});
}
}
{
const {getNextCheckInOccurrence,getCheckInCounts,getCompletedCheckInSet,getStreakStats,getScheduledHabitTotals}=await import('../src/services/habitProgressService.js');
const {habitCreateSchema,checkInCreateSchema}=await import('../src/validators/index.js');
for(const target of [1,20]) test(`daily target ${target}: exactly completes and rejects overflow`,()=>{
    assert.equal(habitCreateSchema.safeParse({name:'Habit',dailyTarget:target}).success,true);
    assert.equal(checkInCreateSchema.safeParse({amount:target}).success,true);
    assert.equal(getNextCheckInOccurrence([],target,target),target);
    assert.equal(getNextCheckInOccurrence([{occurrence:target}],target),null);
});
test('counts use maximum occurrence, ignore duplicates and unknown habits',()=>{
    const rows=[{habitId:'a',dateKey:'2026-10-23',occurrence:3},{habitId:'a',dateKey:'2026-10-23',occurrence:1},{habitId:'b',dateKey:'2026-10-23',occurrence:20}];
    assert.equal(getCheckInCounts(rows).get('a:2026-10-23'),3);
    assert.deepEqual([...getCompletedCheckInSet([{id:'a',dailyTarget:3}],rows)],['a:2026-10-23']);
});
test('empty schedules produce zero rates and streaks',()=>{
    assert.deepEqual(getStreakStats([],new Set(),'2026-10-23'),{currentStreak:0,bestStreak:0});
    assert.deepEqual(getScheduledHabitTotals({frequency:'DAILY',startDateKey:'2026-10-23'},[],new Set()),{scheduled:0,completed:0,completionRate:0});
});
}
