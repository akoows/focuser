import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import test from "node:test";
import { parseApiConfig } from "../src/config/env.js";
import { createApp } from "../src/app.js";
import { AUTH_COOKIE, createAuthToken } from "../src/middlewares/auth.js";
import { prisma } from "../src/lib/prisma.js";
import {
    compareAndSetReadingBookPatch,
    mapReadingBookTransactionError,
    recordReadingLogForBook,
} from "../src/services/readingBookMutationService.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for book pagination integration tests.");

const parsedUrl = new URL(databaseUrl);
if (
    parsedUrl.protocol !== "mongodb:"
    || parsedUrl.hostname !== "127.0.0.1"
    || parsedUrl.port !== "27018"
    || parsedUrl.pathname !== "/focuser_test"
    || parsedUrl.searchParams.get("replicaSet") !== "rs0"
) {
    throw new Error("Refusing book pagination test: DATABASE_URL must target the local focuser_test replica set on port 27018.");
}

process.env.NODE_ENV = "test";
process.env.JWT_SECRET ||= "focuser-isolated-book-pagination-test-secret";

function createMutationBarrier(parties) {
    let arrivals = 0;
    let release;
    const barrier = new Promise((resolve) => { release = resolve; });
    return async () => {
        arrivals += 1;
        if (arrivals === parties) release();
        await barrier;
    };
}

test("reading book pages preserve the last item, status filters, profile selection and account isolation", {
    timeout: 120_000,
}, async () => {
    const runId = randomUUID();
    const user = await prisma.user.create({
        data: { name: "Book pagination", email: `book-pagination-${runId}@focuser.dev` },
    });
    const otherUser = await prisma.user.create({
        data: { name: "Other book owner", email: `book-pagination-other-${runId}@focuser.dev` },
    });

    try {
        const app = createApp(parseApiConfig({ ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: "test" }));
        const cookie = `${AUTH_COOKIE}=${createAuthToken(user)}`;
        const otherCookie = `${AUTH_COOKIE}=${createAuthToken(otherUser)}`;
        const createdAt = new Date("2026-01-01T00:00:00.000Z");
        const books = await prisma.readingBook.createMany({
            data: Array.from({ length: 500 }, (_, index) => ({
                userId: user.id,
                title: `Pagination ${String(index).padStart(3, "0")}`,
                totalPages: 100,
                createdAt: new Date(createdAt.getTime() + index * 1_000),
            })),
        });
        assert.equal(books.count, 500);

        const lastPage = await request(app)
            .get("/api/reading/books?status=all&page=10&limit=50")
            .set("Cookie", cookie);
        assert.equal(lastPage.status, 200);
        assert.equal(lastPage.body.data.items.length, 50);
        assert.deepEqual(lastPage.body.data.pagination, { page: 10, limit: 50, total: 500, totalPages: 10 });
        const oldestBook = lastPage.body.data.items.at(-1);
        assert.equal(oldestBook.title, "Pagination 000");

        const saveCurrentBook = await request(app)
            .patch("/api/users/me")
            .set("Cookie", cookie)
            .set("X-Focuser-Client", "web")
            .send({ currentBookId: oldestBook.id, favoriteBookId: oldestBook.id });
        assert.equal(saveCurrentBook.status, 200);
        assert.equal(saveCurrentBook.body.data.user.currentBookId, oldestBook.id);
        assert.equal(saveCurrentBook.body.data.user.favoriteBookId, oldestBook.id);

        const archiveLastBook = await request(app)
            .patch(`/api/reading/books/${oldestBook.id}`)
            .set("Cookie", cookie)
            .set("X-Focuser-Client", "web")
            .send({ isActive: false });
        assert.equal(archiveLastBook.status, 200);
        const archived = await request(app).get("/api/reading/books?status=archived&page=1&limit=50").set("Cookie", cookie);
        assert.equal(archived.status, 200);
        assert.equal(archived.body.data.pagination.total, 1);
        assert.equal(archived.body.data.items[0].id, oldestBook.id);
        const active = await request(app).get("/api/reading/books?status=active&page=1&limit=100").set("Cookie", cookie);
        assert.equal(active.body.data.pagination.total, 499);

        const crossAccount = await request(app).get("/api/reading/books?status=all&page=1&limit=100").set("Cookie", otherCookie);
        assert.equal(crossAccount.status, 200);
        assert.equal(crossAccount.body.data.pagination.total, 0);
        const rejectForeignFavorite = await request(app)
            .patch("/api/users/me")
            .set("Cookie", otherCookie)
            .set("X-Focuser-Client", "web")
            .send({ favoriteBookId: oldestBook.id });
        assert.equal(rejectForeignFavorite.status, 404);

        const deleteLastBook = await request(app)
            .delete(`/api/reading/books/${oldestBook.id}`)
            .set("Cookie", cookie)
            .set("X-Focuser-Client", "web");
        assert.equal(deleteLastBook.status, 200);
        assert.deepEqual(deleteLastBook.body.data, { deleted: true });
        const afterDelete = await request(app).get("/api/reading/books?status=all&page=1&limit=100").set("Cookie", cookie);
        assert.equal(afterDelete.body.data.pagination.total, 499);
        const profileAfterDelete = await prisma.user.findUnique({ where: { id: user.id } });
        assert.equal(profileAfterDelete.currentBookId, null);
        assert.equal(profileAfterDelete.favoriteBookId, null);
    } finally {
        await prisma.readingBook.deleteMany({ where: { userId: user.id } });
        await prisma.user.deleteMany({ where: { id: { in: [user.id, otherUser.id] } } });
    }
});

