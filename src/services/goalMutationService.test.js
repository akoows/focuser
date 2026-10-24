import assert from "node:assert/strict";
import test from "node:test";
import { compareAndSetGoalUpdate, goalMutationWhere } from "./goalMutationService.js";

const goal = { id: "goal-1", currentValue: 5, targetValue: 10, isActive: true };

test("goal mutation precondition includes both values and the owner", () => {
    assert.deepEqual(goalMutationWhere(goal, "user-1"), {
        id: "goal-1",
        userId: "user-1",
        currentValue: 5,
        targetValue: 10,
    });
    assert.deepEqual(goalMutationWhere({ ...goal, currentValue: 0 }, "user-1", true), {
        id: "goal-1",
        userId: "user-1",
        currentValue: 0,
        targetValue: 10,
        isActive: true,
    });
});

test("compare-and-set returns a successful write or a recoverable conflict", async () => {
    let received;
    const result = await compareAndSetGoalUpdate({
        goal,
        userId: "user-1",
        data: { targetValue: 6 },
        updateMany: async (args) => { received = args; return { count: 1 }; },
    });
    assert.deepEqual(received, { where: goalMutationWhere(goal, "user-1"), data: { targetValue: 6 } });
    assert.deepEqual(result, { count: 1 });

    await assert.rejects(
        compareAndSetGoalUpdate({
            goal,
            userId: "user-1",
            data: { currentValue: { increment: 3 } },
            updateMany: async () => ({ count: 0 }),
            requireActive: true,
        }),
        { status: 409, code: "GOAL_CHANGED" },
    );
    await assert.rejects(
        compareAndSetGoalUpdate({ goal, userId: "user-1", data: {}, updateMany: null }),
        /updateMany must be a function/,
    );
});
