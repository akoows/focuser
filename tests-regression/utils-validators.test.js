// Independent regression scenarios; external providers are mocked.
import test from "node:test";
import assert from "node:assert/strict";

{ // utils/date
const {
    dateKeyInTimezone,
    dateKeyStartInTimezone,
    dateRange,
    isDateKey,
    isHabitScheduled,
    startOfWeek,
} = await import("../src/utils/date.js");

test("date keys are validated as real calendar dates", () => {
    assert.equal(isDateKey("2026-10-12"), true);
    assert.equal(isDateKey("2026-02-30"), false);
    assert.equal(isDateKey("12-10-2026"), false);
});

test("timezone-local date boundary spans the DST-shortened calendar day", () => {
    assert.equal(dateKeyStartInTimezone("2026-03-08", "America/New_York").toISOString(), "2026-03-08T05:00:00.000Z");
    assert.equal(dateKeyStartInTimezone("2026-03-09", "America/New_York").toISOString(), "2026-03-09T04:00:00.000Z");
});

test("date key respects the user's timezone around UTC midnight", () => {
    const afterUtcMidnight = new Date("2026-10-13T02:30:00.000Z");
    assert.equal(dateKeyInTimezone(afterUtcMidnight, "America/Sao_Paulo"), "2026-10-12");
});

test("date ranges include both ends and reject oversized intervals", () => {
    assert.deepEqual(dateRange("2026-10-10", "2026-10-12"), [
        "2026-10-10",
        "2026-10-11",
        "2026-10-12",
    ]);
    assert.throws(() => dateRange("2024-01-01", "2025-01-01"), /366 dias/);
});

test("weekly ranges always start Monday and include Sunday", () => {
    assert.equal(startOfWeek("2026-10-12"), "2026-10-12");
    assert.equal(startOfWeek("2026-10-15"), "2026-10-12");
    assert.equal(startOfWeek("2026-10-18"), "2026-10-12");
    assert.deepEqual(dateRange(startOfWeek("2026-10-15"), "2026-10-18"), [
        "2026-10-12",
        "2026-10-13",
        "2026-10-14",
        "2026-10-15",
        "2026-10-16",
        "2026-10-17",
        "2026-10-18",
    ]);
});

test("custom habits allow scheduled weekdays up to seven days before their start", () => {
    const habit = {
        frequency: "CUSTOM",
        daysOfWeek: [1, 3],
        startDateKey: "2026-10-16",
    };
    assert.equal(isHabitScheduled(habit, "2026-10-12"), true);
    assert.equal(isHabitScheduled(habit, "2026-10-13"), false);
    assert.equal(isHabitScheduled(habit, "2026-10-08"), false);
    assert.equal(isHabitScheduled(habit, "2026-10-19"), true);
});

test("daily habits are considered scheduled through seven days before their start", () => {
    const habit = {
        frequency: "DAILY",
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        startDateKey: "2026-10-16",
    };
    assert.equal(isHabitScheduled(habit, "2026-10-09"), true);
    assert.equal(isHabitScheduled(habit, "2026-10-08"), false);
    assert.equal(isHabitScheduled(habit, "2026-10-16"), true);
});

}

{ // utils/apiResponse
const { sendError } = await import("../src/utils/apiResponse.js");

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

}

