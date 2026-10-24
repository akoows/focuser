import assert from "node:assert/strict";
import test from "node:test";
import { createWithinUserQuota } from "./userQuotaService.js";

function clientWithCount(count) {
    const state = { count, version: 0, created: 0 };
    const tx = {
        user: {
            findUnique: async () => ({ quotaVersion: state.version }),
            updateMany: async ({ where }) => {
                if (!where.OR.some((condition) => condition.quotaVersion === state.version)) return { count: 0 };
                state.version += 1;
                return { count: 1 };
            },
        },
        item: {
            count: async () => state.count,
            create: async ({ data }) => { state.created += 1; state.count += 1; return data; },
        },
    };
    return { state, $transaction: (callback) => callback(tx) };
}

test("user quota permits the last slot and rejects creation at the limit", async () => {
    const prisma = clientWithCount(1);
    const created = await createWithinUserQuota({ prisma, userId: "u1", resource: "item", limit: 2, errorCode: "LIMIT", errorMessage: "full", data: { name: "new" } });
    assert.deepEqual(created, { name: "new", userId: "u1" });
    assert.equal(prisma.state.version, 1);
    await assert.rejects(createWithinUserQuota({ prisma, userId: "u1", resource: "item", limit: 2, errorCode: "LIMIT", errorMessage: "full", data: {} }), { code: "LIMIT", status: 422 });
    assert.equal(prisma.state.created, 1);
});

test("user quota rejects invalid configuration before opening a transaction", async () => {
    let calls = 0;
    await assert.rejects(createWithinUserQuota({ prisma: { $transaction: () => { calls += 1; } }, userId: "u1", resource: "item", limit: 0, errorCode: "LIMIT", errorMessage: "full", data: {} }), TypeError);
    assert.equal(calls, 0);
});
