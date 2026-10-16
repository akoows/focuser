import test from "node:test";
import assert from "node:assert/strict";
import {
    focusSessionCreateSchema,
    goalCreateSchema,
    goalProgressSchema,
    goalUpdateSchema,
    parse,
    readingBookCreateSchema,
    readingBookUpdateSchema,
    readingLogCreateSchema,
    aiAnalyzeSchema,
    passwordChangeStartSchema,
    passwordChangeVerifySchema,
    registerSchema,
    updateUserSchema,
} from "./index.js";

test("profile accent colors are strictly validated", () => {
    assert.deepEqual(parse(updateUserSchema, { accentColor: "#93C5FD" }), { accentColor: "#93C5FD" });
    assert.throws(() => parse(updateUserSchema, { accentColor: "blue" }), { status: 400, code: "VALIDATION_ERROR" });
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
