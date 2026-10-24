import test from "node:test";
import assert from "node:assert/strict";
import {
    focusSessionCreateSchema,
    exerciseImagesSchema,
    habitCreateSchema,
    habitReorderSchema,
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
} from "./index.js";

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

test("habit schemas use the chosen unit cap and leave partial updates for persisted-state validation", () => {
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

test("check-in validator accepts unit-sized batches up to ten thousand", () => {
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

test("habit reorder validator accepts unique valid ObjectIds and rejects duplicates or empty arrays", () => {
    const valid1 = "653ad1a01234567890abcdef";
    const valid2 = "653ad1a01234567890abcde1";
    assert.deepEqual(parse(habitReorderSchema, { orderedIds: [valid1, valid2] }), {
        orderedIds: [valid1, valid2],
    });
    assert.throws(() => parse(habitReorderSchema, { orderedIds: [] }), {
        status: 400,
        code: "VALIDATION_ERROR",
    });
    assert.throws(() => parse(habitReorderSchema, { orderedIds: [valid1, valid1] }), {
        status: 400,
        code: "VALIDATION_ERROR",
    });
    assert.throws(() => parse(habitReorderSchema, { orderedIds: ["not-an-object-id"] }), {
        status: 400,
        code: "VALIDATION_ERROR",
    });
});
