import assert from "node:assert/strict";
import test from "node:test";
import { cursorAfter, decodeCursor, encodeCursor } from "./cursor.js";
import { parseCursorPagination } from "../validators/index.js";

const cursor = { createdAt: new Date("2026-10-24T12:00:00.000Z"), id: "abcdef0123456789abcdef01" };

test("opaque cursor round trips a canonical timestamp and object id", () => {
    const token = encodeCursor(cursor);
    assert.match(token, /^[A-Za-z\d_-]+$/);
    assert.deepEqual(decodeCursor(token), cursor);
    assert.deepEqual(cursorAfter(cursor), {
        OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
    });
});

test("malformed, noncanonical and structurally invalid cursors return a stable 400", () => {
    for (const token of ["", "%%%", "e30", Buffer.from(JSON.stringify({ v: 1, id: "bad", createdAt: "yesterday" })).toString("base64url")]) {
        assert.throws(() => decodeCursor(token), { status: 400, code: "INVALID_CURSOR" });
    }
});

test("cursor creation rejects missing timestamps and non ObjectId ids", () => {
    assert.throws(() => encodeCursor({ createdAt: "not a date", id: cursor.id }), TypeError);
    assert.throws(() => encodeCursor({ createdAt: cursor.createdAt, id: "log-1" }), TypeError);
});

test("cursor pagination applies default, valid bounds, and rejects excess or invalid cursors", () => {
    assert.deepEqual(parseCursorPagination({}), { limit: 20, after: null });
    assert.deepEqual(parseCursorPagination({ limit: "50", cursor: encodeCursor(cursor) }, { maxLimit: 50 }), { limit: 50, after: cursor });
    for (const query of [{ limit: "0" }, { limit: "51" }, { limit: "nope" }, { cursor: "bad" }]) {
        assert.throws(() => parseCursorPagination(query, { maxLimit: 50 }), { status: 400 });
    }
});
