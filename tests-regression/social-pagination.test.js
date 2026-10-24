import assert from "node:assert/strict";
import test from "node:test";
import { createReadingCommunityService } from "../src/services/readingCommunityService.js";
import { decodeCursor } from "../src/utils/cursor.js";
import { parseCursorPagination } from "../src/validators/index.js";

test("feed pagination regression keeps a stable continuation across missing related books", async () => {
    const date = new Date("2026-10-24T10:00:00.000Z");
    const rows = [
        { id: "000000000000000000000003", userId: "self", bookId: "gone", createdAt: date },
        { id: "000000000000000000000002", userId: "friend", bookId: "book-2", createdAt: date },
        { id: "000000000000000000000001", userId: "self", bookId: "book-1", createdAt: date },
    ];
    const queryLog = [];
    const service = createReadingCommunityService({
        friendship: { findMany: async () => [{ requesterId: "self", addresseeId: "friend" }] },
        readingLog: { findMany: async (args) => {
            queryLog.push(args);
            return args.where.AND ? rows.slice(2) : rows;
        } },
        user: { findMany: async () => [{ id: "self", name: "Self", username: "self", avatarUrl: null }, { id: "friend", name: "Friend", username: "friend", avatarUrl: null }] },
        readingBook: { findMany: async ({ where }) => where.id.in.includes("book-2")
            ? [{ id: "book-2", title: "Second", author: null, coverId: null, coverUrl: null }]
            : [{ id: "book-1", title: "First", author: null, coverId: null, coverUrl: null }] },
    });
    const first = await service.recentFeed("self", parseCursorPagination({ limit: "2" }));
    const second = await service.recentFeed("self", parseCursorPagination({ limit: "2", cursor: first.pagination.nextCursor }));
    assert.equal(queryLog[0].take, 3);
    assert.deepEqual(queryLog[0].where.userId.in, ["self", "friend"]);
    assert.equal(decodeCursor(first.pagination.nextCursor).id, rows[1].id);
    assert.deepEqual(queryLog[1].where.AND[0].OR[1], { createdAt: date, id: { lt: rows[1].id } });
    assert.equal(first.items.length, 1);
    assert.equal(second.items.length, 1);
    assert.equal(first.items[0].id === second.items[0].id, false);
});

test("social pagination rejects limits outside the public contract", () => {
    for (const limit of ["0", "51", "not-a-number"]) {
        assert.throws(() => parseCursorPagination({ limit }, { maxLimit: 50 }), { status: 400 });
    }
});
