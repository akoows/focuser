import test from "node:test";
import assert from "node:assert/strict";
import {
    workoutPlanSchema,
    workoutSessionExerciseSchema,
    workoutSetSchema,
    workoutStartSchema,
} from "./index.js";

test("fichas aceitam rotinas livres ordenadas e aplicam valores padrão seguros", () => {
    const result = workoutPlanSchema.safeParse({
        name: "Push",
        exercises: [{ name: "Supino reto" }, { name: "Desenvolvimento", plannedSets: 4, repTarget: "6-8", restSeconds: 120 }],
    });

    assert.equal(result.success, true);
    assert.equal(result.data.exercises[0].plannedSets, 3);
    assert.equal(result.data.exercises[0].restSeconds, 90);
    assert.equal(result.data.exercises[1].plannedSets, 4);
});

test("valida limites de carga, repetições, descansos e campos aceitos", () => {
    assert.equal(workoutPlanSchema.safeParse({ name: "A", extra: true }).success, false);
    assert.equal(workoutPlanSchema.safeParse({ name: "A", exercises: [{ name: "Agachamento", repTarget: "muitas" }] }).success, false);
    assert.equal(workoutPlanSchema.safeParse({ name: "A", exercises: [{ name: "Agachamento", repTarget: "12-8" }] }).success, false);
    assert.equal(workoutSessionExerciseSchema.safeParse({ name: "Agachamento", restSeconds: 901 }).success, false);
    assert.equal(workoutSetSchema.safeParse({ weight: -1, reps: 8 }).success, false);
    assert.equal(workoutSetSchema.safeParse({ weight: 50, reps: 0 }).success, false);
    assert.equal(workoutSetSchema.safeParse({ weight: 50, reps: 8, completed: true }).success, true);
    assert.equal(workoutStartSchema.safeParse({ planId: "not-an-object-id" }).success, false);
});
