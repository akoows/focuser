import assert from "node:assert/strict";
import test from "node:test";
import { buildHabitPatchMutation, compareAndSetHabitPatch, validateHabitPatch } from "./habitMutationService.js";

const habitFixture = (overrides = {}) => ({
    id: "habit-1",
    userId: "user-1",
    dailyTarget: 20,
    step: 1,
    unit: null,
    frequency: "CUSTOM",
    daysOfWeek: [1, 3, 5],
    color: "#c4b5fd",
    name: "Água",
    category: "Saúde",
    ...overrides,
});

test("habit patch checks all fields used by validation and only writes requested fields", () => {
    const mutation = buildHabitPatchMutation(habitFixture(), "user-1", { color: "#112233" });
    assert.deepEqual(mutation.where, {
        id: "habit-1", userId: "user-1", dailyTarget: 20, step: 1, unit: null,
        frequency: "CUSTOM", daysOfWeek: { equals: [1, 3, 5] },
    });
    assert.deepEqual(mutation.data, { color: "#112233" });
    const daily = buildHabitPatchMutation(habitFixture(), "user-1", { frequency: "DAILY" });
    assert.deepEqual(daily.data, { frequency: "DAILY", daysOfWeek: [0, 1, 2, 3, 4, 5, 6] });
});

test("habit patch validation accepts a compatible unit change and rejects invalid effective invariants", () => {
    assert.doesNotThrow(() => validateHabitPatch(habitFixture({ dailyTarget: 2_000, step: 250, unit: "ML" }), { dailyTarget: 2_500 }));
    assert.throws(() => validateHabitPatch(habitFixture({ dailyTarget: 20, step: 1 }), { dailyTarget: 5, step: 10 }), {
        status: 400, code: "VALIDATION_ERROR",
    });
    assert.throws(() => validateHabitPatch(habitFixture({ frequency: "CUSTOM" }), { frequency: "CUSTOM", daysOfWeek: [] }), {
        status: 400, code: "VALIDATION_ERROR",
    });
});

test("stale habit updates return a conflict and success preserves the returned fields", async () => {
    const habit = habitFixture();
    await assert.rejects(compareAndSetHabitPatch({
        habit,
        userId: "user-1",
        input: { step: 2 },
        updateMany: async () => ({ count: 0 }),
        findUpdated: async () => null,
    }), { status: 409, code: "HABIT_CHANGED" });
    assert.deepEqual(await compareAndSetHabitPatch({
        habit,
        userId: "user-1",
        input: { step: 2 },
        updateMany: async () => ({ count: 1 }),
        findUpdated: async () => ({ ...habit, step: 2 }),
    }), { ...habit, step: 2 });
});
