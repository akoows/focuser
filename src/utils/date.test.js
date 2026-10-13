import test from "node:test";
import assert from "node:assert/strict";
import {
    dateKeyInTimezone,
    dateRange,
    isDateKey,
    isHabitScheduled,
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

test("date ranges include both ends and reject oversized intervals", () => {
    assert.deepEqual(dateRange("2026-10-10", "2026-10-12"), [
        "2026-10-10",
        "2026-10-11",
        "2026-10-12",
    ]);
    assert.throws(() => dateRange("2024-01-01", "2025-01-01"), /366 dias/);
});

test("custom habits are scheduled only on configured weekdays and after start", () => {
    const habit = {
        frequency: "CUSTOM",
        daysOfWeek: [1, 3],
        startDateKey: "2026-10-01",
    };
    assert.equal(isHabitScheduled(habit, "2026-10-12"), true);
    assert.equal(isHabitScheduled(habit, "2026-10-13"), false);
    assert.equal(isHabitScheduled(habit, "2026-09-30"), false);
});
