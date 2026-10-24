import assert from "node:assert/strict";
import test from "node:test";
import {
    buildFocusSessionMutation,
    createFocusSessionAndClaim,
    mapFocusSessionTransactionError,
} from "./focusSessionService.js";

const runningSession = {
    id: "session-1",
    status: "RUNNING",
    resumedAt: new Date("2026-10-24T10:00:00.000Z"),
    elapsedSeconds: 20,
};

test("focus transitions precondition status, resumedAt and elapsedSeconds and calculate elapsed once", () => {
    const now = new Date("2026-10-24T10:01:02.900Z");
    const pause = buildFocusSessionMutation(runningSession, "user-1", "pause", now);
    assert.deepEqual(pause.where, {
        id: "session-1",
        userId: "user-1",
        status: "RUNNING",
        resumedAt: runningSession.resumedAt,
        elapsedSeconds: 20,
    });
    assert.deepEqual(pause.data, {
        status: "PAUSED",
        resumedAt: null,
        elapsedSeconds: { increment: 62 },
    });
    assert.equal(pause.endsSession, false);

    const complete = buildFocusSessionMutation(runningSession, "user-1", "complete", now);
    assert.equal(complete.data.elapsedSeconds.increment, 62);
    assert.equal(complete.endsSession, true);
    assert.throws(() => buildFocusSessionMutation({ ...runningSession, status: "COMPLETED" }, "user-1", "pause"), {
        status: 409,
        code: "INVALID_SESSION_STATE",
    });
    assert.throws(() => buildFocusSessionMutation(runningSession, "user-1", "unknown"), /Unknown focus-session action/);
});

test("session creation claims the pointer only after inserting the session and reports conflicts", async () => {
    const calls = [];
    const transaction = {
        user: {
            findUnique: async () => ({ id: "user-1", activeFocusSessionId: null }),
            updateMany: async (args) => { calls.push(["claim", args]); return { count: 1 }; },
        },
        focusSession: {
            create: async ({ data }) => { calls.push(["create", data]); return { id: "session-1", ...data }; },
            findFirst: async () => null,
        },
    };
    const session = await createFocusSessionAndClaim(transaction, "user-1", { title: "Focus" });
    assert.equal(session.id, "session-1");
    assert.deepEqual(calls.map(([name]) => name), ["create", "claim"]);
    assert.deepEqual(calls[1][1], {
        where: {
            id: "user-1",
            OR: [
                { activeFocusSessionId: null },
                { activeFocusSessionId: { isSet: false } },
            ],
        },
        data: { activeFocusSessionId: "session-1" },
    });

    const failureTransaction = {
        ...transaction,
        user: { ...transaction.user, updateMany: async () => ({ count: 0 }) },
    };
    await assert.rejects(
        createFocusSessionAndClaim(failureTransaction, "user-1", { title: "Focus" }),
        { status: 409, code: "FOCUS_SESSION_ACTIVE" },
    );
});

test("focus transaction write conflicts become recoverable 409 errors", () => {
    const transactionError = Object.assign(new Error("write conflict"), { code: "P2034" });
    const mapped = mapFocusSessionTransactionError(transactionError);
    assert.equal(mapped.status, 409);
    assert.equal(mapped.code, "FOCUS_SESSION_CHANGED");
    const unrelated = new Error("database unavailable");
    assert.strictEqual(mapFocusSessionTransactionError(unrelated), unrelated);
});
