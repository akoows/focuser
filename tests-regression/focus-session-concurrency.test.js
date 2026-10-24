import assert from "node:assert/strict";
import test from "node:test";
import {
    buildFocusSessionMutation,
    createFocusSessionAndClaim,
    mapFocusSessionTransactionError,
} from "../src/services/focusSessionService.js";

for (const firstAction of ["pause", "complete"]) {
    test(`a stale ${firstAction} transition cannot count the same running interval twice`, async () => {
        const state = {
            id: "session-1",
            userId: "user-1",
            status: "RUNNING",
            resumedAt: new Date("2026-10-24T10:00:00.000Z"),
            elapsedSeconds: 100,
        };
        const staleSnapshot = { ...state };
        const now = new Date("2026-10-24T10:01:00.000Z");
        const apply = async (action) => {
            const mutation = buildFocusSessionMutation(staleSnapshot, state.userId, action, now);
            if (Object.entries(mutation.where).some(([key, value]) => state[key] !== value)) return { count: 0 };
            state.status = mutation.data.status;
            state.resumedAt = mutation.data.resumedAt;
            if (mutation.data.elapsedSeconds?.increment !== undefined) {
                state.elapsedSeconds += mutation.data.elapsedSeconds.increment;
            }
            return { count: 1 };
        };
        const secondAction = firstAction === "pause" ? "complete" : "pause";

        assert.equal((await apply(firstAction)).count, 1);
        assert.equal((await apply(secondAction)).count, 0);
        assert.equal(state.elapsedSeconds, 160);
        assert.ok(state.elapsedSeconds < 220);
    });
}

for (const firstAction of ["resume", "complete"]) {
    test(`stale ${firstAction} from a paused snapshot cannot double-count elapsed time`, async () => {
        const state = {
            id: "session-2",
            userId: "user-1",
            status: "PAUSED",
            resumedAt: null,
            elapsedSeconds: 80,
        };
        const staleSnapshot = { ...state };
        const now = new Date("2026-10-24T10:02:00.000Z");
        const updateMany = async ({ where, data }) => {
            if (Object.entries(where).some(([key, value]) => state[key] !== value)) return { count: 0 };
            state.status = data.status;
            state.resumedAt = data.resumedAt;
            if (data.elapsedSeconds?.increment !== undefined) state.elapsedSeconds += data.elapsedSeconds.increment;
            return { count: 1 };
        };
        const resume = () => buildFocusSessionMutation(staleSnapshot, state.userId, "resume", now);
        const complete = () => buildFocusSessionMutation(staleSnapshot, state.userId, "complete", now);
        const orderedMutations = firstAction === "resume" ? [resume, complete] : [complete, resume];

        assert.equal((await updateMany(orderedMutations[0]())).count, 1);
        assert.equal((await updateMany(orderedMutations[1]())).count, 0);
        assert.equal(state.elapsedSeconds, 80);
        assert.ok(state.status === "RUNNING" || state.status === "COMPLETED");
    });
}

test("active focus pointer is claimed after insertion and rejected claims report conflict", async () => {
    const order = [];
    const transaction = {
        user: {
            findUnique: async () => ({ id: "user-1", activeFocusSessionId: null }),
            updateMany: async ({ data }) => {
                order.push(["claim", data.activeFocusSessionId]);
                return { count: 1 };
            },
        },
        focusSession: {
            findFirst: async () => null,
            create: async ({ data }) => {
                order.push(["create", data.title]);
                return { id: "session-1", ...data };
            },
        },
    };
    const session = await createFocusSessionAndClaim(transaction, "user-1", { title: "Focus" });
    assert.equal(session.id, "session-1");
    assert.deepEqual(order, [["create", "Focus"], ["claim", "session-1"]]);

    const claimRejected = {
        ...transaction,
        user: { ...transaction.user, updateMany: async () => ({ count: 0 }) },
    };
    await assert.rejects(
        createFocusSessionAndClaim(claimRejected, "user-1", { title: "Race" }),
        { status: 409, code: "FOCUS_SESSION_ACTIVE" },
    );
});

test("Prisma transaction conflicts are exposed as recoverable session conflicts", () => {
    const conflict = Object.assign(new Error("write conflict"), { code: "P2034" });
    const mapped = mapFocusSessionTransactionError(conflict);
    assert.equal(mapped.status, 409);
    assert.equal(mapped.code, "FOCUS_SESSION_CHANGED");
    const unrelated = new Error("other failure");
    assert.strictEqual(mapFocusSessionTransactionError(unrelated), unrelated);
});