{ // validators/index
const {
    focusSessionCreateSchema,
    exerciseImagesSchema,
    habitCreateSchema,
    habitUpdateSchema,
    checkInCreateSchema,
    checkInRemoveSchema,
    goalCreateSchema,
    goalProgressSchema,
    goalUpdateSchema,
    parse,
    readingBookCreateSchema,
    readingBookUpdateSchema,
    readingFocusStartSchema,
    readingFocusStopSchema,
    readingLogCreateSchema,
    isbnLookupSchema,
    aiAnalyzeSchema,
    friendRequestCreateSchema,
    passwordChangeStartSchema,
    passwordChangeVerifySchema,
    registerSchema,
    publicUsernameParamSchema,
    updateUserSchema,
} = await import("../src/validators/index.js");

test("profile accent colors are strictly validated", () => {
    assert.deepEqual(parse(updateUserSchema, { accentColor: "#93C5FD" }), { accentColor: "#93C5FD" });
    assert.throws(() => parse(updateUserSchema, { accentColor: "blue" }), { status: 400, code: "VALIDATION_ERROR" });
});

test("app appearance settings validate accent colors and saved presets", () => {
    const preset = { id: "53a3d83f-5bc4-481c-a366-e414911ac8fb", name: " Azul noturno ", color: "#1020fF" };
    assert.deepEqual(parse(updateUserSchema, {
        appAccentColor: "#93C5FD",
        appColorPresets: [preset],
    }), {
        appAccentColor: "#93C5FD",
        appColorPresets: [{ ...preset, name: "Azul noturno" }],
    });
    assert.throws(() => parse(updateUserSchema, { appAccentColor: "blue" }), { status: 400, code: "VALIDATION_ERROR" });
    assert.throws(() => parse(updateUserSchema, {
        appColorPresets: [{ ...preset, color: "blue" }],
    }), { status: 400, code: "VALIDATION_ERROR" });
    assert.throws(() => parse(updateUserSchema, {
        appColorPresets: [{ ...preset, name: "x".repeat(33) }],
    }), { status: 400, code: "VALIDATION_ERROR" });
    assert.throws(() => parse(updateUserSchema, {
        appColorPresets: [{ ...preset, userId: "another-user" }],
    }), { status: 400, code: "VALIDATION_ERROR" });
});


test("profile and registration validators support public profiles and verified image uploads", () => {
    assert.deepEqual(parse(updateUserSchema, {
        username: "User.Name",
        bio: null,
        currentBookId: null,
    }), {
        username: "user.name",
        bio: null,
        currentBookId: null,
    });
    assert.deepEqual(parse(registerSchema, {
        name: "A User",
        username: "a.user",
        email: "a@example.com",
        password: "a-long-password",
        avatarUploadId: "0123456789abcdef01234567",
        avatarUrl: "https://res.cloudinary.com/example/image/upload/avatar.webp",
    }).username, "a.user");
    assert.throws(() => parse(registerSchema, {
        name: "A User",
        email: "a@example.com",
        password: "a-long-password",
    }), { status: 400, code: "VALIDATION_ERROR" });
});

test("one-time code and AI analysis validators reject malformed requests", () => {
    assert.deepEqual(parse(passwordChangeStartSchema, {
        currentPassword: "old-password",
        newPassword: "new-password",
    }), {
        currentPassword: "old-password",
        newPassword: "new-password",
    });
    assert.throws(() => parse(passwordChangeVerifySchema, { code: "123", newPassword: "new-password" }),
        { status: 400, code: "VALIDATION_ERROR" });
    assert.deepEqual(parse(aiAnalyzeSchema, {}), { period: "month" });
});

test("friend validators normalize usernames and reject unknown fields", () => {
    assert.deepEqual(parse(friendRequestCreateSchema, { username: "Bob.Name" }), { username: "bob.name" });
    assert.deepEqual(parse(publicUsernameParamSchema, { username: "Alice_1" }), { username: "alice_1" });
    assert.throws(() => parse(friendRequestCreateSchema, { username: "x", userId: "forged" }),
        { status: 400, code: "VALIDATION_ERROR" });
});

test("habit validators accept only supported icons and provide a safe default", () => {
    assert.equal(parse(habitCreateSchema, { name: "Leitura", icon: "BOOK" }).icon, "BOOK");
    assert.equal(parse(habitCreateSchema, { name: "Alongar" }).icon, "TARGET");
    assert.deepEqual(parse(habitUpdateSchema, { icon: "DUMBBELL" }), { icon: "DUMBBELL" });
    assert.throws(() => parse(habitCreateSchema, { name: "Leitura", icon: "NOT_AN_ICON" }),
        { status: 400, code: "VALIDATION_ERROR" });
});

test("exercise image lookup accepts a bounded list of exercise names only", () => {
    assert.deepEqual(parse(exerciseImagesSchema, { names: ["Supino reto", "Agachamento"] }), {
        names: ["Supino reto", "Agachamento"],
    });
    assert.throws(() => parse(exerciseImagesSchema, { names: ["  "] }), {
        status: 400,
        code: "VALIDATION_ERROR",
    });
    assert.throws(() => parse(exerciseImagesSchema, { names: Array(51).fill("Agachamento") }), {
        status: 400,
        code: "VALIDATION_ERROR",
    });
});

test("book cover lookup accepts an optional ISBN to find the matching edition", () => {
    assert.deepEqual(parse(isbnLookupSchema, {
        title: "The Hobbit",
        author: "J.R.R. Tolkien",
        isbn: "978-0-547-92822-7",
    }), {
        title: "The Hobbit",
        author: "J.R.R. Tolkien",
        isbn: "978-0-547-92822-7",
    });
    assert.throws(() => parse(isbnLookupSchema, {
        title: "The Hobbit",
        unknown: true,
    }), { status: 400, code: "VALIDATION_ERROR" });
});

test("habit schemas enforce the supplied unit while PATCH defers omitted unit to persisted state", () => {
    assert.equal(parse(habitCreateSchema, { name: "Água", dailyTarget: 3 }).dailyTarget, 3);
    assert.equal(parse(habitCreateSchema, { name: "Leitura" }).dailyTarget, 1);
    assert.equal(parse(habitCreateSchema, { name: "Água", unit: "ML", dailyTarget: 2_000, step: 250 }).dailyTarget, 2_000);
    assert.deepEqual(parse(habitUpdateSchema, { dailyTarget: 21 }), { dailyTarget: 21 });
    assert.deepEqual(parse(habitUpdateSchema, { dailyTarget: 2_000, unit: "ML", step: 250 }), {
        dailyTarget: 2_000,
        unit: "ML",
        step: 250,
    });
    for (const dailyTarget of [0, 21, 1.5]) {
        assert.throws(() => parse(habitCreateSchema, { name: "Meta inválida", dailyTarget }),
            { status: 400, code: "VALIDATION_ERROR" });
    }
    for (const dailyTarget of [0, 21, 1.5]) {
        assert.throws(() => parse(habitUpdateSchema, { dailyTarget, unit: null }),
            { status: 400, code: "VALIDATION_ERROR" });
    }
});

test("check-in validator accepts a unit-sized batch amount up to ten thousand", () => {
    assert.deepEqual(parse(checkInCreateSchema, {}), { amount: 1 });
    assert.deepEqual(parse(checkInCreateSchema, { amount: 3 }), { amount: 3 });
    assert.deepEqual(parse(checkInCreateSchema, { date: "2026-10-15", amount: 2 }), {
        date: "2026-10-15",
        amount: 2,
    });
    assert.equal(parse(checkInCreateSchema, { amount: 2_000 }).amount, 2_000);
    for (const amount of [0, 10_001, 1.5]) {
        assert.throws(() => parse(checkInCreateSchema, { amount }), {
            status: 400,
            code: "VALIDATION_ERROR",
        });
    }
});

test("check-in removal requires a date and accepts a positive amount", () => {
    assert.deepEqual(parse(checkInRemoveSchema, { date: "2026-10-15" }), {
        date: "2026-10-15",
        amount: 1,
    });
    assert.deepEqual(parse(checkInRemoveSchema, { date: "2026-10-15", amount: 2 }), {
        date: "2026-10-15",
        amount: 2,
    });
    assert.equal(parse(checkInRemoveSchema, { date: "2026-10-15", amount: 2_000 }).amount, 2_000);
    for (const payload of [{}, { date: "2026-10-15", amount: 0 }, { date: "2026-10-15", amount: 10_001 }]) {
        assert.throws(() => parse(checkInRemoveSchema, payload), {
            status: 400,
            code: "VALIDATION_ERROR",
        });
    }
});

test("goal validators enforce numeric bounds and only accept web fields", () => {
    const goal = parse(goalCreateSchema, {
        name: "Read books",
        targetValue: 5,
        unit: "books",
    });
    assert.equal(goal.period, "MONTHLY");
    assert.equal(goal.currentValue, 0);
    assert.throws(() => parse(goalCreateSchema, {
        name: "Invalid",
        targetValue: 0,
        unit: "items",
    }), { status: 400, code: "VALIDATION_ERROR" });
    assert.throws(() => parse(goalUpdateSchema, { unexpected: true }),
        { status: 400, code: "VALIDATION_ERROR" });
    assert.equal(parse(goalProgressSchema, {}).amount, 1);
});

test("focus-session defaults and reading book/log bounds match the web contract", () => {
    assert.deepEqual(parse(focusSessionCreateSchema, {}), {
        title: "Sessão de foco",
        plannedMinutes: 25,
    });

    test("reading focus validators require a book and session UUID", () => {
        assert.deepEqual(parse(readingFocusStartSchema, {
            bookId: "0123456789abcdef01234567",
            sessionId: "a4d5295e-bb57-4f94-9f44-e15a0292df1c",
        }), {
            bookId: "0123456789abcdef01234567",
            sessionId: "a4d5295e-bb57-4f94-9f44-e15a0292df1c",
        });
        assert.deepEqual(parse(readingFocusStopSchema, {
            sessionId: "a4d5295e-bb57-4f94-9f44-e15a0292df1c",
        }), {
            sessionId: "a4d5295e-bb57-4f94-9f44-e15a0292df1c",
        });
        assert.throws(() => parse(readingFocusStartSchema, {
            bookId: "invalid",
            sessionId: "not-a-uuid",
        }), { status: 400, code: "VALIDATION_ERROR" });
    });
    assert.throws(() => parse(focusSessionCreateSchema, { plannedMinutes: 0 }),
        { status: 400, code: "VALIDATION_ERROR" });
    assert.throws(() => parse(readingBookCreateSchema, {
        title: "Book",
        totalPages: 100,
        currentPage: 101,
    }), { status: 400, code: "VALIDATION_ERROR" });
    assert.throws(() => parse(readingBookUpdateSchema, { coverUrl: "http://example.com/cover.jpg" }),
        { status: 400, code: "VALIDATION_ERROR" });
    assert.throws(() => parse(readingLogCreateSchema, { pagesRead: 1, minutesRead: 0 }),
        { status: 400, code: "VALIDATION_ERROR" });
});

}

