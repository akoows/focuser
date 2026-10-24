import test from "node:test";
import assert from "node:assert/strict";
import { createReadingCommunityService } from "./readingCommunityService.js";
import { decodeCursor } from "../utils/cursor.js";

const userId = "000000000000000000000001";
const friendId = "000000000000000000000002";
const strangerId = "000000000000000000000003";

test("reading feed includes only self and accepted friends and returns UI fields", async () => {
    let query;
    const service = createReadingCommunityService({
        friendship: {
            findMany: async () => [{ requesterId: userId, addresseeId: friendId }],
        },
        readingLog: {
            findMany: async (args) => {
                query = args;
                return [
                    { id: "log-1", userId, bookId: "book-1", pagesRead: 12, minutesRead: 20, createdAt: new Date("2025-01-01T10:00:00Z") },
                    { id: "log-2", userId: friendId, bookId: "book-2", pagesRead: 4, minutesRead: 10, createdAt: new Date("2025-01-01T09:00:00Z") },
                    { id: "log-3", userId: strangerId, bookId: "book-3", pagesRead: 3, minutesRead: 5, createdAt: new Date("2025-01-01T08:00:00Z") },
                ];
            },
        },
        user: {
            findMany: async () => [
                { id: userId, name: "Reader", username: "~unset:reader", avatarUrl: null },
                { id: friendId, name: "Friend", username: "friend", avatarUrl: "https://example.com/avatar.jpg" },
            ],
        },
        readingBook: {
            findMany: async () => [
                { id: "book-1", title: "Book", author: "Author", coverId: null, coverUrl: null },
                { id: "book-2", title: "Friend's book", author: null, coverId: 23, coverUrl: null },
            ],
        },
    });

    const result = await service.recentFeed(userId);
    assert.deepEqual(query.where.userId.in, [userId, friendId]);
    assert.equal(query.take, 21);
    assert.deepEqual(result.items, [{
        id: "log-1",
        pagesRead: 12,
        minutesRead: 20,
        loggedAt: new Date("2025-01-01T10:00:00Z"),
        book: { id: "book-1", title: "Book", author: "Author", coverId: null, coverUrl: null },
        user: { id: userId, name: "Reader", username: null, avatarUrl: null },
    }, {
        id: "log-2",
        pagesRead: 4,
        minutesRead: 10,
        loggedAt: new Date("2025-01-01T09:00:00Z"),
        book: { id: "book-2", title: "Friend's book", author: null, coverId: 23, coverUrl: null },
        user: { id: friendId, name: "Friend", username: "friend", avatarUrl: "https://example.com/avatar.jpg" },
    }]);
    assert.deepEqual(result.pagination, { limit: 20, hasMore: false, nextCursor: null });
});

test("reading feed pages use stable keyset ordering, retain cursor across missing books, and cap the query", async () => {
    const createdAt = new Date("2026-10-24T10:00:00.000Z");
    const logs = [
        { id: "000000000000000000000003", userId, bookId: "missing-book", pagesRead: 1, minutesRead: 1, createdAt },
        { id: "000000000000000000000002", userId, bookId: "book-2", pagesRead: 2, minutesRead: 2, createdAt },
        { id: "000000000000000000000001", userId, bookId: "book-3", pagesRead: 3, minutesRead: 3, createdAt },
    ];
    let query;
    const service = createReadingCommunityService({
        friendship: { findMany: async () => [] },
        readingLog: { findMany: async (args) => { query = args; return logs; } },
        user: { findMany: async () => [{ id: userId, name: "Reader", username: "reader", avatarUrl: null }] },
        readingBook: { findMany: async ({ where }) => where.id.in.includes("book-2")
            ? [{ id: "book-2", title: "Two", author: null, coverId: null, coverUrl: null }]
            : [] },
    });
    const page = await service.recentFeed(userId, { limit: 2 });
    assert.equal(query.take, 3);
    assert.deepEqual(query.orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
    assert.equal(page.items.length, 1, "a deleted book is skipped without blocking continuation");
    assert.equal(page.pagination.hasMore, true);
    assert.equal(decodeCursor(page.pagination.nextCursor).id, logs[1].id);
    assert.deepEqual(query.where.userId.in, [userId]);
});
