import assert from "node:assert/strict";
import test from "node:test";
import { buildWorkoutCalendarQuery } from "../src/services/workoutCalendarService.js";

test("filter the requested local date before take 100 so adjacent days cannot crowd out sessions", () => {
    const query = buildWorkoutCalendarQuery("user-1", "2026-10-24", "America/Sao_Paulo");
    const sessions = [
        ...Array.from({ length: 100 }, (_, index) => ({
            id: `adjacent-${index}`,
            userId: "user-1",
            status: "COMPLETED",
            completedAt: new Date("2026-10-23T12:00:00.000Z"),
        })),
        { id: "requested-day", userId: "user-1", status: "COMPLETED", completedAt: new Date("2026-10-24T12:00:00.000Z") },
    ];
    const { gte, lt } = query.where.completedAt;
    const selected = sessions
        .filter((session) => session.userId === query.where.userId
            && session.status === query.where.status
            && session.completedAt >= gte
            && session.completedAt < lt)
        .sort((first, second) => first.completedAt - second.completedAt)
        .slice(0, query.take);
    assert.deepEqual(selected.map(({ id }) => id), ["requested-day"]);
});
