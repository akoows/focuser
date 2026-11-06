import test from "node:test";
import assert from "node:assert/strict";
import { createFriendService } from "./friendService.js";

const users = [
    { id: "000000000000000000000001", username: "alice", name: "Alice", avatarUrl: null, accentColor: "#ffffff" },
    { id: "000000000000000000000002", username: "bob", name: "Bob", avatarUrl: null, accentColor: "#ffffff" },
    { id: "000000000000000000000003", username: "carol", name: "Carol", avatarUrl: null, accentColor: "#ffffff" },
];

function createTestService() {
    const relations = [];
    let nextId = 1;
    const matches = (relation, where) => Object.entries(where).every(([key, value]) => {
        if (key === "OR") return value.some((condition) => matches(relation, condition));
        return relation[key] === value;
    });
    const prisma = {
        user: {
            findUnique: async ({ where }) => users.find((user) => user.username === where.username) || null,
        },
        friendship: {
            findMany: async ({ where }) => relations
                .filter((relation) => matches(relation, where))
                .map((relation) => ({
                    ...relation,
                    requester: users.find((user) => user.id === relation.requesterId),
                    addressee: users.find((user) => user.id === relation.addresseeId),
                })),
            findFirst: async ({ where }) => relations.find((relation) => matches(relation, where)) || null,
            findUnique: async ({ where }) => relations.find((relation) => relation.id === where.id) || null,
            create: async ({ data }) => {
                if (relations.some((relation) => relation.pairKey === data.pairKey)) {
                    throw Object.assign(new Error("Duplicate friendship"), { code: "P2002" });
                }
                const now = new Date();
                const relation = {
                    ...data,
                    id: String(nextId++).padStart(24, "0"),
                    status: "PENDING",
                    createdAt: now,
                    updatedAt: now,
                };
                relations.push(relation);
                return relation;
            },
            updateMany: async ({ where, data }) => {
                const relation = relations.find((item) => matches(item, where));
                if (!relation) return { count: 0 };
                Object.assign(relation, data, { updatedAt: new Date() });
                return { count: 1 };
            },
            deleteMany: async ({ where }) => {
                const index = relations.findIndex((relation) => matches(relation, where));
                if (index < 0) return { count: 0 };
                relations.splice(index, 1);
                return { count: 1 };
            },
        },
    };
    return { service: createFriendService(prisma), relations };
}

test("friend requests transition to friendship and list only public profile fields", async () => {
    const { service } = createTestService();
    const request = await service.sendRequest(users[0].id, "bob");
    assert.equal(request.status, "SENT");
    assert.equal((await service.status(users[0].id, "bob")).status, "SENT");

    await service.respondToRequest(users[1].id, request.requestId);
    assert.equal((await service.status(users[0].id, "bob")).status, "FRIENDS");
    const list = await service.list(users[0].id);
    assert.equal(list.friends[0].username, "bob");
    assert.equal(list.friends[0].friendshipId, request.requestId);
    assert.equal("email" in list.friends[0], false);
    assert.equal(list.incomingRequests.length, 0);
});

test("friend requests reject self, missing users, and duplicate or reverse requests", async () => {
    const { service } = createTestService();
    await assert.rejects(service.sendRequest(users[0].id, "missing"), { code: "FRIEND_USER_NOT_FOUND" });
    await assert.rejects(service.sendRequest(users[0].id, "alice"), { code: "FRIEND_REQUEST_SELF" });

    await service.sendRequest(users[0].id, "bob");
    await assert.rejects(service.sendRequest(users[0].id, "bob"), { code: "FRIEND_REQUEST_ALREADY_SENT" });
    await assert.rejects(service.sendRequest(users[1].id, "alice"), { code: "FRIEND_REQUEST_RECEIVED" });
});

test("requests can be declined or canceled and friends can be removed by either participant", async () => {
    const { service } = createTestService();
    const pending = await service.sendRequest(users[0].id, "bob");
    await assert.rejects(service.respondToRequest(users[2].id, pending.requestId), { code: "FRIEND_REQUEST_NOT_FOUND" });
    assert.deepEqual(await service.removeRequest(users[1].id, pending.requestId), { removed: true });

    const reverse = await service.sendRequest(users[1].id, "alice");
    await service.removeRequest(users[0].id, reverse.requestId);
    const finalRequest = await service.sendRequest(users[0].id, "bob");
    await service.respondToRequest(users[1].id, finalRequest.requestId);
    assert.deepEqual(await service.removeFriend(users[1].id, users[0].id), { removed: true });
    assert.equal((await service.status(users[0].id, "bob")).status, "NONE");
});
