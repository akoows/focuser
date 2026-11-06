import test from "node:test";
import assert from "node:assert/strict";
import { normalizeLegacyUsernames } from "./legacyUsernameMigration.js";

function createMockPrisma(users) {
    const changedUsers = [];
    return {
        changedUsers,
        user: {
            findMany: async ({ where, take }) => {
                const lastId = where.AND[1]?.id?.gt;
                return users
                    .filter((user) => user.username == null && (!lastId || user.id > lastId))
                    .slice(0, take)
                    .map(({ id }) => ({ id }));
            },
            updateMany: async ({ where, data }) => {
                const user = users.find((item) => item.id === where.id && item.username == null);
                if (!user) return { count: 0 };
                user.username = data.username;
                changedUsers.push(user.id);
                return { count: 1 };
            },
        },
    };
}

test("assigns stable internal usernames to legacy accounts without deleting their records", async () => {
    const users = [
        { id: "000000000000000000000001", username: null, email: "one@example.com" },
        { id: "000000000000000000000002", email: "two@example.com" },
        { id: "000000000000000000000003", username: "valid.user", email: "three@example.com" },
    ];
    const prisma = createMockPrisma(users);

    const result = await normalizeLegacyUsernames(prisma);

    assert.deepEqual(result, { updatedCount: 2 });
    assert.deepEqual(prisma.changedUsers, [
        "000000000000000000000001",
        "000000000000000000000002",
    ]);
    assert.equal(users[0].username, "~unset:000000000000000000000001");
    assert.equal(users[1].username, "~unset:000000000000000000000002");
    assert.equal(users[0].email, "one@example.com");
    assert.equal(users[2].username, "valid.user");
});

test("does not rewrite usernames that are set when a legacy account changes concurrently", async () => {
    const users = [{ id: "000000000000000000000001", username: null }];
    const prisma = createMockPrisma(users);
    const updateMany = prisma.user.updateMany;
    prisma.user.updateMany = async (args) => {
        users[0].username = "new.name";
        return updateMany(args);
    };

    const result = await normalizeLegacyUsernames(prisma);

    assert.deepEqual(result, { updatedCount: 0 });
    assert.equal(users[0].username, "new.name");
});

test("normalizes legacy accounts in batches", async () => {
    const users = Array.from({ length: 205 }, (_, index) => ({
        id: String(index + 1).padStart(24, "0"),
        username: null,
    }));
    const prisma = createMockPrisma(users);

    const result = await normalizeLegacyUsernames(prisma);

    assert.deepEqual(result, { updatedCount: 205 });
    assert.equal(prisma.changedUsers.length, 205);
    assert.equal(users[204].username, `~unset:${users[204].id}`);
});
