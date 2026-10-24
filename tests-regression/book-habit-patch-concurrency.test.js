import assert from "node:assert/strict";
import test from "node:test";
import { compareAndSetHabitPatch } from "../src/services/habitMutationService.js";
import {
    compareAndSetReadingBookPatch,
    recordReadingLogForBook,
} from "../src/services/readingBookMutationService.js";

function matchesWhere(state, where) {
    return Object.entries(where).every(([key, expected]) => {
        if (expected && typeof expected === "object" && "lte" in expected) return state[key] <= expected.lte;
        if (expected && typeof expected === "object" && "equals" in expected) {
            return JSON.stringify(state[key]) === JSON.stringify(expected.equals);
        }
        return JSON.stringify(state[key]) === JSON.stringify(expected);
    });
}

function createBarrier(parties) {
    let arrivals = 0;
    let openBarrier;
    const barrier = new Promise((resolve) => { openBarrier = resolve; });
    return async () => {
        arrivals += 1;
        if (arrivals === parties) openBarrier();
        await barrier;
    };
}

function updateManyFor(state, beforeCompare = async () => {}) {
    return async ({ where, data }) => {
        await beforeCompare();
        if (!matchesWhere(state, where)) return { count: 0 };
        for (const [key, value] of Object.entries(data)) {
            state[key] = value?.increment === undefined ? value : state[key] + value.increment;
        }
        return { count: 1 };
    };
}

for (const firstAction of ["patch", "log"]) {
    test(`overlapping book patch and log preserve the page invariant (${firstAction} starts first)`, async () => {
        const state = { id: "book-1", userId: "user-1", totalPages: 100, currentPage: 10, isActive: true };
        const staleBook = { ...state };
        let logsCreated = 0;
        const waitForBothMutations = createBarrier(2);
        const patch = () => compareAndSetReadingBookPatch({
            book: staleBook,
            userId: state.userId,
            input: { totalPages: 20, currentPage: 10 },
            updateMany: updateManyFor(state, waitForBothMutations),
            findUpdated: async () => ({ ...state }),
        });
        const log = () => recordReadingLogForBook({
            book: staleBook,
            userId: state.userId,
            pagesRead: 30,
            updateMany: updateManyFor(state, waitForBothMutations),
            findCurrent: async () => ({ ...state }),
            createLog: async () => { logsCreated += 1; return { pagesRead: 30 }; },
        });

        const operations = firstAction === "patch" ? [patch(), log()] : [log(), patch()];
        const outcomes = await Promise.allSettled(operations);
        const fulfilled = outcomes.filter((outcome) => outcome.status === "fulfilled");
        const rejected = outcomes.find((outcome) => outcome.status === "rejected");
        assert.equal(fulfilled.length, 1, "one compare-and-set must win and the competing update must be rejected");
        assert.equal(rejected.reason.code, "BOOK_CHANGED");
        assert.ok(state.currentPage >= 0 && state.currentPage <= state.totalPages);
        const logIndex = firstAction === "log" ? 0 : 1;
        assert.equal(logsCreated, outcomes[logIndex].status === "fulfilled" ? 1 : 0);
    });
}

for (const firstAction of ["target", "step"]) {
    test(`overlapping habit target and step edits preserve step <= dailyTarget (${firstAction} starts first)`, async () => {
        const state = {
            id: "habit-1", userId: "user-1", dailyTarget: 20, step: 1, unit: null,
            frequency: "DAILY", daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        };
        const staleHabit = { ...state, daysOfWeek: [...state.daysOfWeek] };
        const waitForBothMutations = createBarrier(2);
        const update = (input) => compareAndSetHabitPatch({
            habit: staleHabit,
            userId: state.userId,
            input,
            updateMany: updateManyFor(state, waitForBothMutations),
            findUpdated: async () => ({ ...state }),
        });
        const changeTarget = () => update({ dailyTarget: 5 });
        const changeStep = () => update({ step: 10 });
        const operations = firstAction === "target" ? [changeTarget(), changeStep()] : [changeStep(), changeTarget()];
        const outcomes = await Promise.allSettled(operations);
        const fulfilled = outcomes.filter((outcome) => outcome.status === "fulfilled");
        const rejected = outcomes.find((outcome) => outcome.status === "rejected");
        assert.equal(fulfilled.length, 1, "one compare-and-set must win and the competing update must be rejected");
        assert.equal(rejected.reason.code, "HABIT_CHANGED");
        assert.ok(state.step <= state.dailyTarget);
        assert.equal(state.dailyTarget, firstAction === "target" ? 5 : 20);
        assert.equal(state.step, firstAction === "target" ? 1 : 10);
    });
}

test("a partial habit edit does not replay step, target or schedule from its snapshot", async () => {
    const state = {
        id: "habit-2", userId: "user-1", dailyTarget: 8, step: 2, unit: null,
        frequency: "CUSTOM", daysOfWeek: [2, 4], color: "#000000",
    };
    const staleHabit = { ...state, daysOfWeek: [...state.daysOfWeek] };
    const update = await compareAndSetHabitPatch({
        habit: staleHabit,
        userId: state.userId,
        input: { color: "#ffffff" },
        updateMany: updateManyFor(state),
        findUpdated: async () => ({ ...state }),
    });
    assert.deepEqual(update, { ...state, color: "#ffffff" });
    assert.equal(state.step, 2);
    assert.equal(state.dailyTarget, 8);
    assert.deepEqual(state.daysOfWeek, [2, 4]);
});
