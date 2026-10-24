import test from "node:test";
import assert from "node:assert/strict";
import { calculateWorkoutStats, countCompletedSessionsByDate } from "./workoutStatsService.js";

const sessions = [
    {
        id: "finished",
        status: "COMPLETED",
        planName: "Treino A",
        completedAt: new Date("2026-06-15T10:00:00.000Z"),
        exercises: [{
            name: "Agachamento",
            sets: [
                { weight: 100, reps: 5, completed: true },
                { weight: 80, reps: 8, completed: true },
                { weight: 200, reps: 0, completed: true },
                { weight: 150, reps: 2, completed: false },
            ],
        }],
    },
    {
        id: "abandoned",
        status: "ABANDONED",
        completedAt: new Date("2026-06-16T10:00:00.000Z"),
        exercises: [{ name: "Agachamento", sets: [{ weight: 300, reps: 1, completed: true }] }],
    },
];

test("calcula médias de repetições, carga máxima e estimativa apenas com séries concluídas válidas", () => {
    const result = calculateWorkoutStats(sessions);

    assert.equal(result.sessionsTotal, 1);
    assert.equal(result.totalCompletedSets, 2);
    assert.equal(result.totalVolume, 1_140);
    assert.equal(result.averageReps, 6.5);
    assert.equal(result.exercises[0].bestWeight, 100);
    assert.equal(result.exercises[0].bestRepSet.weight, 80);
    assert.equal(result.exercises[0].bestRepSet.reps, 8);
    assert.equal(result.exercises[0].bestSet.weight, 100);
    assert.equal(result.exercises[0].bestSet.reps, 5);
    assert.equal(result.exercises[0].bestSet.estimatedOneRepMax, 100 * (1 + 5 / 30));
    assert.equal(result.repetitionsBySession.length, 1);
    assert.equal(result.repetitionsBySession[0].averageReps, 6.5);
    assert.equal(result.repetitionsByWeek[0].averageReps, 6.5);
    assert.equal(result.repetitionsByMonth[0].sessions, 1);
    assert.equal(result.volumeBySession[0].volume, 1_140);
    assert.equal(result.volumeByWeek[0].volume, 1_140);
    assert.equal(result.volumeByMonth[0].volume, 1_140);
    assert.equal(result.exercises[0].history[0].volume, 1_140);
});

test("não estima 1RM sem uma série válida nem conta sessões abandonadas no calendário", () => {
    const noEstimate = [{
        ...sessions[0],
        exercises: [{
            name: "Corrida",
            sets: [{ weight: 0, reps: 10, completed: true }],
        }],
    }];
    assert.equal(calculateWorkoutStats(noEstimate).exercises[0].bestSet, null);
    const singleRep = [{
        ...sessions[0],
        exercises: [{ name: "Supino", sets: [{ weight: 100, reps: 1, completed: true }] }],
    }];
    assert.equal(calculateWorkoutStats(singleRep).exercises[0].bestSet.estimatedOneRepMax, 100);

    const counts = countCompletedSessionsByDate(sessions, () => "2026-06-15");
    assert.equal(counts.get("2026-06-15"), 1);
});

test("não mostra média de repetições para sessões sem séries concluídas", () => {
    const result = calculateWorkoutStats([{
        id: "empty",
        status: "COMPLETED",
        completedAt: new Date("2026-06-15T10:00:00.000Z"),
        exercises: [],
    }]);

    assert.equal(result.sessionsTotal, 1);
    assert.equal(result.averageReps, null);
    assert.equal(result.totalVolume, 0);
    assert.equal(result.repetitionsBySession.length, 0);
    assert.equal(result.repetitionsByWeek.length, 0);
    assert.equal(result.repetitionsByMonth.length, 0);
    assert.equal(result.volumeBySession.length, 0);
    assert.equal(result.volumeByWeek.length, 0);
    assert.equal(result.volumeByMonth.length, 0);
});
