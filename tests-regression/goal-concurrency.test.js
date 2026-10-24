import assert from "node:assert/strict";
import test from "node:test";
import { compareAndSetGoalUpdate } from "../src/services/goalMutationService.js";

for (const firstMutation of ["target-reduction", "progress-increment"]) {
    test(`stale ${firstMutation} cannot push currentValue above targetValue`, async () => {
        const state = { id: "goal-1", userId: "user-1", currentValue: 5, targetValue: 10, isActive: true };
        const staleSnapshot = { ...state };
        const updateMany = async ({ where, data }) => {
            if (Object.entries(where).some(([key, value]) => state[key] !== value)) return { count: 0 };
            if (typeof data.currentValue === "number") state.currentValue = data.currentValue;
            else if (data.currentValue?.increment !== undefined) state.currentValue += data.currentValue.increment;
            if (data.targetValue !== undefined) state.targetValue = data.targetValue;
            return { count: 1 };
        };
        const patchTarget = () => compareAndSetGoalUpdate({
            goal: staleSnapshot,
            userId: state.userId,
            data: { targetValue: 6 },
            updateMany,
        });
        const incrementProgress = () => compareAndSetGoalUpdate({
            goal: staleSnapshot,
            userId: state.userId,
            data: { currentValue: { increment: 3 } },
            updateMany,
            requireActive: true,
        });
        const orderedMutations = firstMutation === "target-reduction"
            ? [patchTarget, incrementProgress]
            : [incrementProgress, patchTarget];

        await orderedMutations[0]();
        await assert.rejects(orderedMutations[1](), { status: 409, code: "GOAL_CHANGED" });
        assert.ok(state.currentValue <= state.targetValue);
    });
}

test("concurrent progress and target edits using the same snapshot preserve the invariant", async () => {
    const state = { id: "goal-2", userId: "user-1", currentValue: 2, targetValue: 10, isActive: true };
    const snapshot = { ...state };
    const updateMany = async ({ where, data }) => {
        if (Object.entries(where).some(([key, value]) => state[key] !== value)) return { count: 0 };
        Object.assign(state, data);
        return { count: 1 };
    };
    const updateProgress = () => compareAndSetGoalUpdate({
        goal: snapshot,
        userId: state.userId,
        data: { currentValue: 3 },
        updateMany,
    });
    const lowerTarget = () => compareAndSetGoalUpdate({
        goal: snapshot,
        userId: state.userId,
        data: { targetValue: 8 },
        updateMany,
    });

    await updateProgress();
    await assert.rejects(lowerTarget(), { status: 409, code: "GOAL_CHANGED" });
    assert.equal(state.currentValue, 3);
    assert.ok(state.currentValue <= state.targetValue);
});
