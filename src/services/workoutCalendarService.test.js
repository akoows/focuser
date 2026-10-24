import assert from "node:assert/strict";
import test from "node:test";
import { buildWorkoutCalendarQuery } from "./workoutCalendarService.js";

test("calendar query bounds one local day before applying the 100-item cap", () => {
    const query = buildWorkoutCalendarQuery("user-1", "2026-10-24", "America/Sao_Paulo");
    assert.deepEqual(query, {
        where: {
            userId: "user-1",
            status: "COMPLETED",
            completedAt: {
                gte: new Date("2026-10-24T03:00:00.000Z"),
                lt: new Date("2026-10-25T03:00:00.000Z"),
            },
        },
        orderBy: { completedAt: "asc" },
        take: 100,
    });
});

test("local midnight query bounds adjust across a daylight-saving transition", () => {
    const query = buildWorkoutCalendarQuery("user-1", "2026-03-08", "America/New_York");
    assert.equal(query.where.completedAt.gte.toISOString(), "2026-03-08T05:00:00.000Z");
    assert.equal(query.where.completedAt.lt.toISOString(), "2026-03-09T04:00:00.000Z");
});