test("overlapping book PATCH and reading log preserve the persisted page invariant", { timeout: 120_000 }, async () => {
    const runId = randomUUID();
    const user = await prisma.user.create({ data: { name: "Book concurrency", email: `book-concurrency-${runId}@focuser.dev` } });
    let book;
    try {
        book = await prisma.readingBook.create({ data: { userId: user.id, title: "Concurrent pages", totalPages: 100, currentPage: 10 } });
        const runContestedUpdates = async (order) => {
            const snapshot = { ...(await prisma.readingBook.findUnique({ where: { id: book.id } })) };
            const waitForBoth = createMutationBarrier(2);
            const patch = () => prisma.$transaction(async (tx) => compareAndSetReadingBookPatch({
                book: snapshot,
                userId: user.id,
                input: { totalPages: 20, currentPage: 10 },
                updateMany: async (mutation) => {
                    await waitForBoth();
                    return tx.readingBook.updateMany(mutation);
                },
                findUpdated: () => tx.readingBook.findFirst({ where: { id: book.id, userId: user.id } }),
            })).catch((error) => { throw mapReadingBookTransactionError(error); });
            const recordLog = () => prisma.$transaction((tx) => recordReadingLogForBook({
                book: snapshot,
                userId: user.id,
                pagesRead: 30,
                updateMany: async (mutation) => {
                    await waitForBoth();
                    return tx.readingBook.updateMany(mutation);
                },
                findCurrent: () => tx.readingBook.findFirst({ where: { id: book.id, userId: user.id } }),
                createLog: () => tx.readingLog.create({
                    data: { userId: user.id, bookId: book.id, pagesRead: 30, minutesRead: 10, dateKey: "2026-10-24" },
                }),
            })).catch((error) => { throw mapReadingBookTransactionError(error); });
            const actions = order === "patch-first" ? [patch(), recordLog()] : [recordLog(), patch()];
            const outcomes = await Promise.allSettled(actions);
            const successful = outcomes.filter((outcome) => outcome.status === "fulfilled");
            const rejected = outcomes.find((outcome) => outcome.status === "rejected");
            assert.equal(successful.length, 1, "one concurrent write must win while the other receives a conflict");
            assert.equal(rejected.reason.code, "BOOK_CHANGED");

            const persisted = await prisma.readingBook.findUnique({ where: { id: book.id } });
            assert.ok(persisted.currentPage >= 0 && persisted.currentPage <= persisted.totalPages);
            const logCount = await prisma.readingLog.count({ where: { userId: user.id, bookId: book.id } });
            const logIndex = order === "patch-first" ? 1 : 0;
            assert.equal(logCount, outcomes[logIndex].status === "fulfilled" ? 1 : 0);
        };

        await runContestedUpdates("patch-first");
        await prisma.readingLog.deleteMany({ where: { userId: user.id, bookId: book.id } });
        await prisma.readingBook.update({ where: { id: book.id }, data: { totalPages: 100, currentPage: 10 } });
        await runContestedUpdates("log-first");
    } finally {
        await prisma.readingLog.deleteMany({ where: { userId: user.id } });
        await prisma.readingBook.deleteMany({ where: { userId: user.id } });
        await prisma.user.delete({ where: { id: user.id } });
    }
});