{ // validators/gymValidators
const {
    workoutPlanSchema,
    workoutSessionExerciseSchema,
    workoutSetSchema,
    workoutStartSchema,
} = await import("../src/validators/index.js");

test("fichas aceitam rotinas livres ordenadas e aplicam valores padrão seguros", () => {
    const result = workoutPlanSchema.safeParse({
        name: "Push",
        exercises: [{ name: "Supino reto" }, { name: "Desenvolvimento", plannedSets: 4, repTarget: "6-8", restSeconds: 120 }],
    });

    assert.equal(result.success, true);
    assert.equal(result.data.exercises[0].plannedSets, 3);
    assert.equal(result.data.exercises[0].restSeconds, 90);
    assert.equal(result.data.exercises[1].plannedSets, 4);
});

test("valida limites de carga, repetições, descansos e campos aceitos", () => {
    assert.equal(workoutPlanSchema.safeParse({ name: "A", extra: true }).success, false);
    assert.equal(workoutPlanSchema.safeParse({ name: "A", exercises: [{ name: "Agachamento", repTarget: "muitas" }] }).success, false);
    assert.equal(workoutPlanSchema.safeParse({ name: "A", exercises: [{ name: "Agachamento", repTarget: "12-8" }] }).success, false);
    assert.equal(workoutSessionExerciseSchema.safeParse({ name: "Agachamento", restSeconds: 901 }).success, false);
    assert.equal(workoutSetSchema.safeParse({ weight: -1, reps: 8 }).success, false);
    assert.equal(workoutSetSchema.safeParse({ weight: 50, reps: 0 }).success, false);
    assert.equal(workoutSetSchema.safeParse({ weight: 50, reps: 8, completed: true }).success, true);
    assert.equal(workoutStartSchema.safeParse({ planId: "not-an-object-id" }).success, false);
});

}

