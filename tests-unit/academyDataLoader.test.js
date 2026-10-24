import assert from 'node:assert/strict';
import test from 'node:test';
import { loadAcademySections, readWorkoutTimer, workoutSessionStorageKey } from '../src/pages/academy/academyDataLoader.js';

function createAcademyApi(overrides = {}) {
  const api = {
    plans: async () => ({ items: ['plan'] }),
    activeSession: async () => ({ session: { id: 'session-1' } }),
    sessions: async () => ({ items: ['session'], pagination: { page: 1, totalPages: 1 } }),
    stats: async () => ({ exercises: [] }),
    calendar: async () => ({ days: [] }),
  };
  return { gym: { ...api, ...overrides } };
}

test('workout session storage key is scoped to the session id', () => {
  assert.equal(workoutSessionStorageKey('session-123'), 'focuser:gym-rest-timer:session-123');
  assert.throws(() => workoutSessionStorageKey(), /sessionId is required/);
});

test('readWorkoutTimer restores valid data and safely handles invalid JSON, invalid shapes, and blocked storage', () => {
  const values = new Map([[workoutSessionStorageKey('s1'), JSON.stringify({ endsAt: 100, duration: 90, remaining: 75, paused: false })]]);
  const storage = { getItem: (key) => values.get(key) ?? null };
  assert.deepEqual(readWorkoutTimer(storage, 's1'), {
    timer: { endsAt: 100, duration: 90, remaining: 75, paused: false },
    error: null,
  });
  values.set(workoutSessionStorageKey('s2'), '{broken');
  assert.equal(readWorkoutTimer(storage, 's2').timer, null);
  values.set(workoutSessionStorageKey('s3'), JSON.stringify({ remaining: -2 }));
  assert.equal(readWorkoutTimer(storage, 's3').timer, null);
  assert.match(readWorkoutTimer(() => { throw new Error('blocked'); }, 's4').error, /treino ativo continua disponível/);
});

test('loadAcademySections returns each successful section even when a sibling request fails', async () => {
  const api = createAcademyApi({ stats: async () => { throw new Error('statistics unavailable'); } });
  const result = await loadAcademySections(api, 3);
  assert.deepEqual(result.values.plans, { items: ['plan'] });
  assert.deepEqual(result.values.activeSession, { session: { id: 'session-1' } });
  assert.deepEqual(result.values.history, { items: ['session'], pagination: { page: 1, totalPages: 1 } });
  assert.equal(result.values.stats, undefined);
  assert.equal(result.errors.stats, 'statistics unavailable');
  assert.deepEqual(result.errors && Object.keys(result.errors), ['stats']);
  await assert.rejects(loadAcademySections(createAcademyApi(), 0), /page must be a positive integer/);
  await assert.rejects(loadAcademySections({ gym: {} }), /missing required section loaders/);
});
