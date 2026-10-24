import test from "node:test";
import assert from "node:assert/strict";
import {
    dateKeyInTimezone,
    dateKeyStartInTimezone,
    dateRange,
    isDateKey,
    isHabitScheduled,
    startOfWeek,
} from "./date.js";

test("date keys are validated as real calendar dates", () => {
    assert.equal(isDateKey("2026-10-12"), true);
    assert.equal(isDateKey("2026-02-30"), false);
    assert.equal(isDateKey("12-10-2026"), false);
});

test("date key respects the user's timezone around UTC midnight", () => {
    const afterUtcMidnight = new Date("2026-10-13T02:30:00.000Z");
    assert.equal(dateKeyInTimezone(afterUtcMidnight, "America/Sao_Paulo"), "2026-10-12");
});

test("local date start resolves midnight in the timezone, including DST transitions", () => {
    assert.equal(dateKeyStartInTimezone("2026-10-24", "America/Sao_Paulo").toISOString(), "2026-10-24T03:00:00.000Z");
    assert.equal(dateKeyStartInTimezone("2026-03-08", "America/New_York").toISOString(), "2026-03-08T05:00:00.000Z");
});

test("date ranges include both ends and reject oversized intervals", () => {
    assert.deepEqual(dateRange("2026-10-10", "2026-10-12"), [
        "2026-10-10",
        "2026-10-11",
        "2026-10-12",
    ]);
    assert.throws(() => dateRange("2024-01-01", "2025-01-01"), /366 dias/);
});

test("weekly ranges always start Monday and include Sunday", () => {
    assert.equal(startOfWeek("2026-10-12"), "2026-10-12");
    assert.equal(startOfWeek("2026-10-15"), "2026-10-12");
    assert.equal(startOfWeek("2026-10-18"), "2026-10-12");
    assert.deepEqual(dateRange(startOfWeek("2026-10-15"), "2026-10-18"), [
        "2026-10-12",
        "2026-10-13",
        "2026-10-14",
        "2026-10-15",
        "2026-10-16",
        "2026-10-17",
        "2026-10-18",
    ]);
});

test("custom habits allow scheduled weekdays up to seven days before their start", () => {
    const habit = {
        frequency: "CUSTOM",
        daysOfWeek: [1, 3],
        startDateKey: "2026-10-16",
    };
    assert.equal(isHabitScheduled(habit, "2026-10-12"), true);
    assert.equal(isHabitScheduled(habit, "2026-10-13"), false);
    assert.equal(isHabitScheduled(habit, "2026-10-08"), false);
    assert.equal(isHabitScheduled(habit, "2026-10-19"), true);
});

test("daily habits are considered scheduled through seven days before their start", () => {
    const habit = {
        frequency: "DAILY",
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        startDateKey: "2026-10-16",
    };
    assert.equal(isHabitScheduled(habit, "2026-10-09"), true);
    assert.equal(isHabitScheduled(habit, "2026-10-08"), false);
    assert.equal(isHabitScheduled(habit, "2026-10-16"), true);
});
