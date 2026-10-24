import assert from "node:assert/strict";
import test from "node:test";
import {
    buildReadingBookPatchMutation,
    buildReadingLogBookMutation,
    compareAndSetReadingBookPatch,
    mapReadingBookTransactionError,
    recordReadingLogForBook,
} from "./readingBookMutationService.js";

const bookFixture = (overrides = {}) => ({
    id: "book-1",
    userId: "user-1",
    totalPages: 100,
    currentPage: 10,
    isActive: true,
    ...overrides,
});

test("book PATCH compares the validated page snapshot and writes only supplied fields", () => {
    const mutation = buildReadingBookPatchMutation(bookFixture(), "user-1", { currentPage: 12, isbn: "" });
    assert.deepEqual(mutation.where, {
        id: "book-1", userId: "user-1", currentPage: 10, totalPages: 100, isActive: true,
    });
    assert.deepEqual(mutation.data, { currentPage: 12, isbn: null });
});

test("book PATCH rejects a negative page or a page beyond the new total", () => {
    assert.throws(() => buildReadingBookPatchMutation(bookFixture(), "user-1", { currentPage: -1 }), {
        status: 400, code: "VALIDATION_ERROR",
    });
    assert.throws(() => buildReadingBookPatchMutation(bookFixture(), "user-1", { totalPages: 9 }), {
        status: 400, code: "VALIDATION_ERROR",
    });
});

test("book PATCH reports a stale snapshot as a conflict and returns the updated record on success", async () => {
    const book = bookFixture();
    const mutation = buildReadingBookPatchMutation(book, "user-1", { currentPage: 12 });
    assert.deepEqual(await compareAndSetReadingBookPatch({
        book,
        userId: "user-1",
        input: { currentPage: 12 },
        updateMany: async () => ({ count: 1 }),
        findUpdated: async () => ({ ...book, ...mutation.data }),
    }), { ...book, currentPage: 12 });
    await assert.rejects(compareAndSetReadingBookPatch({
        book,
        userId: "user-1",
        input: { currentPage: 12 },
        updateMany: async () => ({ count: 0 }),
        findUpdated: async () => null,
    }), { status: 409, code: "BOOK_CHANGED" });
});

test("reading log update binds the total and enforces available pages atomically", async () => {
    const mutation = buildReadingLogBookMutation(bookFixture(), "user-1", 20);
    assert.deepEqual(mutation.where, {
        id: "book-1", userId: "user-1", isActive: true, totalPages: 100, currentPage: { lte: 80 },
    });
    let logged = false;
    await assert.rejects(recordReadingLogForBook({
        book: bookFixture(), userId: "user-1", pagesRead: 20,
        updateMany: async () => ({ count: 0 }),
        findCurrent: async () => bookFixture({ totalPages: 20, currentPage: 10 }),
        createLog: async () => { logged = true; },
    }), { status: 409, code: "BOOK_CHANGED" });
    assert.equal(logged, false);
});

test("Mongo transaction write conflicts map to a recoverable book conflict", () => {
    const mapped = mapReadingBookTransactionError(Object.assign(new Error("conflict"), { code: "P2034" }));
    assert.equal(mapped.status, 409);
    assert.equal(mapped.code, "BOOK_CHANGED");
    const unrelated = new Error("unrelated");
    assert.strictEqual(mapReadingBookTransactionError(unrelated), unrelated);
});
