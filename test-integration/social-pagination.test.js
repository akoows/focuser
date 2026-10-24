import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import test from "node:test";
import { createApp } from "../src/app.js";
import { parseApiConfig } from "../src/config/env.js";
import { AUTH_COOKIE, createAuthToken } from "../src/middlewares/auth.js";
import { prisma } from "../src/lib/prisma.js";
import { decodeCursor } from "../src/utils/cursor.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for social pagination integration tests.");
const parsedUrl = new URL(databaseUrl);
if (parsedUrl.protocol !== "mongodb:" || parsedUrl.hostname !== "127.0.0.1" || parsedUrl.port !== "27018"
    || parsedUrl.pathname !== "/focuser_test" || parsedUrl.searchParams.get("replicaSet") !== "rs0") {
    throw new Error("Refusing social pagination integration test: DATABASE_URL must target the local focuser_test replica set on port 27018.");
}
process.env.NODE_ENV = "test";
process.env.JWT_SECRET ||= "focuser-isolated-social-pagination-test-secret";

test("friends and reading feed paginate without repeats and respect account/privacy boundaries", { timeout: 120_000 }, async () => {
    const runId = randomUUID();
    const makeUser = (label) => prisma.user.create({ data: { name: label, email: `${label}-${runId}@focuser.dev` } });
    const [self, ...others] = await Promise.all(["social-self", "social-friend-1", "social-friend-2", "social-friend-3", "social-stranger"].map(makeUser));
    const [friendOne, friendTwo, friendThree, stranger] = others;
    const app = createApp(parseApiConfig({ ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: "test" }));
    const cookie = `${AUTH_COOKIE}=${createAuthToken(self)}`;
    const relationIds = [];
    const bookIds = [];
    const logIds = [];
    try {
        for (const friend of [friendOne, friendTwo, friendThree]) {
            const relation = await prisma.friendship.create({ data: {
                requesterId: self.id,
                addresseeId: friend.id,
                pairKey: [self.id, friend.id].sort().join(":"),
                status: "ACCEPTED",
            } });
            relationIds.push(relation.id);
        }
        const inbound = await prisma.friendship.create({ data: {
            requesterId: stranger.id, addresseeId: self.id,
            pairKey: [self.id, stranger.id].sort().join(":"), status: "PENDING",
        } });
        relationIds.push(inbound.id);

        const firstFriendsPage = await request(app).get("/api/friends?limit=2").set("Cookie", cookie);
        assert.equal(firstFriendsPage.status, 200);
        assert.equal(firstFriendsPage.body.data.pagination.limit, 2);
        assert.equal(firstFriendsPage.body.data.pagination.hasMore, true);
        const secondFriendsPage = await request(app)
            .get(`/api/friends?limit=2&cursor=${encodeURIComponent(firstFriendsPage.body.data.pagination.nextCursor)}`)
            .set("Cookie", cookie);
        assert.equal(secondFriendsPage.status, 200);
        const pageFriendIds = [
            ...firstFriendsPage.body.data.friends,
            ...firstFriendsPage.body.data.incomingRequests,
            ...firstFriendsPage.body.data.outgoingRequests,
            ...secondFriendsPage.body.data.friends,
            ...secondFriendsPage.body.data.incomingRequests,
            ...secondFriendsPage.body.data.outgoingRequests,
        ].map((entry) => entry.id);
        assert.equal(new Set(pageFriendIds).size, 4, "all four owned relationships appear once across the pages");
        assert.equal(pageFriendIds.includes(stranger.id), true, "pending request exposes only the public user summary");
        assert.equal(firstFriendsPage.body.data.pagination.nextCursor.length > 0, true);
        assert.equal((await request(app).get("/api/friends?limit=51").set("Cookie", cookie)).status, 400);
        assert.equal((await request(app).get("/api/friends?cursor=not-a-cursor").set("Cookie", cookie)).body.error.code, "INVALID_CURSOR");
        const isolatedFriends = await request(app).get("/api/friends?limit=50").set("Cookie", `${AUTH_COOKIE}=${createAuthToken(stranger)}`);
        assert.deepEqual(isolatedFriends.body.data.friends, []);
        assert.deepEqual(isolatedFriends.body.data.incomingRequests, []);

        const selfBook = await prisma.readingBook.create({ data: { userId: self.id, title: "Self book", totalPages: 10 } });
        const friendBook = await prisma.readingBook.create({ data: { userId: friendOne.id, title: "Friend book", totalPages: 10 } });
        bookIds.push(selfBook.id, friendBook.id);
        const loggedAt = new Date("2026-10-24T10:00:00.000Z");
        for (const bookId of [selfBook.id, friendBook.id, "abcdef0123456789abcdef01"]) {
            const log = await prisma.readingLog.create({ data: {
                userId: bookId === friendBook.id ? friendOne.id : self.id,
                bookId, pagesRead: 1, minutesRead: 1, dateKey: "2026-10-24", createdAt: loggedAt,
            } });
            logIds.push(log.id);
        }
        await prisma.readingLog.create({ data: {
            userId: stranger.id, bookId: stranger.id, pagesRead: 9, minutesRead: 9,
            dateKey: "2026-10-24", createdAt: new Date("2026-10-24T11:00:00.000Z"),
        } });

        const firstFeedPage = await request(app).get("/api/reading/feed?limit=2").set("Cookie", cookie);
        assert.equal(firstFeedPage.status, 200);
        assert.equal(firstFeedPage.body.data.pagination.hasMore, true);
        assert.equal(firstFeedPage.body.data.items.length, 1, "missing related book is skipped but its log advances the cursor");
        const firstCursor = decodeCursor(firstFeedPage.body.data.pagination.nextCursor);
        const secondFeedPage = await request(app)
            .get(`/api/reading/feed?limit=2&cursor=${encodeURIComponent(firstFeedPage.body.data.pagination.nextCursor)}`)
            .set("Cookie", cookie);
        assert.equal(secondFeedPage.status, 200);
        assert.equal(secondFeedPage.body.data.pagination.hasMore, false);
        const pageLogIds = [...firstFeedPage.body.data.items, ...secondFeedPage.body.data.items].map((item) => item.id);
        assert.equal(new Set(pageLogIds).size, pageLogIds.length, "feed pages do not repeat log items");
        assert.equal(pageLogIds.length, 2);
        assert.equal(pageLogIds.includes(logIds[2]), false, "a stranger's log is excluded");
        assert.equal(firstCursor.id, logIds[1]);
        assert.equal((await request(app).get("/api/reading/feed?limit=51").set("Cookie", cookie)).status, 400);
        assert.equal((await request(app).get("/api/reading/feed?cursor=not-a-cursor").set("Cookie", cookie)).body.error.code, "INVALID_CURSOR");
        const strangerFeed = await request(app).get("/api/reading/feed?limit=50").set("Cookie", `${AUTH_COOKIE}=${createAuthToken(stranger)}`);
        assert.equal(strangerFeed.body.data.items.some((item) => item.id !== logIds[2]), false);
    } finally {
        await prisma.readingLog.deleteMany({ where: { id: { in: logIds } } });
        await prisma.readingBook.deleteMany({ where: { id: { in: bookIds } } });
        await prisma.friendship.deleteMany({ where: { id: { in: relationIds } } });
        await prisma.user.deleteMany({ where: { id: { in: [self.id, ...others.map(({ id }) => id)] } } });
    }
});
