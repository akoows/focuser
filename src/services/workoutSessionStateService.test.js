import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkoutEndUpdate } from "./workoutSessionStateService.js";

test("permite concluir ou abandonar somente uma sessão em andamento", () => {
    const timestamp = new Date("2026-07-10T15:30:00.000Z");
    const active = { status: "IN_PROGRESS" };

    assert.deepEqual(buildWorkoutEndUpdate(active, "COMPLETED", timestamp), {
        status: "COMPLETED",
        completedAt: timestamp,
    });
    assert.deepEqual(buildWorkoutEndUpdate(active, "ABANDONED", timestamp), {
        status: "ABANDONED",
        abandonedAt: timestamp,
    });
    assert.throws(() => buildWorkoutEndUpdate({ status: "COMPLETED" }, "COMPLETED"), {
        code: "INVALID_WORKOUT_STATE",
    });
    assert.throws(() => buildWorkoutEndUpdate(active, "IN_PROGRESS"), {
        code: "VALIDATION_ERROR",
    });
});
