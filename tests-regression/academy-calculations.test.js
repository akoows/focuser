import test from 'node:test';
import assert from 'node:assert/strict';

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours ? `${hours}h ${minutes}min` : `${minutes}min ${remainder.toString().padStart(2, '0')}s`;
}

function workoutSessionStorageKey(sessionId) {
  return `focuser:gym-rest-timer:${sessionId}`;
}

function exerciseImageKey(name) {
  return name.trim().toLocaleLowerCase();
}

function extractExerciseInitials(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] || '')
    .join('')
    .toLocaleUpperCase();
}

function calculateMondayOffset(year, monthIndex) {
  return (new Date(year, monthIndex, 1).getDay() + 6) % 7;
}

function calculateEstimated1RM(weight, reps) {
  if (!Number.isFinite(weight) || weight <= 0 || !Number.isFinite(reps) || reps <= 0) return 0;
  if (reps === 1) return weight;
  // Epley formula: weight * (1 + reps / 30)
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

function calculateSessionTotalVolume(exercises) {
  let totalVolume = 0;
  for (const ex of exercises || []) {
    for (const set of ex.sets || []) {
      if (set.completed && Number.isFinite(set.weight) && Number.isFinite(set.reps)) {
        totalVolume += set.weight * set.reps;
      }
    }
  }
  return totalVolume;
}

test('Academy calculations and formatting regression', async (t) => {
  await t.test('formatDuration formats seconds into human readable strings', () => {
    assert.equal(formatDuration(null), '—');
    assert.equal(formatDuration(undefined), '—');
    assert.equal(formatDuration(-10), '—');
    assert.equal(formatDuration(0), '0min 00s');
    assert.equal(formatDuration(45), '0min 45s');
    assert.equal(formatDuration(125), '2min 05s');
    assert.equal(formatDuration(3600), '1h 0min');
    assert.equal(formatDuration(3665), '1h 1min');
    assert.equal(formatDuration(7320), '2h 2min');
  });

  await t.test('extractExerciseInitials returns up to 2 uppercase letters correctly', () => {
    assert.equal(extractExerciseInitials('Supino Reto'), 'SR');
    assert.equal(extractExerciseInitials('agachamento livre com barra'), 'AL');
    assert.equal(extractExerciseInitials('   Barra  Fixa   '), 'BF');
    assert.equal(extractExerciseInitials('Cardio'), 'C');
    assert.equal(extractExerciseInitials(''), '');
  });

  await t.test('exerciseImageKey normalizes case and surrounding whitespace', () => {
    assert.equal(exerciseImageKey('  Supino Inclinado com Halteres  '), 'supino inclinado com halteres');
    assert.equal(exerciseImageKey('PUXADA ALTA'), 'puxada alta');
  });

  await t.test('workoutSessionStorageKey prefixes sessionId consistently', () => {
    assert.equal(workoutSessionStorageKey('session-987'), 'focuser:gym-rest-timer:session-987');
  });

  await t.test('calculateMondayOffset aligns calendar grid with Monday as day 0', () => {
    // 2026-10-01 was a Thursday: in Sunday=0 JS getDay(): Sunday=0, Mon=1, Tue=2, Wed=3, Thu=4 -> (4+6)%7 = 3 (offset 3)
    assert.equal(calculateMondayOffset(2026, 9), 3);
    // 2026-06-01 was a Monday -> (1+6)%7 = 0
    assert.equal(calculateMondayOffset(2026, 5), 0);
  });

  await t.test('calculateEstimated1RM and session total volume calculations', () => {
    // 1RM for single rep is weight itself
    assert.equal(calculateEstimated1RM(100, 1), 100);
    // 1RM for 100kg x 10 reps = 100 * (1 + 10/30) = 133.3
    assert.equal(calculateEstimated1RM(100, 10), 133.3);
    // Invalid inputs return 0
    assert.equal(calculateEstimated1RM(0, 10), 0);
    assert.equal(calculateEstimated1RM(100, -1), 0);

    // Total volume sums completed sets only
    const sampleExercises = [
      {
        name: 'Supino',
        sets: [
          { weight: 80, reps: 10, completed: true },   // 800
          { weight: 80, reps: 8, completed: true },    // 640
          { weight: 80, reps: 6, completed: false },   // ignored (not completed)
        ],
      },
      {
        name: 'Crucifixo',
        sets: [
          { weight: 20, reps: 12, completed: true },   // 240
        ],
      },
    ];
    assert.equal(calculateSessionTotalVolume(sampleExercises), 1680);
  });
});