{
const express=(await import('express')).default;
const request=(await import('supertest')).default;
const {createApiRateLimiters,createUserRateLimiter,rateLimitResponse}=await import('../src/middlewares/rateLimiters.js');
test('global limiter blocks requests above the per-IP limit with sanitized 429',async()=>{
    const app=express();app.locals.rateLimits={global:2};app.use(createApiRateLimiters().global);app.get('/',(_req,res)=>res.json({ok:true}));
    await request(app).get('/').expect(200);await request(app).get('/').expect(200);
    const blocked=await request(app).get('/').expect(429);assert.deepEqual(blocked.body,rateLimitResponse);assert.ok(blocked.headers['ratelimit-reset']);assert.equal(blocked.headers['x-ratelimit-limit'],undefined);
});
test('authenticated quota is shared by user and isolated between users on the same IP',async()=>{
    const app=express();app.locals.rateLimits={aiPerHour:1};app.use((req,_res,next)=>{req.user={id:req.headers['x-test-user']};next();});app.use(createUserRateLimiter('aiPerHour'));app.get('/',(_req,res)=>res.json({ok:true}));
    await request(app).get('/').set('x-test-user','alice').expect(200);
    await request(app).get('/').set('x-test-user','alice').expect(429);
    await request(app).get('/').set('x-test-user','bob').expect(200);
});
const v=await import('../src/validators/index.js');
const oid='0123456789abcdef01234567';
const valid={
registerSchema:{name:'User',username:'user',email:'user@example.com',password:'password123',avatarUploadId:oid,avatarUrl:'https://example.com/avatar'},
loginSchema:{email:'user@example.com',password:'password'},emailOnlySchema:{email:'user@example.com'},emailCodeSchema:{email:'user@example.com',code:'123456'},
updateUserSchema:{name:'User'},publicUsernameParamSchema:{username:'user'},readingFocusStartSchema:{bookId:oid,sessionId:'53a3d83f-5bc4-481c-a366-e414911ac8fb'},readingFocusStopSchema:{sessionId:'53a3d83f-5bc4-481c-a366-e414911ac8fb'},
friendRequestCreateSchema:{username:'user'},passwordChangeStartSchema:{currentPassword:'old-password',newPassword:'new-password'},passwordChangeVerifySchema:{code:'123456',newPassword:'new-password'},
goalCreateSchema:{name:'Goal',targetValue:10,unit:'pages'},goalUpdateSchema:{name:'Updated'},goalProgressSchema:{},focusSessionCreateSchema:{},readingBookCreateSchema:{title:'Book',totalPages:100},readingBookUpdateSchema:{title:'New'},readingLogCreateSchema:{pagesRead:1,minutesRead:1},isbnLookupSchema:{title:'Book'},habitCreateSchema:{name:'Habit'},habitUpdateSchema:{name:'New'},habitReorderSchema:{orderedIds:[oid]},archiveSchema:{},checkInCreateSchema:{},checkInRemoveSchema:{date:'2026-10-23'},periodQuerySchema:{},aiAnalyzeSchema:{},workoutPlanSchema:{name:'Plan'},workoutStartSchema:{},workoutSessionExerciseSchema:{name:'Squat'},exerciseImagesSchema:{names:['Squat']},workoutSetSchema:{weight:10,reps:10}
};
for(const [name,schema] of Object.entries(v).filter(([name])=>name.endsWith('Schema'))) test(`${name}: accepts a valid payload and rejects forged ownership fields`,()=>{
    assert.ok(Object.hasOwn(valid,name),`missing fixture for ${name}`);assert.equal(schema.safeParse(valid[name]).success,true);
    assert.equal(schema.safeParse({...valid[name],userId:oid}).success,false);
    for(const input of [null,[],42,'invalid']) assert.equal(schema.safeParse(input).success,false);
});
test('auth validates email normalization, multibyte bcrypt limit and timezone',()=>{
    assert.equal(v.parse(v.loginSchema,{email:' USER@EXAMPLE.COM ',password:'valid'}).email,'user@example.com');
    for(const password of ['a'.repeat(73),'🔐'.repeat(19)]) assert.equal(v.loginSchema.safeParse({email:'user@example.com',password}).success,false);
    assert.equal(v.updateUserSchema.safeParse({timezone:'Mars/Unknown'}).success,false);
    assert.equal(v.updateUserSchema.safeParse({timezone:'America/Sao_Paulo'}).success,true);
});
test('object IDs and pagination reject invalid bounds and support defaults',()=>{
    assert.equal(v.parseObjectId(oid),oid);for(const id of ['', 'g'.repeat(24),null])assert.throws(()=>v.parseObjectId(id),{status:400});
    assert.deepEqual(v.parsePagination({}),{page:1,limit:20});assert.deepEqual(v.parsePagination({page:'2',limit:'5'}),{page:2,limit:5});
    for(const query of [{page:0},{limit:101},{page:1.5},{limit:'nan'}])assert.throws(()=>v.parsePagination(query),{status:400});
});
const {dateKeyInTimezone,startOfWeek,dateRange,addDateKeyDays}=await import('../src/utils/date.js');
test('local midnight on both sides of UTC changes the correct date',()=>{
    const utc=new Date('2026-10-23T00:01:00Z');assert.equal(dateKeyInTimezone(utc,'America/Sao_Paulo'),'2026-10-22');assert.equal(dateKeyInTimezone(utc,'Asia/Tokyo'),'2026-10-23');
    assert.equal(dateKeyInTimezone(new Date('2026-10-23T23:59:00Z'),'Asia/Tokyo'),'2026-10-24');
});
for(const date of ['2026-10-19','2026-10-20','2026-10-21','2026-10-22','2026-10-23','2026-10-24','2026-10-25'])test(`week containing ${date} runs Monday to Sunday`,()=>{
    const monday=startOfWeek(date);assert.equal(monday,'2026-10-19');assert.deepEqual(dateRange(monday,addDateKeyDays(monday,6)),['2026-10-19','2026-10-20','2026-10-21','2026-10-22','2026-10-23','2026-10-24','2026-10-25']);
});
}

