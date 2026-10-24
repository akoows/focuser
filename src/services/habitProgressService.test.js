import test from "node:test";
import assert from "node:assert/strict";
import {
    getCheckInCounts,
    getCompletedCheckInSet,
    getHabitProgressStats,
    getNextCheckInOccurrence,
    getStreakStats,
    getStreakWindow,
    buildHabitHistorySeries,
    refreshHabitStreakSafely,
} from "./habitProgressService.js";

test("streak refresh failures after a check-in do not turn the saved mutation into a failed response", async () => {
    const entries = [];
    const habit = { currentStreak: 2, longestStreak: 5 };
    const streaks = await refreshHabitStreakSafely(habit, "2026-10-24", {
        refresh: async () => { throw Object.assign(new Error("private database detail"), { code: "P5000" }); },
        logger: (...entry) => entries.push(entry),
    });

    assert.deepEqual(streaks, { currentStreak: 2, longestStreak: 5 });
    assert.deepEqual(entries, [["[api] Habit streak refresh failed after check-in mutation.", { name: "Error", code: "P5000" }]]);
    assert.equal(JSON.stringify(entries).includes("private database detail"), false);
});

test("check-in occurrences can increase by a batch without exceeding the daily target", () => {
    assert.equal(getNextCheckInOccurrence([], 2), 1);
    assert.equal(getNextCheckInOccurrence([{ occurrence: 1 }], 2), 2);
    assert.equal(getNextCheckInOccurrence([{ occurrence: 3 }], 4), 4);
    assert.equal(getNextCheckInOccurrence([{ occurrence: 1 }, { occurrence: 2 }], 2), null);
    assert.equal(getNextCheckInOccurrence([{}], 2), 2);
    assert.equal(getNextCheckInOccurrence([], 3, 3), 3);
    assert.equal(getNextCheckInOccurrence([{ occurrence: 1 }], 3, 2), 3);
    assert.equal(getNextCheckInOccurrence([{ occurrence: 1 }], 3, 3), null);
});

test("habit completion requires its daily target and counts multiple check-ins", () => {
    const habits = [{ id: "habit-1", dailyTarget: 2 }, { id: "habit-2" }];
    const checkIns = [
        { habitId: "habit-1", dateKey: "2026-10-15", occurrence: 2 },
        { habitId: "habit-2", dateKey: "2026-10-15" },
    ];
    const counts = getCheckInCounts(checkIns);
    const completed = getCompletedCheckInSet(habits, counts);

    assert.equal(counts.get("habit-1:2026-10-15"), 2);
    assert.equal(completed.has("habit-1:2026-10-15"), true);
    assert.equal(completed.has("habit-2:2026-10-15"), true);
    assert.equal(getCompletedCheckInSet(habits, checkIns).size, 2);
    assert.equal(getCompletedCheckInSet([{ id: "habit-1", dailyTarget: 3 }], checkIns).size, 0);
});

test("habit progress counts only scheduled check-ins and calculates individual streaks", () => {
    const habit = {
        id: "habit-1",
        frequency: "CUSTOM",
        daysOfWeek: [1, 3],
        startDateKey: "2026-01-01",
    };
    const series = [
        { date: "2026-01-05" },
        { date: "2026-01-06" },
        { date: "2026-01-07" },
        { date: "2026-01-08" },
        { date: "2026-01-09" },
    ];
    const checkInSet = new Set([
        "habit-1:2026-01-05",
        "habit-1:2026-01-06",
        "habit-1:2026-01-07",
    ]);

    assert.deepEqual(
        getHabitProgressStats(habit, series, checkInSet, checkInSet, "2026-01-09"),
        {
            scheduled: 2,
            completed: 2,
            completionRate: 1,
            currentStreak: 2,
            bestStreak: 2,
        }
    );
});

test("habit streaks do not count another habit's check-ins", () => {
    const habit = {
        id: "habit-1",
        frequency: "DAILY",
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        startDateKey: "2026-01-01",
    };

    assert.deepEqual(
        getHabitProgressStats(
            habit,
            [{ date: "2026-01-05" }],
            new Set(),
            new Set(["habit-2:2026-01-09"]),
            "2026-01-09"
        ),
        {
            scheduled: 1,
            completed: 0,
            completionRate: 0,
            currentStreak: 0,
            bestStreak: 0,
        }
    );
});

test("streak window is 365 inclusive dates and supports streaks longer than a week", () => {
    const window = getStreakWindow("2026-10-24");
    assert.deepEqual(window, { from: "2025-10-25", to: "2026-10-24" });
    const habit = { id: "habit-long", dailyTarget: 1, frequency: "DAILY", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startDateKey: window.from };
    const checkIns = new Set(Array.from({ length: 30 }, (_, index) => (
        `habit-long:${new Date(Date.parse("2026-10-24T12:00:00.000Z") - index * 86_400_000).toISOString().slice(0, 10)}`
    )));
    assert.deepEqual(getStreakStats([habit], checkIns, window.to), { currentStreak: 30, bestStreak: 30 });
});

test("habit history treats permitted pre-start dates as scheduled and completed", () => {
    const habit = { id: "habit-backdate", dailyTarget: 1, frequency: "DAILY", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startDateKey: "2026-10-16" };
    const series = buildHabitHistorySeries(habit, ["2026-10-09", "2026-10-08"], new Map([
        ["2026-10-09", 1],
        ["2026-10-08", 1],
    ]));
    assert.deepEqual(series, [
        { date: "2026-10-09", scheduled: true, value: 1, target: 1, completed: true },
        { date: "2026-10-08", scheduled: false, value: 1, target: 1, completed: false },
    ]);
});