{
const {HttpError,sendSuccess,sendError,asyncHandler}=await import('../src/utils/apiResponse.js');
function response(){return {statusCode:null,body:null,status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};}
test('success envelopes use default 200 and explicit 201 statuses',()=>{
    for(const status of [undefined,201]){const res=response();assert.equal(sendSuccess(res,{id:'created'},status),res);assert.equal(res.statusCode,status??200);assert.deepEqual(res.body,{success:true,data:{id:'created'}});}
});
test('known validation errors retain safe structured details',()=>{
    const res=response();sendError(res,new HttpError(422,'INVALID','Invalid input',[{path:['name'],message:'Required'}]));
    assert.equal(res.statusCode,422);assert.deepEqual(res.body,{success:false,error:{code:'INVALID',message:'Invalid input',details:[{path:['name'],message:'Required'}]}});
});
for(const [error,status,code] of [[{status:413,message:'private body'},413,'PAYLOAD_TOO_LARGE'],[{status:400,message:'private parser'},400,'VALIDATION_ERROR'],[{type:'entity.parse.failed',message:'secret payload'},400,'VALIDATION_ERROR'],[{status:415,type:'encoding.unsupported',message:'private encoding details'},415,'UNSUPPORTED_CONTENT_ENCODING']])test(`parser ${error.type??error.status} hides raw request contents`,()=>{
    const res=response();sendError(res,error);assert.equal(res.statusCode,status);assert.equal(res.body.error.code,code);assert.equal(res.body.success,false);assert.equal(Object.hasOwn(res.body.error,'details'),false);assert.doesNotMatch(JSON.stringify(res.body),/private|secret/);
});
test('asyncHandler forwards rejections exactly once and preserves handler arguments',async()=>{
    const error=new Error('failure');const req={},res={};let calls=0;const next=actual=>{calls++;assert.equal(actual,error);};
    await asyncHandler(async(a,b,c)=>{assert.equal(a,req);assert.equal(b,res);assert.equal(c,next);throw error;})(req,res,next);assert.equal(calls,1);
    await asyncHandler(async()=>{})(req,res,()=>assert.fail('successful handler must not forward errors'));
});
}
